"""Sarvam adapter (STT / TTS). Request fields follow https://docs.sarvam.ai/api-reference-docs/speech-to-text/transcribe
and .../text-to-speech/convert. Mock returns canned transcripts and a soft chime."""
import asyncio
import base64
import io
import logging
import math
import struct
import wave
from typing import Protocol

import httpx

import config
from services import audio

log = logging.getLogger("sakhi.sarvam")

MOCK_TRANSCRIPTS = {
    "hi-IN": "Mere periods 3 mahine se nahi aaye, chehre pe bahut pimples hain aur chin hair bhi aa rahe hain.",
    "kn-IN": "Nanage 3 months inda mutt barlilla, mukhada mele tumba pimples ide.",
    "ta-IN": "Enakku 3 months-a period varala, mugathil pimples romba irukku.",
    "en-IN": "My periods haven't come for 3 months and I have a lot of pimples and some chin hair.",
}
STT_LANGS = {"hi-IN", "bn-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN", "en-IN", "gu-IN", "as-IN",
             "ur-IN", "ne-IN", "kok-IN", "ks-IN", "sd-IN", "sa-IN", "sat-IN", "mni-IN", "brx-IN", "mai-IN", "doi-IN"}
TTS_LANGS = {"bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN"}


class SpeechError(Exception):
    pass


class Speech(Protocol):
    async def stt(self, audio_bytes: bytes, lang: str, mode: str) -> dict: ...
    async def tts(self, text: str, lang: str) -> tuple[bytes, str]: ...


def chunk_text(text: str, limit: int = config.TTS_MAX_CHARS) -> list[str]:
    """Splits on sentence ends (incl. Devanagari danda) so each TTS request stays under the character limit."""
    chunks, cur = [], ""
    for part in text.replace("।", "।|").replace(". ", ".|").replace("? ", "?|").split("|"):
        if len(cur) + len(part) + 1 > limit and cur:
            chunks.append(cur.strip())
            cur = ""
        while len(part) > limit:
            chunks.append(part[:limit])
            part = part[limit:]
        cur += part + " "
    if cur.strip():
        chunks.append(cur.strip())
    return chunks


def _chime_wav(seconds: float = 1.1, rate: int = 16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = bytearray()
        for i in range(int(seconds * rate)):
            t = i / rate
            env = min(1.0, t * 30) * math.exp(-3.2 * t)
            f = 660 if t < seconds / 2 else 880
            frames += struct.pack("<h", int(9000 * env * math.sin(2 * math.pi * f * t)))
        w.writeframes(bytes(frames))
    return buf.getvalue()


class MockSarvam:
    _chime = _chime_wav()

    async def stt(self, audio_bytes: bytes, lang: str, mode: str = "codemix") -> dict:
        code = lang if lang in MOCK_TRANSCRIPTS else "hi-IN"
        return {"transcript": MOCK_TRANSCRIPTS[code], "lang": code, "confidence": None}

    async def tts(self, text: str, lang: str) -> tuple[bytes, str]:
        return self._chime, "audio/wav"


class SarvamAdapter:
    def __init__(self):
        self.client = httpx.AsyncClient(
            base_url=config.SARVAM_BASE_URL,
            headers={"api-subscription-key": config.SARVAM_API_KEY},
            timeout=httpx.Timeout(config.SARVAM_TIMEOUT_S, connect=5),
        )
        self.speakers = {code: l.get("tts_speaker") for code, l in config.LANG_BY_CODE.items()}

    async def _post(self, path: str, **kwargs) -> dict:
        # One retry on timeouts, rate limits, and server errors; client errors fail fast.
        for attempt in (1, 2):
            try:
                r = await self.client.post(path, **kwargs)
            except httpx.TransportError as e:
                if attempt == 2:
                    raise SpeechError(f"{path}: {type(e).__name__}") from e
                await asyncio.sleep(0.4)
                continue
            if r.status_code == 200:
                return r.json()
            msg = r.text[:300]
            if r.status_code in (429, 500, 502, 503, 504) and attempt == 1:
                log.warning("%s %s, retrying", path, r.status_code)
                await asyncio.sleep(0.6)
                continue
            raise SpeechError(f"{path} {r.status_code}: {msg}")
        raise SpeechError(f"{path}: failed")

    async def stt(self, audio_bytes: bytes, lang: str, mode: str = "codemix") -> dict:
        wav, filename, seconds = await audio.prepare_for_stt(audio_bytes)
        if seconds is not None and seconds < 0.3:
            return {"transcript": "", "lang": lang, "confidence": 0}
        model = config.SARVAM_STT_MODEL
        # English-UI users in India often speak Hinglish, so English selection lets Sarvam detect the language.
        language_code = lang if lang in STT_LANGS and lang != "en-IN" else "unknown"
        data = {"model": model, "language_code": language_code}
        if model.startswith("saaras:v3"):
            data["mode"] = mode  # the docs say `mode` only applies to saaras:v3
        mime = "audio/wav" if filename.endswith(".wav") else "application/octet-stream"
        res = await self._post("/speech-to-text", data=data, files={"file": (filename, wav, mime)})
        return {"transcript": (res.get("transcript") or "").strip(), "lang": res.get("language_code") or lang,
                "confidence": res.get("language_probability")}

    async def _tts_chunk(self, text: str, lang: str) -> bytes:
        body = {"text": text, "language_code": lang, "model": config.SARVAM_TTS_MODEL,
                "pace": config.TTS_PACE, "speech_sample_rate": config.TTS_SAMPLE_RATE, "output_audio_codec": "wav"}
        if self.speakers.get(lang):
            body["speaker"] = self.speakers[lang]
        res = await self._post("/text-to-speech", json=body)
        audios = res.get("audios") or []
        if not audios:
            raise SpeechError("text-to-speech returned no audio")
        return base64.b64decode(audios[0])

    async def transliterate(self, text: str, lang: str) -> str:
        """Romanized Indic (e.g. Hinglish) to native script, so the voice pronounces it as Hindi, not English."""
        out = []
        for chunk in chunk_text(text, 900):  # the transliterate API takes short inputs
            res = await self._post("/transliterate", json={"input": chunk, "source_language_code": "en-IN",
                                                           "target_language_code": lang, "spoken_form": True})
            out.append(res.get("transliterated_text") or chunk)
        return " ".join(out)

    async def tts(self, text: str, lang: str) -> tuple[bytes, str]:
        if lang.endswith("-Latn"):
            lang = lang[:-5]
            try:
                text = await self.transliterate(text, lang)
            except SpeechError as e:
                log.warning("transliterate failed, speaking romanized text: %s", e)
        if lang not in TTS_LANGS:
            raise SpeechError(f"TTS not available for {lang}")
        chunks = await asyncio.gather(*(self._tts_chunk(c, lang) for c in chunk_text(text)))
        return await audio.combine_tts(list(chunks))


def get_speech() -> Speech:
    return MockSarvam() if config.MOCK_SPEECH else SarvamAdapter()
