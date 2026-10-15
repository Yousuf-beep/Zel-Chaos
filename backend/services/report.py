"""Doctor-visit report for one conversation: what she shared, in a form she can hand to a doctor.

The model writes only the patient-reported summary (ConversationSummary), checked by the same regex guardrail as the
chat; on failure it falls back to a deterministic summary built from the glossary. Everything else is filled in
deterministically: her profile, cycle status, the general suggestions Nola gave, every time Nola suggested seeing a
doctor, and the full transcript. Saved (sealed) on the conversation and regenerated only when new messages arrive."""
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field

import config
from services import guardrail
from services.cycle import CycleStatus, cycles, describe as describe_cycle
from services.language import prompt_label
from services.memory import Memory, memory as default_memory
from services.profile import ProfileStore, describe as describe_profile, profiles as default_profiles

log = logging.getLogger("nola.report")
_TRANSCRIPT_CHARS = 24000  # newest messages win when a chat is very long


class SymptomNote(BaseModel):
    symptom: str
    since: str = ""
    her_words: str = ""


class ConversationSummary(BaseModel):
    summary: str
    main_concerns: list[str] = Field(default_factory=list)
    symptoms: list[SymptomNote] = Field(default_factory=list)
    feelings: str = ""
    lifestyle: list[str] = Field(default_factory=list)
    already_tried: list[str] = Field(default_factory=list)
    questions_for_doctor: list[str] = Field(default_factory=list)
    summary_her_language: str = ""

    def our_voice(self) -> list[str]:
        """Fields written in the app's voice; her quotes and what she tried are her report and are not filtered."""
        return [self.summary, self.feelings, self.summary_her_language, *self.main_concerns, *self.lifestyle,
                *self.questions_for_doctor, *(s.symptom for s in self.symptoms)]


class DoctorFlag(BaseModel):
    level: str
    message: str
    at: float


class TranscriptLine(BaseModel):
    role: str
    text: str
    at: float
    suggestions: list[str] = Field(default_factory=list)
    question: str = ""


class Report(BaseModel):
    conversation_id: str
    title: str
    name: str
    generated_at: float
    started_at: float
    language: str
    summary: ConversationSummary
    profile: str
    cycle: str
    suggestions_given: list[str]
    doctor_flags: list[DoctorFlag]
    transcript: list[TranscriptLine]
    model_written: bool


class NotEnough(Exception):
    pass


def _since(days: Optional[int]) -> str:
    if not days:
        return ""
    return f"about {round(days / 30)} months" if days >= 60 else f"about {days} days"


async def _mock_summary(user_texts: list[str], lang: str) -> ConversationSummary:
    from adapters.llm import GLOSSARY, MockLLM
    ex = await MockLLM().extract("\n".join(user_texts), lang)
    symptoms = [SymptomNote(symptom=GLOSSARY.get(s.name, {}).get("en", s.name.replace("_", " ")), since=_since(s.duration_days),
                            her_words=f"“{s.verbatim}”" if s.verbatim and s.verbatim != "(selected)" else "") for s in ex.symptoms]
    first = user_texts[0].strip()
    opening = first[:220] + ("…" if len(first) > 220 else "")
    concerns = [t.symptom for t in symptoms[:5]] or [first[:120] + ("…" if len(first) > 120 else "")]
    return ConversationSummary(
        summary=f"She opened the chat with: “{opening}” She sent {len(user_texts)} message(s) in all; "
                "her full words are in the transcript.",
        main_concerns=concerns, symptoms=symptoms,
        questions_for_doctor=["What could be causing what I am noticing?", "Do I need any tests, and why?",
                              "What can I do day to day to feel better?"])


def _line(m: dict) -> TranscriptLine:
    if m["role"] != "assistant":
        return TranscriptLine(role=m["role"], text=m["text"], at=m["at"])
    return TranscriptLine(role="assistant", text=m.get("reply") or m["text"], at=m["at"],
                          suggestions=m.get("suggestions", []), question=m.get("question", ""))


