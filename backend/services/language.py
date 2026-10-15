"""Works out which language AND script the user is writing in, so replies mirror her: Hinglish in, Hinglish out.

Order: a native Indic script in the text decides it locally; Latin text goes to Sarvam's language identification
(which tells English from romanized Hindi/Kannada/Tamil...); if Sarvam is unavailable, a small word list catches
Hinglish. Romanized styles get a code like "hi-IN-Latn"; base_code() maps it back for TTS, templates and Sarvam."""
import hashlib
import logging
import re
from dataclasses import dataclass
from typing import Optional

import httpx

import config

log = logging.getLogger("nola.language")

_SCRIPTS = [  # (unicode range, language code, script name)
    (r"[ऀ-ॿ]", "hi-IN", "Devanagari"), (r"[ঀ-৿]", "bn-IN", "Bengali"),
    (r"[਀-੿]", "pa-IN", "Gurmukhi"), (r"[઀-૿]", "gu-IN", "Gujarati"),
    (r"[଀-୿]", "od-IN", "Odia"), (r"[஀-௿]", "ta-IN", "Tamil"),
    (r"[ఀ-౿]", "te-IN", "Telugu"), (r"[ಀ-೿]", "kn-IN", "Kannada"),
    (r"[ഀ-ൿ]", "ml-IN", "Malayalam"), (r"[؀-ۿ]", "ur-IN", "Arabic"),
]
_SCRIPTS = [(re.compile(p), code, name) for p, code, name in _SCRIPTS]
_NATIVE_SCRIPT = {code: name for _, code, name in _SCRIPTS} | {"mr-IN": "Devanagari"}

# Fallback only (Sarvam LID is the primary signal). Common Hinglish function words, unlikely in English text.
_HINGLISH = set("""hai hain hu hoon ho tha thi nahi nahin nhi mujhe mujhko mera meri mere tum tumhe aap aapko kya kyu kyun
kaise kaisa kab bahut bohot bhut zyada thoda kuch koi raha rahi rahe karna karti karta kar lag lagta lagti hota hoti
yaar accha acha theek thik matlab abhi phir aur lekin se ko ka ki ke mein bhi sab""".split())
_ROMAN_EXAMPLE = {
    "hi-IN": "Main samajh sakti hoon, yeh sach mein tough lag raha hoga. Thoda rest karo.",
    "kn-IN": "Naanu artha madkolthini, idu nijavaagi kashta. Swalpa rest maadi.",
    "ta-IN": "Enakku puriyudhu, idhu romba kashtama irukkum. Konjam rest edunga.",
    "te-IN": "Naaku ardham avutundi, idi chala kashtam ga undi. Konchem rest teeskondi.",
}


@dataclass(frozen=True)
class ReplyLanguage:
    base: str            # Sarvam language code, e.g. hi-IN
    romanized: bool      # Indic language written in Latin letters (Hinglish etc.)

    @property
    def code(self) -> str:
        return f"{self.base}-Latn" if self.romanized else self.base

    @property
    def prompt_label(self) -> str:
        return prompt_label(self.code)


def base_code(code: str) -> str:
    return code[:-5] if code.endswith("-Latn") else code


def is_romanized(code: str) -> bool:
    return code.endswith("-Latn")


def prompt_label(code: str) -> str:
    """Language instruction used as {LANG_NAME} in prompts."""
    base = base_code(code)
    name = config.LANG_BY_CODE.get(base, {}).get("english_name", "English")
    if not is_romanized(code):
        return name
    style = "Hinglish" if base == "hi-IN" else f"romanized {name}"
    example = _ROMAN_EXAMPLE.get(base, "")
    return (f"{style} ({name} written in Roman/English letters, mixed naturally with English words, exactly the way she "
            f"writes; never use {_NATIVE_SCRIPT.get(base, 'the native')} script{'; e.g. “' + example + '”' if example else ''})")


def _native(text: str, ui_lang: str) -> Optional[str]:
    counts = [(len(p.findall(text)), code) for p, code, _ in _SCRIPTS]
    n, code = max(counts)
    if n < 2:
        return None
    if code == "hi-IN" and ui_lang in ("mr-IN", "ne-IN", "mai-IN", "kok-IN"):
        return ui_lang  # Devanagari is shared; trust the picked language
    return code


def _hinglish_words(text: str) -> int:
    return sum(1 for w in re.findall(r"[a-z]+", text.lower()) if w in _HINGLISH)


class LanguageDetector:
    def __init__(self):
        self._cache: dict[str, Optional[tuple[str, str]]] = {}
        self._client: Optional[httpx.AsyncClient] = None

    async def _sarvam_lid(self, text: str) -> Optional[tuple[str, str]]:
        if config.MOCK_SPEECH:
            return None
        key = hashlib.sha1(text.encode()).hexdigest()
        if key in self._cache:
            return self._cache[key]
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=config.SARVAM_BASE_URL, timeout=6,
                                             headers={"api-subscription-key": config.SARVAM_API_KEY})
        result = None
        try:
            r = await self._client.post("/text-lid", json={"input": text[:1000]})
            if r.status_code == 200:
                d = r.json()
                if d.get("language_code"):
                    result = (d["language_code"], d.get("script_code") or "")
            else:
                log.warning("text-lid %s: %s", r.status_code, r.text[:200])
        except httpx.HTTPError as e:
            log.warning("text-lid failed: %s", type(e).__name__)
        if len(self._cache) > 2000:
            self._cache.clear()
        self._cache[key] = result
        return result

    async def detect(self, text: str, ui_lang: str = "en-IN", previous: Optional[str] = None) -> ReplyLanguage:
        """previous = the code detected for her last message; short or ambiguous messages ("ok thanks") keep it."""
        native = _native(text, ui_lang)
        if native:
            return ReplyLanguage(native, False)
        words = re.findall(r"[^\W\d_]+", text)
        hinglish_hits = _hinglish_words(text)
        lid = await self._sarvam_lid(text) if len(words) >= 2 else None
        if lid and lid[0] != "en-IN" and lid[0] in config.LANG_BY_CODE:
            return ReplyLanguage(lid[0], lid[1] in ("Latn", ""))
        # Without Sarvam, or when it calls clearly code-mixed text English, the word list decides.
        if hinglish_hits >= (2 if not lid else 3):
            return ReplyLanguage("hi-IN", True)
        if previous and (len(words) <= 3 or (hinglish_hits >= 1 and is_romanized(previous))):
            return ReplyLanguage(base_code(previous), is_romanized(previous))
        return ReplyLanguage("en-IN", False)


detector = LanguageDetector()
