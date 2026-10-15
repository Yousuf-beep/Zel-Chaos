import asyncio
from datetime import date, timedelta

from services.companion import Companion, CompanionTurn, MockCompanion
from services.cycle import CycleSetup, compute_status, cycles
from services.memory import Memory


def run(coro):
    return asyncio.run(coro)


D = date(2026, 10, 15)


def test_cycle_status_from_setup_only():
    s = compute_status([D - timedelta(days=9)], cycle_length=28, period_length=5, today=D)
    assert s.cycle_day == 10
    assert s.next_period_expected == D + timedelta(days=19)
    assert s.phase in ("follicular", "fertile_window") and not s.on_period
    assert s.days_late == 0


def test_cycle_average_and_late():
    starts = [D - timedelta(days=d) for d in (105, 75, 45)]  # 30-day cycles, last start 45 days ago
    s = compute_status(starts, cycle_length=28, period_length=5, today=D)
    assert s.average_cycle_length == 30 and s.cycles_logged == 2
    assert s.phase == "late" and s.days_late == 15
    assert any("later than" in n for n in s.notes)


def test_cycle_on_period():
    s = compute_status([D - timedelta(days=1)], cycle_length=28, period_length=5, today=D)
    assert s.on_period and s.phase == "period" and s.cycle_day == 2


def test_cycle_store_roundtrip():
    st = run(cycles.setup("u-cyc", CycleSetup(last_period_start=date.today() - timedelta(days=60), cycle_length=29, period_length=4)))
    assert st.cycle_length_setting == 29
    st = run(cycles.log_start("u-cyc", date.today() - timedelta(days=30)))
    assert st.cycles_logged == 1 and st.average_cycle_length == 30
    st = run(cycles.remove_start("u-cyc", date.today() - timedelta(days=30)))
    assert st.cycles_logged == 0
    assert run(cycles.log_start("nobody", date.today())) is None


class Scripted(MockCompanion):
    """Returns queued turns in order, to test the guardrail loop."""

    def __init__(self, *turns):
        self.turns = list(turns)
        self.prompts = []

    async def respond(self, system, history, text, lang):
        self.prompts.append((system, history, text))
        return self.turns.pop(0)


def test_companion_reply_is_saved_and_recalled():
    c = Companion(engine=MockCompanion(), mem=Memory())
    r = run(c.chat("u1", "Asha", "I feel worried, my sleep is bad and periods are late", "en-IN"))
    assert r.reply and r.question and r.sentiment == "worried"
    assert r.alert.level == "none"
    h = run(c.history("u1"))
    assert [m["role"] for m in h] == ["user", "assistant"]
    assert h[1]["suggestions"]


def test_diagnosis_is_regenerated_then_safe_fallback():
    bad = CompanionTurn(reply="It sounds like you have PCOS.", sentiment="worried")
    good = CompanionTurn(reply="That sounds really hard. A doctor can help find out what is going on.", sentiment="worried")
    eng = Scripted(bad, good)
    r = run(Companion(engine=eng, mem=Memory()).chat("u2", "", "what do I have?", "en-IN"))
    assert r.reply == good.reply and not r.safe_fallback
    assert "blocked" in eng.prompts[1][2]

    eng = Scripted(bad, CompanionTurn(reply="Take metformin 500 mg daily."))
    r = run(Companion(engine=eng, mem=Memory()).chat("u3", "", "what should I take?", "en-IN"))
    assert r.safe_fallback and "PCOS" not in r.reply and "metformin" not in r.reply


def test_red_flag_overrides_calm_model():
    calm = CompanionTurn(reply="That sounds uncomfortable.", see_doctor="no", suggestions=["Rest well."])
    r = run(Companion(engine=Scripted(calm), mem=Memory()).chat("u4", "", "I am soaking a pad every hour and feel dizzy", "en-IN"))
    assert r.alert.level == "emergency"
    assert any(n["number"] == "112" for n in r.alert.numbers)
    assert r.suggestions == []


def test_crisis_shows_helpline():
    r = run(Companion(engine=MockCompanion(), mem=Memory()).chat("u5", "", "I want to die", "en-IN"))
    assert r.alert.level == "crisis"
    assert any(n["number"] == "14416" for n in r.alert.numbers)


def test_model_can_raise_alert():
    worried = CompanionTurn(reply="I'm glad you told me.", see_doctor="soon", doctor_reason="Three months without a period is worth checking.")
    r = run(Companion(engine=Scripted(worried), mem=Memory()).chat("u6", "", "no period since July", "en-IN"))
    assert r.alert.level == "soon" and "worth checking" in r.alert.message


def test_older_messages_are_recalled_into_prompt():
    mem = Memory()
    eng = Scripted(*[CompanionTurn(reply="ok") for _ in range(16)])
    c = Companion(engine=eng, mem=mem)
    run(c.chat("u7", "", "my exams are stressing me and I get headaches", "en-IN"))
    for i in range(14):
        run(c.chat("u7", "", f"just checking in {i}", "en-IN"))
    run(c.chat("u7", "", "the exams stress is back again", "en-IN"))
    system = eng.prompts[-1][0]
    assert "headaches" in system  # older than the recent window, found by recall


def test_herbal_remedy_is_blocked():
    herbal = CompanionTurn(reply="That sounds tiring.", suggestions=["Drink chamomile tea before bed."])
    clean = CompanionTurn(reply="That sounds tiring.", suggestions=["Keep a regular bedtime."])
    r = run(Companion(engine=Scripted(herbal, clean), mem=Memory()).chat("u8", "", "can't sleep", "en-IN"))
    assert r.suggestions == ["Keep a regular bedtime."]


def test_hinglish_message_gets_hinglish_reply_language():
    eng = Scripted(CompanionTurn(reply="Main samajh sakti hoon."))
    r = run(Companion(engine=eng, mem=Memory()).chat("u9", "", "mujhe bahut stress ho raha hai, neend nahi aati", "en-IN"))
    assert r.reply_lang == "hi-IN-Latn"
    assert "Hinglish" in eng.prompts[0][0]
