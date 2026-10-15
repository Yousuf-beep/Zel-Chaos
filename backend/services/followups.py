"""Picks the next missing piece of information. Question wording lives in frontend/locales/*.json."""
from typing import Any, Optional

from models.schemas import ExtractionResult, Symptom
from services.rules import ANDROGEN, METABOLIC, recompute_signals

QUESTIONS: dict[str, dict] = {
    "pregnancy_possible": {"kind": "single", "options": ["yes", "no", "not_sure", "declined"]},
    "age_menarche": {"kind": "age_menarche", "options": ["lt1", "1to3", "3to8", "gt8", "unknown"]},
    "cycle_pattern": {"kind": "single", "options": ["regular", "irregular", "absent", "unknown"]},
    "androgen_signs": {"kind": "multi", "options": ["hirsutism", "acne", "scalp_hair_thinning", "none"]},
    "metabolic_signs": {"kind": "multi", "options": ["weight_gain_abdominal", "acanthosis", "family_diabetes", "none"]},
    "mood": {"kind": "single", "options": ["good", "sometimes_low", "often_low", "declined"]},
    "trying_to_conceive": {"kind": "single", "options": ["yes", "no", "declined"]},
}
PRIORITY = list(QUESTIONS)
MENARCHE_YEARS = {"lt1": 0.5, "1to3": 2.0, "3to8": 5.0, "gt8": 10.0, "unknown": None}


def _needed(ex: ExtractionResult) -> list[str]:
    names = ex.symptom_names()
    cycle_issue = bool(names & {"missed_periods", "irregular_periods"}) or ex.cycle.pattern in ("irregular", "absent")
    need = []
    if cycle_issue and ex.pregnancy_possible == "unknown":
        need.append("pregnancy_possible")
    if ex.age is None or ex.years_since_menarche is None:
        need.append("age_menarche")
    if ex.cycle.pattern == "unknown" and not cycle_issue:
        need.append("cycle_pattern")
    if not names & ANDROGEN:
        need.append("androgen_signs")
    if not names & METABOLIC:
        need.append("metabolic_signs")
    if ex.mood == "unknown":
        need.append("mood")
    if ex.trying_to_conceive == "unknown":
        need.append("trying_to_conceive")
    return need


def next_question(ex: ExtractionResult, asked: list[str]) -> Optional[dict]:
    need = set(_needed(ex)) | (set(ex.missing_info) & set(QUESTIONS))
    for key in PRIORITY:
        if key in need and key not in asked:
            return {"question_key": key, **QUESTIONS[key]}
    return None


def enough_signal(ex: ExtractionResult, asked: list[str]) -> bool:
    """Enough to give useful guidance: the core questions are answered or were already offered."""
    need = set(_needed(ex))
    core = {"pregnancy_possible", "age_menarche", "cycle_pattern", "androgen_signs"}
    return not ((need & core) - set(asked))


def apply_answer(ex: ExtractionResult, key: str, answer: Any) -> ExtractionResult:
    if key == "pregnancy_possible":
        ex.pregnancy_possible = {"yes": "yes", "no": "no", "not_sure": "unknown", "declined": "declined"}.get(answer, "unknown")
    elif key == "age_menarche" and isinstance(answer, dict):
        age = answer.get("age")
        if isinstance(age, (int, float)) and 8 <= age <= 80:
            ex.age = int(age)
        m = answer.get("menarche")
        if m == "never":
            if "periods_not_started" not in ex.symptom_names():
                ex.symptoms.append(Symptom(name="periods_not_started", verbatim="periods have not started"))
        elif m in MENARCHE_YEARS:
            ex.years_since_menarche = MENARCHE_YEARS[m]
    elif key == "cycle_pattern":
        if answer in ("regular", "irregular", "absent"):
            ex.cycle.pattern = answer
        if answer == "absent" and "missed_periods" not in ex.symptom_names():
            ex.symptoms.append(Symptom(name="missed_periods", duration_days=90, verbatim="no period for 3+ months"))
        if answer == "irregular" and "irregular_periods" not in ex.symptom_names():
            ex.symptoms.append(Symptom(name="irregular_periods", verbatim="often late or missed"))
    elif key in ("androgen_signs", "metabolic_signs"):
        picked = answer if isinstance(answer, list) else [answer]
        allowed = set(QUESTIONS[key]["options"]) - {"none"}
        for name in picked:
            if name in allowed and name not in ex.symptom_names():
                ex.symptoms.append(Symptom(name=name, verbatim="(selected)"))
    elif key == "mood":
        ex.mood = answer if answer in ("good", "sometimes_low", "often_low", "declined") else "unknown"
    elif key == "trying_to_conceive":
        ex.trying_to_conceive = answer if answer in ("yes", "no", "declined") else "unknown"
    return recompute_signals(ex)
