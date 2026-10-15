"""LLM adapter. MockLLM is deterministic and KB-grounded so the full flow runs with MOCK_MODE=true and no keys."""
import re
from datetime import date
from typing import Protocol

import config
from models.schemas import (Association, DoctorCardBody, EvidenceItem, ExtractionResult, GuardrailVerdict,
                            ResultCard, Specialist, Symptom, TimelineItem)
from services import rules
from services.textnorm import contains, normalise

GLOSSARY = config.load_json(config.KB_DIR / "glossary.json")["symptoms"]


class LLM(Protocol):
    async def extract(self, transcript: str, lang: str) -> ExtractionResult: ...
    async def explain(self, ex: ExtractionResult, lang: str, baseline: str, adolescent: bool,
                      must_include: list[str], fix_reasons: list[str] | None = None) -> ResultCard: ...
    async def guardrail_check(self, result: ResultCard, lang: str) -> GuardrailVerdict: ...
    async def doctor_card(self, ex: ExtractionResult, transcript: str, lang: str) -> tuple[DoctorCardBody, DoctorCardBody]: ...


_UNIT_DAYS = {"day": 1, "days": 1, "din": 1, "week": 7, "weeks": 7, "hafte": 7, "hafta": 7, "month": 30, "months": 30,
              "mahine": 30, "mahina": 30, "maheene": 30, "year": 365, "years": 365, "saal": 365}
_DURATION = re.compile(r"(\d{1,2})\s*(days?|din|weeks?|hafte|hafta|months?|mahine|mahina|maheene|years?|saal)\b", re.I)
_AGE = re.compile(r"(?:i am|i'm|im|age|aged|umar|umr|meri umar)\s*(?:is\s*)?(\d{1,2})\b|\b(\d{1,2})\s*(?:years old|yrs old|year old|saal ki|varsha|vayasu|vayassu)", re.I)
_MENARCHE = re.compile(r"(?:periods?|menses)\s*(?:started|began|start hue|shuru hue)\s*(\d{1,2})\s*(months?|years?|saal|mahine)\s*(?:ago|pehle)?", re.I)


def _duration_near(text: str, phrase_pos: int) -> int | None:
    best = None
    for m in _DURATION.finditer(text):
        dist = abs(m.start() - phrase_pos)
        if dist < 60 and (best is None or dist < best[0]):
            best = (dist, int(m.group(1)) * _UNIT_DAYS[m.group(2).lower()])
    return best[1] if best else None


