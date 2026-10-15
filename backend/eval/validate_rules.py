"""Checks the deterministic PCOS-pattern rules against labelled patient data and writes eval/dataset_results.md.

Dataset: "Polycystic ovary syndrome (PCOS)" by Prasoon Kottarathil (Kaggle) — 541 women from 10 hospitals in
Kerala, India, with a doctor's PCOS (Y/N) label. Only the self-reportable columns are used; labs and ultrasound
are ignored because Sakhi can never observe them. The licence is unclear, so the CSV is downloaded on first run
into eval/data/ (git-ignored) and verified by hash, never committed.

Usage: python eval/validate_rules.py [--csv PATH]
"""
import argparse
import csv
import hashlib
import sys
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from models.schemas import URGENCY_ORDER, ExtractionResult, Symptom  # noqa: E402
from services import rules  # noqa: E402

# Kaggle needs a login, so we pin a public mirror of the original PCOS_data.csv to a commit and check its hash.
DATA_URL = ("https://raw.githubusercontent.com/Arpita-Mallick/Polycystic-Ovary-Syndrome-PCOS-Detection-using-Machine-Learning-/"
            "5cdb35123e12414dbf732d4d278ff81da20b8cd6/PCOS_data.csv")
DATA_SHA256 = "4c2b8fddb281239f1cfba6581deb5b429f95a152f63b2e9f06749d7b75928d8d"
DATA_PATH = ROOT / "eval" / "data" / "pcos_kerala.csv"

# Dataset Y/N column -> Sakhi canonical symptom name (see kb/glossary.json).
SYMPTOM_COLUMNS = {
    "hair growth(Y/N)": "hirsutism",
    "Pimples(Y/N)": "acne",
    "Hair loss(Y/N)": "scalp_hair_thinning",
    "Skin darkening (Y/N)": "acanthosis",
    "Weight gain(Y/N)": "weight_gain_abdominal",
}
# Cycle(R/I) is coded 2 = regular, 4 = irregular; one row has 5, which we treat as irregular.
IRREGULAR_CODES = {"4", "5"}
# "Cycle length(days)" holds bleeding days (0-12), not cycle length, so it cannot be used for the >35-day rule.


def fetch(path: Path = DATA_PATH) -> Path:
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        print(f"Downloading dataset to {path} ...")
        with urllib.request.urlopen(DATA_URL, timeout=60) as r:
            data = r.read()
        digest = hashlib.sha256(data).hexdigest()
        if digest != DATA_SHA256:
            raise SystemExit(f"Hash mismatch for downloaded dataset: {digest}")
        path.write_bytes(data)
    return path


def load(path: Path) -> list[dict]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        return [{k.strip(): (v or "").strip() for k, v in r.items() if k} for r in csv.DictReader(f)]


def to_extraction(row: dict) -> ExtractionResult:
    """What Sakhi would know if this woman described only her self-reportable symptoms."""
    ex = ExtractionResult(pregnancy_possible="no")
    if row.get("Age (yrs)", "").isdigit():
        ex.age = int(row["Age (yrs)"])
    if row.get("Cycle(R/I)") in IRREGULAR_CODES:
        ex.cycle.pattern = "irregular"
        ex.symptoms.append(Symptom(name="irregular_periods", verbatim="(dataset: irregular cycle)"))
    elif row.get("Cycle(R/I)") == "2":
        ex.cycle.pattern = "regular"
    for col, name in SYMPTOM_COLUMNS.items():
        if row.get(col) == "1":
            ex.symptoms.append(Symptom(name=name, verbatim=f"(dataset: {col})"))
    return rules.recompute_signals(ex)


def predictions(ex: ExtractionResult) -> dict[str, bool]:
    sig = ex.pcos_pattern_signals
    level, _ = rules.urgency_baseline(ex, rules.scan_extracted(ex))
    return {
        "Sakhi baseline >= routine (live rule)": URGENCY_ORDER[level] >= URGENCY_ORDER["routine"],
        "Cycle + androgen (guideline pattern)": sig.cycle_irregularity and sig.androgen_signs,
        "Any 2 of cycle / androgen / metabolic": sum((sig.cycle_irregularity, sig.androgen_signs, sig.metabolic_signs)) >= 2,
        "Cycle irregularity alone": sig.cycle_irregularity,
        "Any androgen sign alone": sig.androgen_signs,
    }


def scores(tp: int, fp: int, fn: int, tn: int) -> dict[str, float]:
    div = lambda a, b: a / b if b else 0.0  # noqa: E731
    return {"sensitivity": div(tp, tp + fn), "specificity": div(tn, tn + fp),
            "ppv": div(tp, tp + fp), "npv": div(tn, tn + fn)}


def evaluate(rows: list[dict]) -> tuple[dict, dict, int, int]:
    confusion: dict[str, Counter] = {}
    feature = Counter()
    pos = neg = 0
    for row in rows:
        label = row.get("PCOS (Y/N)") == "1"
        pos += label
        neg += not label
        ex = to_extraction(row)
        for name in ex.symptom_names():
            feature[(name, label)] += 1
        for rule, hit in predictions(ex).items():
            key = ("tp" if label else "fp") if hit else ("fn" if label else "tn")
            confusion.setdefault(rule, Counter())[key] += 1
    return confusion, feature, pos, neg


def report(confusion: dict, feature: Counter, pos: int, neg: int) -> str:
    pct = lambda x: f"{100 * x:.0f}%"  # noqa: E731
    out = ["# Sakhi rules vs. labelled PCOS data", "",
           f"Dataset: Kottarathil PCOS dataset (Kerala, India), {pos + neg} women, {pos} with a PCOS diagnosis, {neg} without.",
           "Only self-reportable columns are used (cycle regularity, hair growth, pimples, hair loss, skin darkening, weight gain).",
           "Sakhi is a care-navigation tool, so **sensitivity** (diagnosed women who would be told to see a doctor) matters most;",
           "low specificity means extra doctor visits, not missed cases. The sample is hospital-based, so PPV is higher than in the general population.", "",
           "| Rule | Sensitivity | Specificity | PPV | NPV | TP | FP | FN | TN |", "|---|---|---|---|---|---|---|---|---|"]
    for rule, c in confusion.items():
        s = scores(c["tp"], c["fp"], c["fn"], c["tn"])
        out.append(f"| {rule} | {pct(s['sensitivity'])} | {pct(s['specificity'])} | {pct(s['ppv'])} | {pct(s['npv'])} "
                   f"| {c['tp']} | {c['fp']} | {c['fn']} | {c['tn']} |")
    out += ["", "## How common each symptom is", "",
            "| Symptom | With PCOS | Without PCOS | Ratio |", "|---|---|---|---|"]
    names = sorted({n for n, _ in feature}, key=lambda n: -feature[(n, True)] / max(pos, 1))
    for n in names:
        a, b = feature[(n, True)] / max(pos, 1), feature[(n, False)] / max(neg, 1)
        out.append(f"| {n} | {pct(a)} | {pct(b)} | {a / b if b else float('inf'):.1f}x |")
    return "\n".join(out) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--csv", type=Path, help="use a local copy instead of downloading")
    args = ap.parse_args()
    rows = load(args.csv or fetch())
    text = report(*evaluate(rows))
    (ROOT / "eval" / "dataset_results.md").write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
