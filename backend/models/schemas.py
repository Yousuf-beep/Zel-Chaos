from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

Urgency = Literal["emergency", "see_doctor_soon", "routine", "self_monitor"]
URGENCY_ORDER: dict[str, int] = {"self_monitor": 0, "routine": 1, "see_doctor_soon": 2, "emergency": 3}


def max_urgency(*levels: str) -> str:
    return max(levels, key=lambda u: URGENCY_ORDER.get(u, 0))


class Symptom(BaseModel):
    name: str
    duration_days: Optional[int] = None
    severity: Optional[str] = None
    verbatim: str = ""


class Cycle(BaseModel):
    pattern: Literal["irregular", "regular", "absent", "unknown"] = "unknown"
    typical_length_days: Optional[int] = None
    last_period_days_ago: Optional[int] = None


class PatternSignals(BaseModel):
    cycle_irregularity: bool = False
    androgen_signs: bool = False
    metabolic_signs: bool = False


class ExtractionResult(BaseModel):
    language: str = "en-IN"
    age: Optional[int] = None
    years_since_menarche: Optional[float] = None
    symptoms: list[Symptom] = Field(default_factory=list)
    cycle: Cycle = Field(default_factory=Cycle)
    pregnancy_possible: Literal["yes", "no", "unknown", "declined"] = "unknown"
    trying_to_conceive: Literal["yes", "no", "unknown", "declined"] = "unknown"
    mood: Literal["good", "sometimes_low", "often_low", "unknown", "declined"] = "unknown"
    eating_concern: bool = False
    red_flags: list[str] = Field(default_factory=list)
    pcos_pattern_signals: PatternSignals = Field(default_factory=PatternSignals)
    non_pcos_signals: list[str] = Field(default_factory=list)
    missing_info: list[str] = Field(default_factory=list)

    def symptom_names(self) -> set[str]:
        return {s.name for s in self.symptoms}


class Association(BaseModel):
    label: str
    why: str


class EvidenceItem(BaseModel):
    your_words: str
    pattern: str


class Specialist(BaseModel):
    specialist: str
    why: str
    low_cost_option: str


class ResultCard(BaseModel):
    urgency: Urgency
    reflection: str
    may_be_associated_with: list[Association]
    conditions_to_discuss: list[str]
    evidence_map: list[EvidenceItem] = Field(default_factory=list)
    who_to_see: list[Specialist]
    questions_to_ask: list[str] = Field(default_factory=list)
    tests_doctor_may_consider: list[str] = Field(default_factory=list)
    meanwhile: list[str] = Field(default_factory=list)
    seek_urgent_care_if: list[str]
    learn_more: Optional[str] = None
    spoken_script: str
    disclaimer: str
    adolescent: bool = False
    language: str = "en-IN"
    used_safe_template: bool = False


class TimelineItem(BaseModel):
    symptom: str
    since: str = ""
    patient_words: str = ""


class DoctorCardBody(BaseModel):
    header: str = "Patient-reported information — not a diagnosis"
    main_concerns: list[str] = Field(default_factory=list)
    symptom_timeline: list[TimelineItem] = Field(default_factory=list)
    cycle_notes: str = ""
    other_relevant: list[str] = Field(default_factory=list)
    questions_patient_wants_to_ask: list[str] = Field(default_factory=list)
    language_note: str = ""


class DoctorCard(DoctorCardBody):
    generated_on: str
    age: Optional[int] = None
    years_since_menarche: Optional[float] = None
    language: str = "en-IN"
    localised: Optional[DoctorCardBody] = None
    qr_text: str = ""


class GuardrailVerdict(BaseModel):
    passed: bool
    reasons: list[str] = Field(default_factory=list)


class FlowResponse(BaseModel):
    type: Literal["urgent", "confirm", "followup", "result"]
    payload: dict[str, Any]


class AnalyzeRequest(BaseModel):
    session_id: str
    text: str = Field(min_length=1, max_length=4000)
    lang: str = "en-IN"


class Chip(BaseModel):
    name: str
    verbatim: str = ""


class ConfirmRequest(BaseModel):
    session_id: str
    chips: list[Chip]


class AnswerRequest(BaseModel):
    session_id: str
    question_key: str
    answer: Any


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    lang: str = "en-IN"


class SessionRequest(BaseModel):
    session_id: str


class SignupRequest(BaseModel):
    name: str = Field(max_length=60)
    handle: str = Field(max_length=120)
    password: str = Field(max_length=200)


class LoginRequest(BaseModel):
    handle: str = Field(max_length=120)
    password: str = Field(max_length=200)


class CompanionRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    lang: str = "en-IN"
    conversation_id: Optional[str] = Field(None, max_length=64)


class TitleRequest(BaseModel):
    title: str = Field(min_length=1, max_length=80)


class PeriodStartRequest(BaseModel):
    start_date: str  # ISO date, YYYY-MM-DD
