"""Output guardrail: regex pass, then a fast-model check, then one regeneration, then a safe template."""
import logging
import re
from typing import Awaitable, Callable, Optional

import config
from models.schemas import GuardrailVerdict, ResultCard

log = logging.getLogger("nola.guardrail")
_TEMPLATES = config.load_json(config.KB_DIR / "safe_templates.json")

# Required disclaimers ("not a diagnosis") would otherwise trip the diagnostic pattern, so they are removed before scanning.
_ALLOWED = re.compile(
    r"(is )?not a diagnos\w*|no diagnos\w*|never diagnos\w*|does ?n[o']?t diagnos\w*|(can[’']?t|can ?not|won[’']?t|unable to) (give (you )?a |make a )?diagnos\w*|"
    r"doctor (can|will|may) (make a |give a )?diagnos\w*|diagnosis is made by a doctor|"
    r"(यह )?(कोई )?निदान नहीं",
    re.I,
)
_CONDITIONS = r"(pcos|pmos|pcod|thyroid|hypothyroid\w*|diabetes|endometriosis|anaemia|anemia|infection|a (hormonal )?(condition|disorder|disease|syndrome))"
BANNED: dict[str, list[re.Pattern]] = {
    "diagnostic": [
        re.compile(rf"\byou (have|has|might have|probably have|likely have)\s+{_CONDITIONS}", re.I),
        re.compile(r"\byou(?:'re| are) (suffering|diagnosed)", re.I),
        re.compile(r"\bdiagnos(is|ed|e)\b", re.I),
        re.compile(r"\bconfirmed\b", re.I),
        re.compile(rf"\baapko\s+.{{0,30}}{_CONDITIONS}.{{0,10}}\bhai\b", re.I),
        re.compile(r"आपको\s.{0,30}(पीसीओएस|पीसीओडी|पीएमओएस|pcos|pmos|थायरॉइड).{0,15}है", re.I),
        re.compile(rf"\bninage\s+.{{0,30}}{_CONDITIONS}.{{0,10}}\bide\b", re.I),
        re.compile(rf"\bungalukku\s+.{{0,30}}{_CONDITIONS}.{{0,10}}\birukku\b", re.I),
        # TODO(team): native-script Kannada/Tamil diagnostic patterns, verified by native speakers.
    ],
    "medicine": [
        re.compile(r"\b(metformin|letrozole|clomiphene|clomid|spironolactone|inositol|myo-inositol|ocps?)\b", re.I),
        re.compile(r"\b(birth control|contraceptive|oral contraceptive)s?\s*pills?\b|\boral contraceptives?\b", re.I),
        re.compile(r"\d+\s?(mg|mcg|ml|tablets?)\b", re.I),
    ],
    "weight_numbers": [
        re.compile(r"\d+\s?(kg|kgs|kilos?|calories|calorie|kcal)\b", re.I),
        re.compile(r"\bbmi\b", re.I),
    ],
}
# Companion replies are free text, so home remedies and over-the-counter names are blocked there as well.
REMEDIES = re.compile(
    r"\b(herbal|ayurved\w*|homeopath\w*|kadha|chamomile|ajwain|turmeric|haldi|fenugreek|methi|cinnamon|ginger tea|"
    r"supplements?|vitamins?|iron (tablets?|pills?)|painkillers?|paracetamol|ibuprofen|mefenamic|meftal|aspirin|dolo|crocin|combiflam)\b",
    re.I,
)
_ADOLESCENT = re.compile(r"ultra\s?sound|sonograph|\bamh\b|अल्ट्रासाउंड|एएमएच", re.I)


def _strings(result: ResultCard) -> list[str]:
    out: list[str] = []

    def walk(v):
        if isinstance(v, str):
            out.append(v)
        elif isinstance(v, dict):
            for x in v.values():
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)

    walk(result.model_dump(exclude={"disclaimer", "urgency", "language", "learn_more"}))
    return out


def text_violations(texts: list[str], adolescent: bool = False, remedies: bool = False) -> list[str]:
    reasons = []
    for s in texts:
        clean = _ALLOWED.sub(" ", s)
        if remedies and (m := REMEDIES.search(clean)):
            reasons.append(f"remedy: '{m.group(0)}'")
        for cat, pats in BANNED.items():
            for p in pats:
                m = p.search(clean)
                if m:
                    reasons.append(f"{cat}: '{m.group(0)}'")
        if adolescent and _ADOLESCENT.search(clean):
            reasons.append("adolescent: ultrasound/AMH mentioned")
    return sorted(set(reasons))


def regex_check(result: ResultCard) -> GuardrailVerdict:
    reasons = text_violations(_strings(result), result.adolescent)
    if not result.seek_urgent_care_if:
        reasons.append("missing: seek_urgent_care_if")
    return GuardrailVerdict(passed=not reasons, reasons=sorted(set(reasons)))


def safe_template(urgency: str, lang: str, adolescent: bool = False) -> ResultCard:
    tier = urgency if urgency in ("see_doctor_soon", "routine", "self_monitor") else "see_doctor_soon"
    by_lang = _TEMPLATES.get(lang) or _TEMPLATES["en-IN"]
    t = by_lang[tier]
    return ResultCard(
        urgency=tier,
        reflection=t["reflection"],
        may_be_associated_with=[],
        conditions_to_discuss=[],
        who_to_see=[{"specialist": "Gynaecologist", "why": t["who"], "low_cost_option": "Government hospital / PHC or eSanjeevani"}],
        meanwhile=[t["headline"]],
        seek_urgent_care_if=t["urgent"],
        spoken_script=t["spoken"],
        disclaimer="This is health information, not a diagnosis. Please consult a doctor.",
        adolescent=adolescent,
        language=lang,
        used_safe_template=True,
    )


ModelCheck = Callable[[ResultCard], Awaitable[GuardrailVerdict]]
Regenerate = Callable[[list[str]], Awaitable[ResultCard]]


async def _verdict(result: ResultCard, model_check: Optional[ModelCheck]) -> GuardrailVerdict:
    v = regex_check(result)
    if v.passed and model_check is not None:
        try:
            v = await model_check(result)
        except Exception as e:  # a failing checker must not block a regex-clean answer
            log.warning("guardrail model check failed: %s", type(e).__name__)
    return v


async def check_and_fix(result: ResultCard, lang: str, model_check: Optional[ModelCheck] = None,
                        regenerate: Optional[Regenerate] = None) -> ResultCard:
    v = await _verdict(result, model_check)
    if v.passed:
        return result
    log.info("guardrail fail #1: %s", v.reasons)
    if regenerate is not None:
        try:
            second = await regenerate(v.reasons)
            second.adolescent = result.adolescent
            v2 = await _verdict(second, model_check)
            if v2.passed:
                return second
            log.info("guardrail fail #2: %s", v2.reasons)
        except Exception as e:
            log.warning("guardrail regenerate failed: %s", type(e).__name__)
    log.info("guardrail: using safe template (%s, %s)", result.urgency, lang)
    return safe_template(result.urgency, lang, result.adolescent)
