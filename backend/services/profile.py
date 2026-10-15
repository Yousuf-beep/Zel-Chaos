"""The one-time onboarding questionnaire (nola.profiles), answered right after sign-up and never asked again.
Kept deliberately short: age, how regular her periods are, what she wants help with, what a doctor has already told
her, and whether she takes hormonal contraception or regular medicines. The cycle dates go to services.cycle.
Every answer is optional; a saved row (even an empty one) means onboarding is done. Stored sealed (services.crypto)."""
from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from services import crypto
from services.db import Database, db as default_db

Regularity = Literal["regular", "irregular", "absent", "not_started", "unsure"]
Concern = Literal["irregular_periods", "painful_periods", "heavy_periods", "skin_hair", "weight", "mood_stress", "sleep",
                  "tiredness", "conceiving", "tracking"]
Condition = Literal["pcos", "thyroid", "diabetes", "anaemia", "endometriosis", "other", "none", "declined"]
YesNo = Literal["yes", "no", "declined"]
Mascot = Literal["radish", "cat", "dog", "rabbit", "teddy", "frog"]

_REGULARITY = {"regular": "usually regular periods", "irregular": "irregular periods (often late or missed)",
               "absent": "no period for 3 months or more", "not_started": "periods have not started yet", "unsure": "not sure how regular"}
_CONCERN = {"irregular_periods": "irregular or missed periods", "painful_periods": "painful periods", "heavy_periods": "heavy bleeding",
            "skin_hair": "acne, extra hair or hair thinning", "weight": "weight changes", "mood_stress": "mood or stress",
            "sleep": "sleep", "tiredness": "tiredness", "conceiving": "trying to get pregnant", "tracking": "just tracking her cycle"}
_CONDITION = {"pcos": "PCOS/PMOS", "thyroid": "a thyroid condition", "diabetes": "diabetes or prediabetes", "anaemia": "anaemia",
              "endometriosis": "endometriosis", "other": "another condition"}


class Profile(BaseModel):
    age: Optional[int] = Field(None, ge=8, le=80)
    regularity: Optional[Regularity] = None
    concerns: list[Concern] = Field(default_factory=list)
    conditions: list[Condition] = Field(default_factory=list)
    hormonal_meds: Optional[YesNo] = None
    mascot: Optional[Mascot] = None  # which look Nola wears in the app; not health data

    @field_validator("concerns", "conditions")
    @classmethod
    def _dedupe(cls, v):
        return list(dict.fromkeys(v))[:10]


def describe(p: Optional[Profile]) -> str:
    """Plain-English lines for the model's context and the report. Prior conditions are what a doctor told her, not ours."""
    if p is None:
        return "She has not filled in her profile."
    lines = []
    if p.age:
        lines.append(f"Age {p.age}" + (" (a teenager)" if p.age < 18 else "") + ".")
    if p.regularity:
        lines.append(f"Periods: {_REGULARITY[p.regularity]}.")
    if p.concerns:
        lines.append("Wants help with: " + ", ".join(_CONCERN[c] for c in p.concerns) + ".")
    known = [_CONDITION[c] for c in p.conditions if c in _CONDITION]
    if known:
        lines.append("Previously told by a doctor (her report): " + ", ".join(known) + ".")
    elif "none" in p.conditions:
        lines.append("No condition previously diagnosed by a doctor.")
    if p.hormonal_meds == "yes":
        lines.append("Takes hormonal contraception or regular medicines (she did not say which; do not ask about or discuss medicines).")
    elif p.hormonal_meds == "no":
        lines.append("No hormonal contraception or regular medicines.")
    return " ".join(lines) or "She skipped the profile questions."


class ProfileStore:
    def __init__(self, database: Database | None = None):
        self.db = database or default_db

    async def get(self, user_id: str) -> Optional[Profile]:
        row = await self.db.fetchone("SELECT data FROM nola.profiles WHERE user_id = %s", user_id)
        return Profile.model_validate(crypto.unseal_json(row[0], {})) if row else None

    async def save(self, user_id: str, p: Profile) -> Profile:
        await self.db.execute(
            "INSERT INTO nola.profiles (user_id, data, updated_at) VALUES (%s, %s, %s) "
            "ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
            user_id, crypto.seal_json(p.model_dump()), datetime.now(timezone.utc))
        return p

    async def set_mascot(self, user_id: str, mascot: Mascot) -> bool:
        """Changes only the mascot. Returns False before onboarding, since a saved profile is what marks it done."""
        p = await self.get(user_id)
        if p is None:
            return False
        await self.save(user_id, p.model_copy(update={"mascot": mascot}))
        return True

    async def onboarded(self, user_id: str) -> bool:
        return bool(await self.db.fetchone("SELECT 1 FROM nola.profiles WHERE user_id = %s", user_id))

    async def delete(self, user_id: str) -> None:
        await self.db.execute("DELETE FROM nola.profiles WHERE user_id = %s", user_id)


profiles = ProfileStore()