class MockLLM:
    async def extract(self, transcript: str, lang: str) -> ExtractionResult:
        norm = normalise(transcript)
        lower = transcript.lower()
        ex = ExtractionResult(language=lang)
        for name, entry in GLOSSARY.items():
            for phrase in entry["phrases"]:
                if contains(norm, phrase):
                    pos = lower.find(phrase.lower())
                    dur = _duration_near(lower, pos) if pos >= 0 and entry["group"] == "cycle" else None
                    ex.symptoms.append(Symptom(name=name, duration_days=dur, verbatim=phrase))
                    break
        names = ex.symptom_names()
        if "periods_not_started" in names:
            ex.symptoms = [s for s in ex.symptoms if s.name not in ("missed_periods", "irregular_periods")]
            names = ex.symptom_names()
        m = _AGE.search(transcript)
        if m:
            ex.age = int(m.group(1) or m.group(2))
        m = _MENARCHE.search(transcript)
        if m:
            n, unit = int(m.group(1)), m.group(2).lower()
            ex.years_since_menarche = n / 12 if unit.startswith(("month", "mahine")) else float(n)
        if contains(norm, "not pregnant") or contains(norm, "pregnant nahi"):
            ex.pregnancy_possible = "no"
        if "missed_periods" in names:
            gap = max((s.duration_days or 0) for s in ex.symptoms if s.name == "missed_periods")
            ex.cycle.pattern = "absent" if gap >= 90 else "irregular"
        elif "irregular_periods" in names:
            ex.cycle.pattern = "irregular"
        if "difficulty_conceiving" in names:
            ex.trying_to_conceive = "yes"
        if names & {"low_mood", "anxiety"}:
            ex.mood = "sometimes_low"
        ex.eating_concern = any(f.id == "starving_purging" for f in rules.scan(transcript))
        ex.red_flags = [f.id for f in rules.scan(transcript)]
        return rules.recompute_signals(ex)

    async def explain(self, ex, lang, baseline, adolescent, must_include, fix_reasons=None) -> ResultCard:
        names = ex.symptom_names()
        sig = ex.pcos_pattern_signals
        low_cost = rules.low_cost_text(lang)
        words = [s.verbatim for s in ex.symptoms if s.verbatim and s.verbatim != "(selected)"]
        reflection = ("You shared: " + ", ".join(f"“{w}”" for w in words[:4]) + ". Thank you for telling me.") if words \
            else "Thank you for sharing how you feel."

        assoc: list[Association] = []
        conditions: list[str] = []
        pcos_like = sig.cycle_irregularity and (sig.androgen_signs or sig.metabolic_signs)
        if pcos_like:
            label = "PCOS (now renamed PMOS)-like pattern"
            if adolescent:
                label += " — doctors may call this “at risk” and review it over time"
            assoc.append(Association(label=label, why="Irregular periods together with skin, hair, or weight changes are commonly seen with this common hormonal condition."))
            conditions.append("PCOS/PMOS")
        if sig.cycle_irregularity:
            assoc.append(Association(label="Thyroid or other hormone changes", why="Thyroid and prolactin changes can also affect periods. A doctor can check."))
            conditions += ["Thyroid", "Prolactin changes"]
            if ex.pregnancy_possible in ("yes", "unknown"):
                conditions.append("Pregnancy (if possible)")
            if not pcos_like:
                assoc.append(Association(label="Stress, low weight, or over-exercise", why="These can also change cycles for a while."))
        if "urinary_burning" in names:
            assoc.append(Association(label="Urinary infection pattern", why="Burning or pain when passing urine is commonly seen with a urinary infection."))
            conditions += ["Urinary infection", "Vaginal infection"]
        if "abnormal_discharge" in names:
            assoc.append(Association(label="Vaginal infection pattern", why="Unusual discharge, itching, or odour is worth checking with a doctor."))
            conditions += ["Vaginal infection", "Other infections"]
        if names & {"painful_periods", "pelvic_pain"}:
            assoc.append(Association(label="Painful periods", why="Very painful periods that disrupt daily life are worth discussing. Conditions like endometriosis can cause this."))
            conditions += ["Endometriosis", "Other causes of period pain"]
        if "fatigue" in names or "heavy_periods" in names:
            assoc.append(Association(label="Low iron (anaemia)", why="Tiredness and heavy periods are worth checking for anaemia."))
            conditions += ["Anaemia", "Thyroid"]
        if "hot_flushes" in names:
            assoc.append(Association(label="Perimenopause", why="Hot flushes, night sweats, and cycle changes in your 40s may relate to perimenopause."))
            conditions += ["Perimenopause", "Thyroid"]
        if not assoc:
            assoc.append(Association(label="Not enough detail yet", why="A doctor can help with what you are feeling."))
        conditions = list(dict.fromkeys(conditions))

        evidence = [EvidenceItem(your_words=s.verbatim, pattern=GLOSSARY.get(s.name, {}).get("group", "other").replace("androgen", "androgen-related (skin/hair)") + " signal")
                    for s in ex.symptoms if s.verbatim and s.verbatim != "(selected)"]

        who = [Specialist(specialist="Gynaecologist", why="First stop for period problems and hormone-related concerns.", low_cost_option=low_cost)]
        if "urinary_burning" in names:
            who.insert(0, Specialist(specialist="General physician / PHC doctor", why="Can check for a urinary infection quickly.", low_cost_option=low_cost))
        if sig.androgen_signs:
            who.append(Specialist(specialist="Dermatologist", why="For persistent acne, extra hair, or hair thinning.", low_cost_option=low_cost))
        if sig.metabolic_signs:
            who.append(Specialist(specialist="Endocrinologist", why="If a doctor sees a metabolic or complex hormone picture.", low_cost_option=low_cost))
        if ex.mood == "often_low":
            who.append(Specialist(specialist="Mental health professional", why="Low mood and anxiety are common and support helps.", low_cost_option="Tele-MANAS 14416 (free, 24x7)"))

        tests: list[str] = []
        if sig.cycle_irregularity:
            if ex.pregnancy_possible in ("yes", "unknown"):
                tests.append("Pregnancy test")
            tests += ["Thyroid (TSH)", "Prolactin", "Androgen levels (e.g. testosterone)", "Other hormones such as LH/FSH"]
            if sig.metabolic_signs:
                tests.append("Metabolic checks (fasting glucose or HbA1c, cholesterol)")
            tests += ["Pelvic ultrasound", "AMH"]

        meanwhile = list(must_include) + ["Note the dates of your periods and any symptoms in a diary or app to show the doctor."]
        if not ex.eating_concern:
            meanwhile.append("Regular movement you enjoy, regular balanced meals, and enough sleep can help you feel better.")
        if adolescent and (ex.age is None or ex.age < 18):
            meanwhile.append("It can help to talk to a trusted adult, like a parent, guardian, or school nurse, along with a doctor.")

        questions = ["What could be causing my symptoms?", "Which tests do I need, and why?", "What can I do to manage this?"]
        urgent = ["Very heavy bleeding (soaking a pad every hour)", "Severe or sudden pain in the lower belly", "Fainting or feeling very dizzy", "Fever with pelvic pain"]
        how_soon = {"see_doctor_soon": "Please see a doctor within the next few days to two weeks.",
                    "routine": "It's worth booking a doctor's appointment in the coming weeks.",
                    "self_monitor": "Keep track of how you feel. See a doctor if things continue or get worse."}[baseline]
        spoken = f"{reflection} {how_soon} A {who[0].specialist.lower()} is a good place to start. {low_cost} are free or low-cost options. If you have very heavy bleeding, severe pain, or fainting, go to a hospital right away. This is not a diagnosis."
        return ResultCard(
            urgency=baseline, reflection=reflection, may_be_associated_with=assoc, conditions_to_discuss=conditions,
            evidence_map=evidence, who_to_see=who, questions_to_ask=questions, tests_doctor_may_consider=tests,
            meanwhile=meanwhile, seek_urgent_care_if=urgent, learn_more="pmos_rename" if sig.cycle_irregularity else None,
            spoken_script=spoken[:900], disclaimer="This is health information, not a diagnosis. Please consult a doctor.",
            adolescent=adolescent, language=lang,
        )

    async def guardrail_check(self, result: ResultCard, lang: str) -> GuardrailVerdict:
        return GuardrailVerdict(passed=True)

    async def doctor_card(self, ex: ExtractionResult, transcript: str, lang: str):
        timeline = []
        for s in ex.symptoms:
            since = ""
            if s.duration_days:
                since = f"~{round(s.duration_days / 30)} months" if s.duration_days >= 60 else f"~{s.duration_days} days"
            words = "" if s.verbatim == "(selected)" else f"“{s.verbatim}”"
            timeline.append(TimelineItem(symptom=GLOSSARY.get(s.name, {}).get("en", s.name), since=since, patient_words=words))
        cycle_notes = {"absent": "No period for an extended time (patient-reported).", "irregular": "Cycles reported as irregular.",
                       "regular": "Cycles reported as usually regular.", "unknown": "Cycle pattern not stated."}[ex.cycle.pattern]
        other = []
        if ex.pregnancy_possible != "unknown":
            other.append(f"Pregnancy possible: {ex.pregnancy_possible}")
        if ex.trying_to_conceive == "yes":
            other.append("Trying to conceive")
        if ex.mood in ("sometimes_low", "often_low"):
            other.append("Reports low mood / anxiety at times")
        body = DoctorCardBody(
            main_concerns=[t.symptom for t in timeline[:4]] or ["General health concerns"],
            symptom_timeline=timeline, cycle_notes=cycle_notes, other_relevant=other,
            questions_patient_wants_to_ask=["What could be causing these symptoms?", "Which tests are needed?", "What are my options?"],
            language_note=f"Patient's preferred language: {config.lang_name(lang)}",
        )
        # Mock mode has no translation; the localised column repeats English. Real mode fills it via Claude/Sarvam.
        return body, body.model_copy()


def get_llm() -> LLM:
    if config.MOCK_LLM:
        return MockLLM()
    from adapters.groq import GroqAdapter
    return GroqAdapter()


def today() -> str:
    return date.today().isoformat()
