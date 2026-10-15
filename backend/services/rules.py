"""Deterministic safety rules. These run before and after the LLM and always win."""
import re
from dataclasses import dataclass

import config
from models.schemas import ExtractionResult, ResultCard, max_urgency
from services.textnorm import contains, normalise

_REDFLAGS = config.load_json(config.KB_DIR / "redflags.json")["flags"]
_CARE = config.load_json(config.KB_DIR / "care_resources.json")
FLAG_BY_ID = {f["id"]: f for f in _REDFLAGS}
RED_FLAG_IDS = list(FLAG_BY_ID)

ANDROGEN = {"hirsutism", "acne", "scalp_hair_thinning"}
METABOLIC = {"weight_gain_abdominal", "acanthosis", "skin_tags", "family_diabetes"}
CYCLE = {"missed_periods", "irregular_periods", "periods_not_started"}


@dataclass(frozen=True)
class Flag:
    id: str
    tier: str
    suppress_weight_advice: bool = False


def _flag(fid: str) -> Flag:
    f = FLAG_BY_ID[fid]
    return Flag(fid, f["tier"], bool(f.get("suppress_weight_advice")))


def scan(text: str, lang: str = "en-IN") -> list[Flag]:
    # Every language's keywords are checked regardless of `lang`, because inputs are often code-mixed.
    norm = normalise(text)
    hits = []
    for f in _REDFLAGS:
        any_hit = any(contains(norm, k) for k in f["any"])
        combo_hit = bool(f["combos"]) and all(any(contains(norm, k) for k in group) for group in f["combos"])
        if any_hit or combo_hit:
            hits.append(_flag(f["id"]))
    return hits


def scan_extracted(ex: ExtractionResult) -> list[Flag]:
    hits = [_flag(fid) for fid in ex.red_flags if fid in FLAG_BY_ID]
    names = ex.symptom_names()
    if "periods_not_started" in names and ex.age is not None and ex.age >= 15:
        hits.append(_flag("no_period_by_15"))
    if ex.eating_concern:
        hits.append(_flag("starving_purging"))
    return hits


def merge_flags(*groups: list[Flag]) -> list[Flag]:
    seen: dict[str, Flag] = {}
    for g in groups:
        for f in g:
            seen.setdefault(f.id, f)
    return list(seen.values())


def stopping_tier(flags: list[Flag]) -> str | None:
    tiers = {f.tier for f in flags}
    if "EMERGENCY" in tiers:
        return "emergency"
    if "CRISIS" in tiers:
        return "crisis"
    return None


def urgent_payload(flags: list[Flag], lang: str) -> dict:
    tier = stopping_tier(flags) or "emergency"
    tiers = {f.tier for f in flags}
    sections = []
    # Physical emergency first; if self-harm is also mentioned, the crisis line is shown too.
    if "EMERGENCY" in tiers:
        sections.append("emergency")
    if "CRISIS" in tiers:
        sections.append("crisis")
    blocks = []
    for s in sections:
        msgs = _CARE[s]["message"]
        msg = msgs.get(lang) or msgs["en-IN"]
        if msg.startswith("TODO"):
            msg = msgs["en-IN"]
        blocks.append({"kind": s, "message": msg, "numbers": _CARE[s]["numbers"]})
    return {"tier": tier, "flags": [f.id for f in flags if f.tier in ("EMERGENCY", "CRISIS")], "blocks": blocks, "lang": lang}


def low_cost_text(lang: str) -> str:
    return _CARE["low_cost"].get(lang) or _CARE["low_cost"]["en-IN"]


def recompute_signals(ex: ExtractionResult) -> ExtractionResult:
    names = ex.symptom_names()
    sig = ex.pcos_pattern_signals
    sig.cycle_irregularity = bool(names & CYCLE) or ex.cycle.pattern in ("irregular", "absent")
    sig.androgen_signs = bool(names & ANDROGEN)
    sig.metabolic_signs = bool(names & METABOLIC)
    ex.non_pcos_signals = sorted(names & {"urinary_burning", "abnormal_discharge", "pelvic_pain", "hot_flushes", "painful_periods", "heavy_periods", "fatigue"})
    return ex


