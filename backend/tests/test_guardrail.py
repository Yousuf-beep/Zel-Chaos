import asyncio

import pytest

from models.schemas import ResultCard
from services import guardrail


def card(text="Worth discussing with a doctor.", **kw):
    base = dict(urgency="routine", reflection=text, may_be_associated_with=[], conditions_to_discuss=["a", "b"],
                who_to_see=[], seek_urgent_care_if=["Severe pain"], spoken_script="This is not a diagnosis.",
                disclaimer="This is health information, not a diagnosis.")
    base.update(kw)
    return ResultCard(**base)


@pytest.mark.parametrize("bad", [
    "You have PCOS.",
    "You are suffering from a hormonal condition.",
    "The diagnosis is clear.",
    "This is confirmed.",
    "Take metformin daily.",
    "A birth control pill may help.",
    "Take 500 mg twice a day.",
    "Try to lose 5 kg.",
    "Aim for a lower BMI.",
    "aapko pcos hai",
])
def test_regex_catches_banned(bad):
    assert not guardrail.regex_check(card(bad)).passed


def test_required_disclaimer_is_allowed():
    assert guardrail.regex_check(card("This is not a diagnosis. A doctor can diagnose this properly.")).passed


def test_adolescent_mentions_blocked():
    assert not guardrail.regex_check(card("An ultrasound may help.", adolescent=True)).passed
    assert guardrail.regex_check(card("An ultrasound may help.", adolescent=False)).passed


def test_second_failure_falls_back_to_template():
    async def regenerate(reasons):
        return card("You have PCOS.")

    out = asyncio.run(guardrail.check_and_fix(card("Take metformin."), "en-IN", regenerate=regenerate))
    assert out.used_safe_template
    assert out.urgency == "routine"


def test_regenerate_success_is_used():
    async def regenerate(reasons):
        return card("May be associated with a hormonal pattern.")

    out = asyncio.run(guardrail.check_and_fix(card("Take metformin."), "en-IN", regenerate=regenerate))
    assert not out.used_safe_template
    assert "associated" in out.reflection
