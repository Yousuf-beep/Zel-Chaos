import asyncio

from services.orchestrator import Orchestrator
from services.session import store

orch = Orchestrator()


def run(coro):
    return asyncio.run(coro)


def test_urgent_path():
    r = run(orch.analyze("t-urgent", "soaking a pad every hour and fainted", "en-IN"))
    assert r.type == "urgent"
    assert r.payload["tier"] == "emergency"
    assert any(n["number"] == "112" for b in r.payload["blocks"] for n in b["numbers"])


def test_crisis_path():
    r = run(orch.analyze("t-crisis", "I want to die", "en-IN"))
    assert r.type == "urgent" and r.payload["tier"] == "crisis"


def test_confirm_followup_result_path():
    sid = "t-flow"
    store.delete(sid)
    r = run(orch.analyze(sid, "periods 3 mahine se nahi aaye, chehre pe pimples", "hi-IN"))
    assert r.type == "confirm"
    names = {c["name"] for c in r.payload["chips"]}
    assert {"missed_periods", "acne"} <= names

    r = run(orch.confirm(sid, r.payload["chips"]))
    assert r.type == "followup" and r.payload["question_key"] == "pregnancy_possible"
    r = run(orch.answer(sid, "pregnancy_possible", "no"))
    assert r.type == "followup" and r.payload["question_key"] == "age_menarche"
    r = run(orch.answer(sid, "age_menarche", {"age": 24, "menarche": "gt8"}))
    assert r.type == "result"
    p = r.payload
    assert p["urgency"] in ("routine", "see_doctor_soon")
    assert len(p["conditions_to_discuss"]) >= 2
    assert p["seek_urgent_care_if"]
    assert "Pelvic ultrasound" in p["tests_doctor_may_consider"]


def test_teen_gets_no_ultrasound():
    sid = "t-teen"
    store.delete(sid)
    r = run(orch.analyze(sid, "I am 15 years old, periods irregular and pimples. periods started 1 years ago", "en-IN"))
    r = run(orch.confirm(sid, r.payload["chips"]))
    for _ in range(4):
        if r.type != "followup":
            break
        key = r.payload["question_key"]
        ans = {"pregnancy_possible": "no", "age_menarche": {"age": 15, "menarche": "lt1"}}.get(key, "declined")
        if r.payload["kind"] == "multi":
            ans = ["none"]
        r = run(orch.answer(sid, key, ans))
    assert r.type == "result"
    tests = " ".join(r.payload["tests_doctor_may_consider"]).lower()
    assert "ultrasound" not in tests and "amh" not in tests
    assert r.payload["adolescent"]


def test_doctor_card_has_qr_text():
    sid = "t-card"
    store.delete(sid)
    r = run(orch.analyze(sid, "my periods have not come for 4 months and I have chin hair", "en-IN"))
    run(orch.confirm(sid, r.payload["chips"]))
    card = run(orch.doctor_card(sid))
    assert card.header == "Patient-reported information — not a diagnosis"
    assert 0 < len(card.qr_text) <= 1200