def is_adolescent(ex: ExtractionResult) -> bool:
    if ex.years_since_menarche is not None:
        return ex.years_since_menarche < 8
    return ex.age is not None and ex.age < 18


def missed_days(ex: ExtractionResult) -> int | None:
    days = [s.duration_days for s in ex.symptoms if s.name == "missed_periods" and s.duration_days]
    if ex.cycle.last_period_days_ago:
        days.append(ex.cycle.last_period_days_ago)
    return max(days) if days else None


def urgency_baseline(ex: ExtractionResult, flags: list[Flag]) -> tuple[str, list[str]]:
    """Returns (baseline urgency, extra 'meanwhile' items that must appear)."""
    extra: list[str] = []
    level = "self_monitor"
    names = ex.symptom_names()
    ysm = ex.years_since_menarche
    adult = not is_adolescent(ex)

    if any(f.tier == "PROMPT" for f in flags):
        level = max_urgency(level, "see_doctor_soon")

    gap = missed_days(ex)
    if gap and gap >= 90 and (ysm is None or ysm > 1):
        level = max_urgency(level, "routine")
    if ("missed_periods" in names or ex.cycle.pattern == "absent") and ex.pregnancy_possible in ("yes", "unknown"):
        extra.append("If there is any chance of pregnancy, take a pregnancy test first.")

    sig = ex.pcos_pattern_signals
    if sig.cycle_irregularity and sig.androgen_signs and adult:
        level = max_urgency(level, "routine")

    if "urinary_burning" in names:
        level = max_urgency(level, "see_doctor_soon")
    if names & {"abnormal_discharge", "painful_periods", "hot_flushes", "heavy_periods", "pelvic_pain"}:
        level = max_urgency(level, "routine")
    # First year after menarche needs no special case: the cycle rules above are gated on ysm > 1 or adulthood.
    return level, extra


_ADOLESCENT_BLOCKED = re.compile(r"ultra\s?sound|sonograph|\bamh\b|anti[- ]m[uü]llerian|अल्ट्रासाउंड|सोनोग्राफी|एएमएच", re.I)


def apply_adolescent_filters(result: ResultCard, ex: ExtractionResult) -> ResultCard:
    if not is_adolescent(ex):
        return result
    result.adolescent = True
    result.tests_doctor_may_consider = [t for t in result.tests_doctor_may_consider if not _ADOLESCENT_BLOCKED.search(t)]
    result.questions_to_ask = [q for q in result.questions_to_ask if not _ADOLESCENT_BLOCKED.search(q)]
    result.meanwhile = [m for m in result.meanwhile if not _ADOLESCENT_BLOCKED.search(m)]
    return result


_DEFAULT_CONDITIONS = {
    "en-IN": ["Thyroid changes", "Pregnancy (if possible)", "Prolactin (a hormone) changes"],
    "hi-IN": ["थायरॉइड में बदलाव", "प्रेगनेंसी (अगर संभव हो)", "प्रोलैक्टिन (एक हार्मोन) में बदलाव"],
}


def ensure_min_conditions(result: ResultCard, lang: str) -> ResultCard:
    defaults = _DEFAULT_CONDITIONS.get(lang, _DEFAULT_CONDITIONS["en-IN"])
    for c in defaults:
        if len(result.conditions_to_discuss) >= 2:
            break
        if c not in result.conditions_to_discuss:
            result.conditions_to_discuss.append(c)
    return result


def suppress_weight_advice(result: ResultCard, flags: list[Flag], ex: ExtractionResult) -> ResultCard:
    if not (ex.eating_concern or any(f.suppress_weight_advice for f in flags)):
        return result
    blocked = re.compile(r"weight|diet|meal|food|exercise|movement|calorie|वज़न|खाना|डाइट", re.I)
    result.meanwhile = [m for m in result.meanwhile if not blocked.search(m)]
    result.meanwhile.append("Talking to a doctor or a mental-health professional about eating and how you feel can really help.")
    return result
