"""Sakhi companion chat: sentiment-first support that listens, reassures and suggests, but never diagnoses or prescribes.
Safety order: deterministic red-flag scan -> model reply -> regex guardrail (one regeneration, then a safe reply).
The alert level is the higher of the rules and the model; the model can raise it, never lower it."""
import asyncio
import logging
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

import config
from services import guardrail, rules
from services.cycle import CycleStatus, cycles, describe
from services.language import base_code, detector, is_romanized, prompt_label
from services.memory import Memory, memory as default_memory

log = logging.getLogger("sakhi.companion")

Sentiment = Literal["positive", "neutral", "worried", "anxious", "sad", "frustrated", "embarrassed", "distressed"]
AlertLevel = Literal["none", "soon", "now", "emergency", "crisis"]
_ALERT_ORDER = {"none": 0, "soon": 1, "now": 2, "emergency": 3, "crisis": 3}


class CompanionTurn(BaseModel):
    reply: str
    sentiment: Sentiment = "neutral"
    distress: int = Field(0, ge=0, le=3)
    see_doctor: Literal["no", "soon", "now"] = "no"
    doctor_reason: str = ""
    suggestions: list[str] = Field(default_factory=list)
    question: str = ""

    @field_validator("sentiment", mode="before")
    @classmethod
    def _known_sentiment(cls, v):
        return v if v in Sentiment.__args__ else "neutral"  # type: ignore[attr-defined]

    @field_validator("suggestions")
    @classmethod
    def _cap(cls, v):
        return [s.strip() for s in v if s and s.strip()][:3]

    def texts(self) -> list[str]:
        return [self.reply, self.doctor_reason, self.question, *self.suggestions]

    def as_history_text(self) -> str:
        parts = [self.reply]
        if self.suggestions:
            parts.append("Suggestions: " + "; ".join(self.suggestions))
        if self.question:
            parts.append(self.question)
        return "\n".join(parts)


class Alert(BaseModel):
    level: AlertLevel
    message: str = ""
    numbers: list[dict] = Field(default_factory=list)


class CompanionResponse(BaseModel):
    reply: str
    suggestions: list[str]
    question: str
    sentiment: str
    distress: int
    alert: Alert
    cycle: Optional[CycleStatus] = None
    safe_fallback: bool = False
    reply_lang: str = "en-IN"  # detected from her message, e.g. hi-IN-Latn for Hinglish


_NOW_MSG = {"hi-IN-Latn": "Please aaj hi kisi doctor se baat karo. Agar takleef zyada hai ya badh rahi hai, toh nazdeeki hospital jao ya 112 / 108 par call karo.",
            "en-IN": "Please speak to a doctor today. If it feels severe or is getting worse, go to the nearest hospital or call 112 / 108.",
            "hi-IN": "कृपया आज ही किसी डॉक्टर से बात करें। अगर तकलीफ़ ज़्यादा है या बढ़ रही है, तो नज़दीकी अस्पताल जाएँ या 112 / 108 पर कॉल करें।"}
_SOON_MSG = {"hi-IN-Latn": "Agle kuch dinon mein doctor ko dikhana accha rahega. Sarkari hospital, PHC, ya eSanjeevani (free teleconsultation) kam kharche wale options hain.",
             "en-IN": "It would be good to see a doctor in the next few days. A government hospital, PHC, or eSanjeevani (free teleconsultation) are low-cost options.",
             "hi-IN": "अगले कुछ दिनों में डॉक्टर को दिखाना अच्छा रहेगा। सरकारी अस्पताल, PHC, या eSanjeevani (मुफ़्त टेलीकंसल्टेशन) कम खर्च वाले विकल्प हैं।"}
_SAFE_REPLY = {"en-IN": CompanionTurn(reply="Thank you for telling me this. What you are feeling matters, and you don't have to figure it out alone. "
                                           "I can't say what is causing it — only a doctor can — but I'm here to listen and help you feel ready to talk to one.",
                                     question="Would you like to tell me a little more about how this has been affecting your day?",
                                     sentiment="neutral"),
              "hi-IN-Latn": CompanionTurn(reply="Mujhse yeh share karne ke liye thank you. Tum jo feel kar rahi ho woh important hai, aur tumhe yeh akele nahi sambhalna. "
                                                "Iski wajah kya hai, yeh sirf doctor bata sakte hain, lekin main sunne ke liye yahan hoon aur doctor se baat karne ki taiyari mein help kar sakti hoon.",
                                          question="Kya tum thoda aur bataogi ki isse tumhara din kaise affect ho raha hai?",
                                          sentiment="neutral")}


