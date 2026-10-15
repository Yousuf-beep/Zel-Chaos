"""Period-cycle tracking. The user gives her last period start and typical lengths once; every logged start refines the average.
All maths is deterministic here. The companion only receives the computed status, never raw guesses from the model."""
import statistics
from datetime import date, timedelta
from typing import Optional

from pydantic import BaseModel, Field

from services.db import Database, db as default_db

MIN_CYCLE, MAX_CYCLE = 15, 90
TYPICAL_LOW, TYPICAL_HIGH = 21, 35  # common adult range; outside it is worth noting, not alarming


class CycleSetup(BaseModel):
    last_period_start: date
    cycle_length: int = Field(28, ge=MIN_CYCLE, le=MAX_CYCLE)
    period_length: int = Field(5, ge=1, le=15)


class CycleStatus(BaseModel):
    last_period_start: date
    period_starts: list[date]
    cycle_length_setting: int
    period_length: int
    average_cycle_length: int
    cycle_day: int
    phase: str  # period | follicular | fertile_window | luteal | late
    on_period: bool
    next_period_expected: date
    days_until_next: int  # negative when late
    days_late: int
    cycles_logged: int
    variation_days: Optional[int] = None
    notes: list[str] = Field(default_factory=list)


def compute_status(starts: list[date], cycle_length: int, period_length: int, today: Optional[date] = None) -> CycleStatus:
    today = today or date.today()
    starts = sorted(set(starts))
    last = starts[-1]
    gaps = [(b - a).days for a, b in zip(starts, starts[1:]) if MIN_CYCLE <= (b - a).days <= MAX_CYCLE][-6:]
    avg = round(statistics.mean(gaps)) if gaps else cycle_length
    variation = (max(gaps) - min(gaps)) if len(gaps) >= 2 else None

    cycle_day = (today - last).days + 1
    expected = last + timedelta(days=avg)
    until = (expected - today).days
    late = max(0, -until)
    on_period = 1 <= cycle_day <= period_length
    ovulation_day = max(avg - 14, period_length + 1)  # estimate only
    if late > 0:
        phase = "late"
    elif on_period:
        phase = "period"
    elif ovulation_day - 3 <= cycle_day <= ovulation_day + 1:
        phase = "fertile_window"
    elif cycle_day < ovulation_day - 3:
        phase = "follicular"
    else:
        phase = "luteal"

    notes = []
    if late >= 7:
        notes.append(f"Period is about {late} days later than her average.")
    if cycle_day > 90:
        notes.append("No period logged for more than 3 months; gently suggest seeing a doctor.")
    if gaps and not TYPICAL_LOW <= avg <= TYPICAL_HIGH:
        notes.append(f"Average cycle of {avg} days is outside the common 21-35 day range.")
    if variation is not None and variation > 7:
        notes.append(f"Cycle length varies by about {variation} days between cycles.")
    if not gaps:
        notes.append("Average uses her own estimate; it becomes more accurate as she logs more periods.")
    return CycleStatus(last_period_start=last, period_starts=starts[-12:], cycle_length_setting=cycle_length,
                       period_length=period_length, average_cycle_length=avg, cycle_day=cycle_day, phase=phase,
                       on_period=on_period, next_period_expected=expected, days_until_next=until, days_late=late,
                       cycles_logged=len(gaps), variation_days=variation, notes=notes)


def describe(s: CycleStatus) -> str:
    """Plain-English summary for the model's context."""
    phase = {"period": "on her period", "follicular": "in the days after her period (follicular phase)",
             "fertile_window": "around her estimated fertile window", "luteal": "in the second half of her cycle (luteal phase)",
             "late": f"{s.days_late} day(s) past her expected period"}[s.phase]
    lines = [f"Today is day {s.cycle_day} of her cycle; she is {phase}.",
             f"Last period started {s.last_period_start.isoformat()}; average cycle {s.average_cycle_length} days "
             f"({s.cycles_logged} cycle(s) logged); periods last about {s.period_length} days.",
             f"Next period expected around {s.next_period_expected.isoformat()}"
             + (f" (in {s.days_until_next} days)." if s.days_until_next >= 0 else ".")]
    return " ".join(lines + s.notes)


def _as_date(v) -> date:
    return v if isinstance(v, date) else date.fromisoformat(str(v))


class CycleStore:
    """nola.cycle_profiles + nola.period_starts."""

    def __init__(self, database: Database | None = None):
        self.db = database or default_db

    async def setup(self, user_id: str, s: CycleSetup) -> CycleStatus:
        await self.db.execute(
            "INSERT INTO nola.cycle_profiles (user_id, cycle_length, period_length, updated_at) VALUES (%s, %s, %s, CURRENT_TIMESTAMP) "
            "ON CONFLICT (user_id) DO UPDATE SET cycle_length = excluded.cycle_length, "
            "period_length = excluded.period_length, updated_at = CURRENT_TIMESTAMP",
            user_id, s.cycle_length, s.period_length)
        await self.db.execute("INSERT INTO nola.period_starts (user_id, start_date) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                              user_id, s.last_period_start)
        return await self.status(user_id)  # type: ignore[return-value]

    async def log_start(self, user_id: str, start: date) -> Optional[CycleStatus]:
        if not await self.db.fetchone("SELECT 1 FROM nola.cycle_profiles WHERE user_id = %s", user_id):
            return None
        await self.db.execute("INSERT INTO nola.period_starts (user_id, start_date) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                              user_id, start)
        return await self.status(user_id)

    async def remove_start(self, user_id: str, start: date) -> Optional[CycleStatus]:
        # The profile always keeps at least one start date.
        await self.db.execute(
            "DELETE FROM nola.period_starts WHERE user_id = %s AND start_date = %s "
            "AND (SELECT COUNT(*) FROM nola.period_starts WHERE user_id = %s) > 1",
            user_id, start, user_id)
        return await self.status(user_id)

    async def status(self, user_id: str, today: Optional[date] = None) -> Optional[CycleStatus]:
        row = await self.db.fetchone("SELECT cycle_length, period_length FROM nola.cycle_profiles WHERE user_id = %s", user_id)
        if not row:
            return None
        starts = [_as_date(r[0]) for r in await self.db.fetchall(
            "SELECT start_date FROM nola.period_starts WHERE user_id = %s ORDER BY start_date DESC LIMIT 24", user_id)]
        return compute_status(starts, row[0], row[1], today) if starts else None

    async def delete(self, user_id: str) -> None:
        await self.db.execute("DELETE FROM nola.period_starts WHERE user_id = %s", user_id)
        await self.db.execute("DELETE FROM nola.cycle_profiles WHERE user_id = %s", user_id)


cycles = CycleStore()
