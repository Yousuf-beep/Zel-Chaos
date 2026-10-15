import pytest

from models.schemas import ExtractionResult, ResultCard, Symptom, max_urgency
from services import rules

SEEDS = [
    ("I am soaking a pad every hour", "heavy_bleeding", "EMERGENCY"),
    ("heavy bleeding and I fainted", "bleeding_with_faint", "EMERGENCY"),
    ("periods mein bleeding aur bahut chakkar aa raha hai", "bleeding_with_faint", "EMERGENCY"),
    ("sudden severe pain in my lower belly", "severe_pelvic_pain", "EMERGENCY"),
    ("I might be pregnant and there is bleeding", "pregnancy_pain_bleed", "EMERGENCY"),
    ("heavy bleeding after delivery", "postpartum_bleed", "EMERGENCY"),
    ("I have chest pain and can't breathe", "chest_breath_headache", "EMERGENCY"),
    ("I want to die", "self_harm", "CRISIS"),
    ("main jeena nahi chahti", "self_harm", "CRISIS"),
    ("fever and pelvic pain since yesterday", "fever_pelvic_pain", "PROMPT"),
    ("my voice getting deeper", "rapid_virilisation", "PROMPT"),
    ("I have never had a period", "no_period_by_15", "PROMPT"),
    ("I make myself vomit after eating", "starving_purging", "PROMPT"),
]


@pytest.mark.parametrize("text,fid,tier", SEEDS)
def test_scan_catches_seed(text, fid, tier):
    hits = {f.id: f.tier for f in rules.scan(text)}
    assert hits.get(fid) == tier


def test_no_false_alarm_on_common_pcos_text():
    assert rules.scan("periods 3 mahine se nahi aaye, chehre pe pimples") == []
    assert rules.scan("trying to get pregnant, I get period pain") == []


def test_stopping_tier():
    assert rules.stopping_tier(rules.scan("soaking a pad every hour and fainted")) == "emergency"
    assert rules.stopping_tier(rules.scan("I want to die")) == "crisis"
    assert rules.stopping_tier(rules.scan("my voice getting deeper")) is None


def test_max_urgency_never_lowers():
    assert max_urgency("routine", "self_monitor") == "routine"
    assert max_urgency("see_doctor_soon", "routine") == "see_doctor_soon"
    assert max_urgency("self_monitor", "see_doctor_soon") == "see_doctor_soon"


def _card(**kw):
    base = dict(urgency="routine", reflection="r", may_be_associated_with=[], conditions_to_discuss=["PCOS/PMOS"],
                who_to_see=[], seek_urgent_care_if=["x"], spoken_script="s", disclaimer="d",
                tests_doctor_may_consider=["Pregnancy test", "Pelvic ultrasound", "AMH", "Thyroid (TSH)"])
    base.update(kw)
    return ResultCard(**base)


def test_adolescent_filter_strips_ultrasound_and_amh():
    ex = ExtractionResult(age=16, years_since_menarche=2)
    out = rules.apply_adolescent_filters(_card(), ex)
    assert out.adolescent
    assert out.tests_doctor_may_consider == ["Pregnancy test", "Thyroid (TSH)"]


def test_adolescent_filter_unknown_menarche_under_18():
    out = rules.apply_adolescent_filters(_card(), ExtractionResult(age=17))
    assert "AMH" not in out.tests_doctor_may_consider


def test_adult_keeps_ultrasound():
    out = rules.apply_adolescent_filters(_card(), ExtractionResult(age=28, years_since_menarche=15))
    assert "Pelvic ultrasound" in out.tests_doctor_may_consider


def test_ensure_min_conditions():
    out = rules.ensure_min_conditions(_card(conditions_to_discuss=["PCOS/PMOS"]), "en-IN")
    assert len(out.conditions_to_discuss) >= 2


def test_baseline_prompt_flag_forces_see_doctor_soon():
    ex = ExtractionResult()
    level, _ = rules.urgency_baseline(ex, rules.scan("my voice getting deeper"))
    assert level == "see_doctor_soon"


def test_baseline_first_year_is_self_monitor():
    ex = rules.recompute_signals(ExtractionResult(age=13, years_since_menarche=0.5,
                                                  symptoms=[Symptom(name="irregular_periods")]))
    assert rules.urgency_baseline(ex, [])[0] == "self_monitor"


def test_baseline_adult_cycle_plus_androgen_is_routine():
    ex = rules.recompute_signals(ExtractionResult(age=25, years_since_menarche=12,
                                                  symptoms=[Symptom(name="irregular_periods"), Symptom(name="acne")]))
    assert rules.urgency_baseline(ex, [])[0] == "routine"