def _localised(table: dict, lang: str):
    # Romanized styles never fall back to native script: she is typing in English letters.
    return table.get(lang) or (table["en-IN"] if is_romanized(lang) else table.get(base_code(lang)) or table["en-IN"])


def _alert(flags: list, turn: CompanionTurn, cyc: Optional[CycleStatus], lang: str) -> Alert:
    tier = rules.stopping_tier(flags)
    if tier:
        p = rules.urgent_payload(flags, "en-IN" if is_romanized(lang) else lang)
        return Alert(level=tier, message=" ".join(b["message"] for b in p["blocks"]),
                     numbers=[n for b in p["blocks"] for n in b["numbers"]])
    level = {"no": "none", "soon": "soon", "now": "now"}[turn.see_doctor]
    if turn.distress >= 3:
        level = "now"
    if any(f.tier == "PROMPT" for f in flags) or (cyc and cyc.cycle_day > 90):
        level = max(level, "soon", key=_ALERT_ORDER.__getitem__)
    if level == "now":
        return Alert(level="now", message=_localised(_NOW_MSG, lang),
                     numbers=[{"label": "Emergency", "number": "112"}, {"label": "Ambulance", "number": "108"}])
    if level == "soon":
        return Alert(level="soon", message=turn.doctor_reason or _localised(_SOON_MSG, lang))
    return Alert(level="none")


_LEX = {"distressed": ["can't take", "cant take", "unbearable", "hopeless", "breaking down", "bahut pareshan"],
        "anxious": ["anxious", "anxiety", "panic", "nervous", "ghabrahat", "tension"],
        "worried": ["worried", "scared", "afraid", "fear", "dar lag", "chinta", "late"],
        "sad": ["sad", "low", "cry", "crying", "lonely", "udaas", "dukhi"],
        "frustrated": ["frustrated", "irritated", "angry", "fed up", "gussa"],
        "embarrassed": ["embarrassed", "ashamed", "awkward", "sharam"],
        "positive": ["better", "good", "happy", "relieved", "thanks", "thank you", "accha"]}


class MockCompanion:
    """Deterministic stand-in used in MOCK_MODE and tests."""

    async def respond(self, system: str, history: list[dict], text: str, lang: str) -> CompanionTurn:
        low = text.lower()
        sentiment = next((s for s, words in _LEX.items() if any(w in low for w in words)), "neutral")
        distress = {"distressed": 2, "anxious": 1, "worried": 1, "sad": 1, "frustrated": 1}.get(sentiment, 0)
        suggestions = ["Try to keep regular, balanced meals and drink enough water.",
                       "Aim for 7–9 hours of sleep at a regular time.",
                       "A few minutes of slow breathing or a short walk can ease stress."]
        return CompanionTurn(reply="Thank you for sharing this with me. It makes sense to feel this way, and you did the right thing by talking about it.",
                             sentiment=sentiment, distress=distress, suggestions=suggestions,
                             question="How long have you been feeling like this?")

    async def notes(self, previous: str, convo: str) -> str:
        return previous


class GroqCompanion:
    def __init__(self):
        from adapters.groq import GroqClient
        self.client = GroqClient()

    async def respond(self, system: str, history: list[dict], text: str, lang: str) -> CompanionTurn:
        messages = [{"role": "system", "content": system}, *history, {"role": "user", "content": text}]
        data = await self.client.chat_json(messages, max_tokens=1200, effort="low", temperature=0.6)
        return CompanionTurn.model_validate(data)

    async def notes(self, previous: str, convo: str) -> str:
        from adapters.groq import render
        data = await self.client.chat_json(
            [{"role": "system", "content": render("companion_notes")},
             {"role": "user", "content": f"PREVIOUS NOTES:\n{previous or '(none yet)'}\n\nLATEST CONVERSATION:\n{convo}"}],
            max_tokens=700, effort="low", temperature=0.2)
        notes = str(data.get("notes", "")).strip()
        return notes[:1500] if notes and not guardrail.text_violations([notes]) else previous


def _fmt_date(ts: float) -> str:
    return datetime.fromtimestamp(ts).strftime("%d %b %Y")