class ReportService:
    def __init__(self, mem: Memory | None = None, profile_store: ProfileStore | None = None, client=None):
        self.memory = mem or default_memory
        self.profiles = profile_store or default_profiles
        self._client = client
        self.use_model = client is not None or not config.MOCK_LLM

    @property
    def client(self):
        if self._client is None:
            from adapters.groq import GroqClient
            self._client = GroqClient()
        return self._client

    async def _model_summary(self, transcript: str, lang: str) -> Optional[ConversationSummary]:
        from adapters.groq import render
        system = render("report", LANG_NAME=prompt_label(lang))
        user = f"Conversation (newest last):\n{transcript}"
        for attempt in range(2):
            try:
                s = await self.client.structured(system, user, ConversationSummary, max_tokens=2500)
            except Exception as e:
                log.warning("report model failed: %s %s", type(e).__name__, str(e)[:200])
                return None
            problems = guardrail.text_violations(s.our_voice())
            if not problems:
                for sym in s.symptoms:
                    q = sym.her_words.strip().strip('"“”')
                    sym.her_words = f"“{q}”" if q else ""
                return s
            log.info("report guardrail fail #%d: %s", attempt + 1, problems)
            user += f"\n\n[Your previous draft was rejected for {problems}. Remove every diagnosis word, condition name and medicine.]"
        return None

    async def build(self, uid: str, name: str, cid: str, force: bool = False) -> Report:
        """KeyError if the conversation is not hers; NotEnough if she has not said anything yet."""
        conv = await self.memory.conversation(uid, cid)
        if conv is None:
            raise KeyError(cid)
        msgs = await self.memory.messages(uid, cid)
        user_msgs = [m for m in msgs if m["role"] == "user"]
        if not user_msgs:
            raise NotEnough()
        saved, count = await self.memory.report(uid, cid)
        if saved and count == len(msgs) and not force:
            try:
                return Report.model_validate(saved)
            except ValueError:
                pass  # older shape; rebuild

        lang = next((m.get("reply_lang") for m in reversed(user_msgs) if m.get("reply_lang")), "en-IN")
        lines, size = [], 0
        for m in reversed(msgs):
            who = "Her" if m["role"] == "user" else "Nola"
            line = f"[{datetime.fromtimestamp(m['at']).strftime('%d %b %H:%M')}] {who}: {m['text']}"
            size += len(line)
            if size > _TRANSCRIPT_CHARS:
                break
            lines.append(line)
        summary = await self._model_summary("\n".join(reversed(lines)), lang) if self.use_model else None
        model_written = summary is not None
        summary = summary or await _mock_summary([m["text"] for m in user_msgs], lang)

        suggestions = list(dict.fromkeys(s for m in msgs if m["role"] == "assistant" for s in m.get("suggestions", [])))[:12]
        flags = []
        for m in msgs:
            a = m.get("alert")
            if isinstance(a, dict) and a.get("level") not in (None, "none"):
                flags.append(DoctorFlag(level=a["level"], message=a.get("message", ""), at=m["at"]))
            elif isinstance(a, str) and a != "none":
                flags.append(DoctorFlag(level=a, message="", at=m["at"]))
        cyc: Optional[CycleStatus] = await cycles.status(uid)
        report = Report(
            conversation_id=cid, title=conv["title"] or "Chat with Nola", name=name, language=lang,
            generated_at=datetime.now(timezone.utc).timestamp(), started_at=msgs[0]["at"], summary=summary,
            profile=describe_profile(await self.profiles.get(uid)),
            cycle=describe_cycle(cyc) if cyc else "",
            suggestions_given=suggestions, doctor_flags=flags[-6:], model_written=model_written,
            transcript=[_line(m) for m in msgs])
        await self.memory.set_report(uid, cid, json.loads(report.model_dump_json()), len(msgs))
        return report


reports = ReportService()
