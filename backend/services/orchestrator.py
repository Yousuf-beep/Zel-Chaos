"""Conversation flow. Rules run before and after every model call; the model can raise urgency, never lower it."""
import logging
import time
from typing import Any

import config
from adapters.llm import LLM, get_llm, today
from models.schemas import DoctorCard, ExtractionResult, FlowResponse, Symptom, max_urgency
from services import followups, guardrail, rules
from services.session import Session, store

log = logging.getLogger("sakhi.flow")


class Orchestrator:
    def __init__(self, llm: LLM | None = None):
        self.llm = llm or get_llm()

    def _current(self, s: Session) -> ExtractionResult:
        """Base extraction + confirmed chips + follow-up answers, re-applied in order."""
        ex = s.base_extraction.model_copy(deep=True)
        if s.confirmed_chips is not None:
            by_name = {x.name: x for x in ex.symptoms}
            ex.symptoms = [by_name.get(c["name"]) or Symptom(name=c["name"], verbatim=c.get("verbatim") or "(selected)")
                           for c in s.confirmed_chips]
        for key, ans in s.answers.items():
            ex = followups.apply_answer(ex, key, ans)
        return rules.recompute_signals(ex)

    async def analyze(self, sid: str, text: str, lang: str) -> FlowResponse:
        s = store.get_or_create(sid)
        s.lang = lang
        s.turns.append(text.strip())
        s.result = None

        pre = rules.scan(text, lang)
        if rules.stopping_tier(pre):
            return FlowResponse(type="urgent", payload=rules.urgent_payload(pre, lang))

        t0 = time.perf_counter()
        s.base_extraction = await self.llm.extract(s.transcript, lang)
        log.info("stage extract %.0f ms", (time.perf_counter() - t0) * 1000)
        if s.confirmed_chips is not None:
            # New text after confirmation: keep confirmed chips and add anything newly understood.
            known = {c["name"] for c in s.confirmed_chips}
            s.confirmed_chips += [{"name": x.name, "verbatim": x.verbatim} for x in s.base_extraction.symptoms if x.name not in known]
        return await self._continue(s, pre, force_confirm=s.confirmed_chips is None)

    async def confirm(self, sid: str, chips: list[dict]) -> FlowResponse:
        s = self._require(sid)
        s.confirmed_chips = chips
        return await self._continue(s, [])

    async def answer(self, sid: str, key: str, value: Any) -> FlowResponse:
        s = self._require(sid)
        if key not in s.asked:
            s.asked.append(key)
        s.answers[key] = value
        return await self._continue(s, [])

    def _require(self, sid: str) -> Session:
        s = store.get(sid)
        if s is None or s.base_extraction is None:
            raise KeyError("session not found or expired")
        return s

    async def _continue(self, s: Session, pre: list, force_confirm: bool = False) -> FlowResponse:
        ex = self._current(s)
        flags = rules.merge_flags(pre, rules.scan(s.transcript), rules.scan_extracted(ex))
        if rules.stopping_tier(flags):
            return FlowResponse(type="urgent", payload=rules.urgent_payload(flags, s.lang))

        if force_confirm:
            chips = [{"name": x.name, "verbatim": x.verbatim} for x in ex.symptoms]
            return FlowResponse(type="confirm", payload={"chips": chips, "transcript": s.transcript, "lang": s.lang})

        q = followups.next_question(ex, s.asked)
        if q and len(s.asked) < config.MAX_FOLLOWUPS and not followups.enough_signal(ex, s.asked):
            s.asked.append(q["question_key"])
            return FlowResponse(type="followup", payload={**q, "lang": s.lang, "step": len(s.asked), "max_steps": config.MAX_FOLLOWUPS})

        baseline, must_include = rules.urgency_baseline(ex, flags)
        adolescent = rules.is_adolescent(ex)
        t0 = time.perf_counter()
        result = await self.llm.explain(ex, s.lang, baseline, adolescent, must_include)
        log.info("stage explain %.0f ms", (time.perf_counter() - t0) * 1000)

        result = self._enforce(result, ex, flags, baseline, s.lang)

        async def regenerate(reasons: list[str]):
            r = await self.llm.explain(ex, s.lang, baseline, adolescent, must_include, fix_reasons=reasons)
            return self._enforce(r, ex, flags, baseline, s.lang)

        async def model_check(r):
            return await self.llm.guardrail_check(r, s.lang)

        result = await guardrail.check_and_fix(result, s.lang, model_check=model_check, regenerate=regenerate)
        # Safe templates are generic, so the deterministic guarantees are applied once more.
        result = self._enforce(result, ex, flags, baseline, s.lang)
        s.result = result
        return FlowResponse(type="result", payload=result.model_dump())

    @staticmethod
    def _enforce(result, ex, flags, baseline, lang):
        result.urgency = max_urgency(baseline, result.urgency)
        result = rules.apply_adolescent_filters(result, ex)
        result = rules.ensure_min_conditions(result, lang)
        result = rules.suppress_weight_advice(result, flags, ex)
        if not result.seek_urgent_care_if:
            result.seek_urgent_care_if = ["Very heavy bleeding", "Severe or sudden pain", "Fainting or feeling very dizzy"]
        return result

    async def doctor_card(self, sid: str) -> DoctorCard:
        s = self._require(sid)
        ex = self._current(s)
        body, localised = await self.llm.doctor_card(ex, s.transcript, s.lang)
        card = DoctorCard(**body.model_dump(), generated_on=today(), age=ex.age,
                          years_since_menarche=ex.years_since_menarche, language=s.lang,
                          localised=localised if s.lang != "en-IN" else None)
        card.qr_text = compact_card_text(card)
        return card


def compact_card_text(card: DoctorCard) -> str:
    lines = [card.header, f"Date: {card.generated_on}"]
    if card.age:
        lines.append(f"Age: {card.age}")
    if card.years_since_menarche is not None:
        lines.append(f"Years since first period: ~{card.years_since_menarche:g}")
    for t in card.symptom_timeline:
        lines.append(f"- {t.symptom}{' (' + t.since + ')' if t.since else ''}{' ' + t.patient_words if t.patient_words else ''}")
    lines.append(f"Cycle: {card.cycle_notes}")
    lines += [f"* {o}" for o in card.other_relevant]
    lines.append(card.language_note)
    return "\n".join(lines)[:1200]


orchestrator = Orchestrator()