class Companion:
    def __init__(self, engine=None, mem: Memory | None = None):
        self.engine = engine or (MockCompanion() if config.MOCK_LLM else GroqCompanion())
        self.memory = mem or default_memory
        self._notes_tasks: set[asyncio.Task] = set()

    async def _system(self, uid: str, name: str, lang: str, text: str, cyc: Optional[CycleStatus], flags: list) -> str:
        from adapters.groq import render
        recall = await self.memory.search(uid, text, skip_recent=config.HISTORY_RECENT_TURNS)
        recall_txt = "\n".join(f"- ({_fmt_date(m['at'])}) \"{m['text'][:300]}\"" for m in recall) or "(nothing relevant)"
        safety = ", ".join(f"{f.id} ({f.tier})" for f in flags) or "none"
        return render("companion", LANG_NAME=prompt_label(lang), TODAY=date.today().strftime("%A, %d %B %Y"),
                      NAME=name or "(not shared)", CYCLE=describe(cyc) if cyc else "She has not set up cycle tracking yet.",
                      NOTES=(await self.memory.notes(uid)) or "(first conversation, nothing yet)",
                      RECALL=recall_txt, SAFETY=safety)

    async def chat(self, uid: str, name: str, text: str, lang: str) -> CompanionResponse:
        text = text.strip()
        recent = await self.memory.messages(uid, last=config.HISTORY_RECENT_TURNS)
        previous = next((m.get("reply_lang") for m in reversed(recent) if m["role"] == "user" and m.get("reply_lang")), None)
        lang = (await detector.detect(text, lang, previous)).code  # e.g. hi-IN-Latn when she types Hinglish
        flags = rules.scan(text, lang)
        cyc = await cycles.status(uid)
        history = [{"role": m["role"], "content": m["text"]} for m in recent]
        system = await self._system(uid, name, lang, text, cyc, flags)

        turn, fallback = None, False
        prompt_text = text
        for attempt in range(2):
            try:
                candidate = await self.engine.respond(system, history, prompt_text, lang)
            except Exception as e:
                log.warning("companion model failed: %s %s", type(e).__name__, str(e)[:200])
                break
            problems = guardrail.text_violations(candidate.texts(), remedies=True)
            if not problems:
                turn = candidate
                break
            log.info("companion guardrail fail #%d: %s", attempt + 1, problems)
            prompt_text = (f"{text}\n\n[App note, not from her: your previous draft was blocked for {problems}. "
                           "Rewrite it without any diagnosis, condition guess, medicine, home or herbal remedy, supplement, dose, or numbers about weight/calories.]")
        if turn is None:
            turn, fallback = _localised(_SAFE_REPLY, lang).model_copy(), True
            if rules.stopping_tier(flags):
                turn.see_doctor = "now"

        alert = _alert(flags, turn, cyc, lang)
        if alert.level in ("emergency", "crisis"):
            turn.suggestions = []  # in an emergency the only advice is to get help now

        await self.memory.append(uid, "user", text, sentiment=turn.sentiment, distress=turn.distress, flags=[f.id for f in flags],
                                 reply_lang=lang)
        await self.memory.append(uid, "assistant", turn.as_history_text(), alert=alert.level, reply=turn.reply,
                                 suggestions=turn.suggestions, question=turn.question)
        self._maybe_refresh_notes(uid)
        return CompanionResponse(reply=turn.reply, suggestions=turn.suggestions, question=turn.question,
                                 sentiment=turn.sentiment, distress=turn.distress, alert=alert, cycle=cyc,
                                 safe_fallback=fallback, reply_lang=lang)

    def _maybe_refresh_notes(self, uid: str) -> None:
        async def run():
            try:
                if await self.memory.since_notes(uid) < config.NOTES_EVERY_MESSAGES:
                    return
                msgs = await self.memory.messages(uid, last=config.NOTES_EVERY_MESSAGES * 2)
                convo = "\n".join(f"{m['role']} ({_fmt_date(m['at'])}): {m['text']}" for m in msgs)
                previous = await self.memory.notes(uid)
                await self.memory.set_notes(uid, await self.engine.notes(previous, convo))
            except Exception as e:
                log.warning("notes refresh failed: %s", type(e).__name__)

        task = asyncio.create_task(run())
        self._notes_tasks.add(task)
        task.add_done_callback(self._notes_tasks.discard)

    async def history(self, uid: str) -> list[dict]:
        keep = ("role", "text", "at", "alert", "reply", "suggestions", "question", "sentiment")
        return [{k: m[k] for k in keep if k in m} for m in await self.memory.messages(uid, last=60)]

    async def forget(self, uid: str) -> None:
        await self.memory.clear(uid)


companion = Companion()
