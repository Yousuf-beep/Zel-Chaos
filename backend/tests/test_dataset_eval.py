import sys
from pathlib import Path

import config

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "eval"))
import validate_rules as vr  # noqa: E402

GLOSSARY = config.load_json(config.KB_DIR / "glossary.json")["symptoms"]


def row(pcos="0", cycle="2", **yn):
    r = {"PCOS (Y/N)": pcos, "Age (yrs)": "28", "Cycle(R/I)": cycle}
    r.update({col: "0" for col in vr.SYMPTOM_COLUMNS})
    r.update({col: "1" for col, name in vr.SYMPTOM_COLUMNS.items() if name in yn})
    return r


def test_mapped_names_exist_in_glossary():
    assert set(vr.SYMPTOM_COLUMNS.values()) <= set(GLOSSARY)


def test_irregular_cycle_and_hair_growth_map_to_signals():
    ex = vr.to_extraction(row(cycle="4", hirsutism=1))
    assert ex.cycle.pattern == "irregular"
    assert ex.pcos_pattern_signals.cycle_irregularity and ex.pcos_pattern_signals.androgen_signs
    assert vr.predictions(ex)["Sakhi baseline >= routine (live rule)"]


def test_regular_cycle_with_acne_only_stays_self_monitor():
    ex = vr.to_extraction(row(acne=1))
    assert ex.cycle.pattern == "regular"
    assert not vr.predictions(ex)["Sakhi baseline >= routine (live rule)"]


def test_evaluate_counts_confusion():
    rows = [row("1", "4", hirsutism=1), row("1", "2", acne=1), row("0", "4", acne=1), row("0", "2")]
    confusion, _, pos, neg = vr.evaluate(rows)
    c = confusion["Sakhi baseline >= routine (live rule)"]
    assert (pos, neg) == (2, 2)
    assert (c["tp"], c["fn"], c["fp"], c["tn"]) == (1, 1, 1, 1)
