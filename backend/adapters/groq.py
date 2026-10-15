"""Groq Cloud adapter (OpenAI-compatible chat API). Every call asks for one JSON object and validates it with pydantic."""
import asyncio
import json
import logging
import re
from typing import Any, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

import config
from models.schemas import DoctorCardBody, ExtractionResult, GuardrailVerdict, ResultCard
from services import rules
from services.language import prompt_label

log = logging.getLogger("sakhi.groq")
T = TypeVar("T", bound=BaseModel)

_KB = (config.KB_DIR / "pcos_kb.md").read_text(encoding="utf-8")
_GLOSSARY = json.dumps(config.load_json(config.KB_DIR / "glossary.json")["symptoms"], ensure_ascii=False)


def render(name: str, **values: str) -> str:
    text = (config.PROMPTS_DIR / f"{name}.md").read_text(encoding="utf-8")
    for k, v in values.items():
        text = text.replace("{" + k + "}", v)
    return text


class GroqError(RuntimeError):
    pass


class GroqClient:
    def __init__(self, api_key: str = config.GROQ_API_KEY, model: str = config.GROQ_MODEL):
        self.model = model
        self._http = httpx.AsyncClient(base_url=config.GROQ_BASE_URL, timeout=config.GROQ_TIMEOUT_S,
                                       headers={"Authorization": f"Bearer {api_key}"})

    async def chat_json(self, messages: list[dict], max_tokens: int = 1500, effort: str = "low",
                        temperature: float = 0.4, wait_on_limit: bool = True) -> dict[str, Any]:
        body: dict[str, Any] = {"model": self.model, "messages": messages, "max_completion_tokens": max_tokens,
                                "temperature": temperature, "response_format": {"type": "json_object"}}
        if "gpt-oss" in self.model or "qwen3" in self.model:
            body["reasoning_effort"] = effort
        r = await self._http.post("/chat/completions", json=body)
        if r.status_code == 429 and wait_on_limit:
            # Free-tier token-per-minute limits clear within seconds; wait once if the wait is short.
            m = re.search(r"try again in ([\d.]+)s", r.text)
            wait = float(m.group(1)) if m else float(r.headers.get("retry-after", 99))
            if wait <= 12:
                log.info("groq rate limited; retrying in %.1fs", wait)
                await asyncio.sleep(wait + 0.3)
                r = await self._http.post("/chat/completions", json=body)
        if r.status_code >= 400:
            raise GroqError(f"groq {r.status_code}: {r.text[:300]}")
        content = r.json()["choices"][0]["message"].get("content") or ""
        try:
            return json.loads(content)
        except json.JSONDecodeError as e:
            raise GroqError(f"groq returned non-JSON: {content[:200]}") from e

    async def structured(self, system: str, user: str, model_cls: type[T], max_tokens: int = 2000,
                         effort: str = "low", wait_on_limit: bool = True) -> T:
        """One retry with the validation error fed back, since a single bad field should not lose the whole answer."""
        schema = json.dumps(model_cls.model_json_schema(), ensure_ascii=False)
        messages = [{"role": "system", "content": f"{system}\n\nReply with ONE JSON object that matches this JSON schema:\n{schema}"},
                    {"role": "user", "content": user}]
        last: Exception | None = None
        for _ in range(2):
            data = await self.chat_json(messages, max_tokens=max_tokens, effort=effort, temperature=0.2, wait_on_limit=wait_on_limit)
            try:
                return model_cls.model_validate(data)
            except ValidationError as e:
                last = e
                messages += [{"role": "assistant", "content": json.dumps(data, ensure_ascii=False)[:4000]},
                             {"role": "user", "content": f"That JSON did not match the schema: {str(e)[:800]}. Send the corrected JSON object only."}]
        raise GroqError(f"schema mismatch for {model_cls.__name__}: {last}")


class _DoctorCardPair(BaseModel):
    card: DoctorCardBody
    localised: DoctorCardBody


class GroqAdapter:
    """Implements adapters.llm.LLM for the structured call/chat pipeline."""

    def __init__(self, client: GroqClient | None = None):
        self.client = client or GroqClient()

    async def extract(self, transcript: str, lang: str) -> ExtractionResult:
        system = render("extract", RED_FLAG_IDS=", ".join(rules.RED_FLAG_IDS), GLOSSARY_JSON=_GLOSSARY)
        ex = await self.client.structured(system, f"Language code: {lang}\n\nConversation:\n{transcript}", ExtractionResult)
        ex.language = lang
        # Only canonical IDs survive; rules.scan has already run on the raw text as well.
        ex.red_flags = [f for f in ex.red_flags if f in rules.FLAG_BY_ID]
        return rules.recompute_signals(ex)

    async def explain(self, ex, lang, baseline, adolescent, must_include, fix_reasons=None) -> ResultCard:
        system = render("explain", LANG_NAME=prompt_label(lang), URGENCY_BASELINE=baseline, PCOS_KB=_KB)
        user = {"structured_symptoms": ex.model_dump(), "language": lang, "urgency_baseline": baseline,
                "adolescent": adolescent, "must_include_in_meanwhile": must_include,
                "low_cost_option": rules.low_cost_text(lang)}
        text = json.dumps(user, ensure_ascii=False)
        if fix_reasons:
            text += "\n\nA previous draft was rejected for: " + "; ".join(fix_reasons) + ". Avoid these problems completely."
        result = await self.client.structured(system, text, ResultCard, max_tokens=3000, effort="medium")
        result.language, result.adolescent = lang, adolescent
        return result

    async def guardrail_check(self, result: ResultCard, lang: str) -> GuardrailVerdict:
        system = render("guardrail", LANG_NAME=prompt_label(lang), PCOS_KB=_KB)
        # Second safety layer after the regex pass; under a rate limit it is skipped rather than slowing the answer.
        return await self.client.structured(system, result.model_dump_json(), GuardrailVerdict, max_tokens=600, wait_on_limit=False)

    async def doctor_card(self, ex: ExtractionResult, transcript: str, lang: str):
        system = render("doctor_card", LANG_NAME=prompt_label(lang))
        user = f"Structured data:\n{ex.model_dump_json()}\n\nPatient's own words:\n{transcript}"
        pair = await self.client.structured(system, user, _DoctorCardPair, max_tokens=2500)
        return pair.card, pair.localised
