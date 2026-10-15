import re
import unicodedata

_SPACES = re.compile(r"\s+")


def normalise(text: str) -> str:
    """Lowercase, NFC, punctuation/symbols to spaces (apostrophes dropped so "can't" == "cant"), padded with spaces."""
    text = unicodedata.normalize("NFC", text or "").lower().replace("'", "").replace("’", "")
    chars = [" " if unicodedata.category(c)[0] in "PS" else c for c in text]
    return " " + _SPACES.sub(" ", "".join(chars)).strip() + " "


def contains(norm_text: str, phrase: str) -> bool:
    # Anchored at a word start only, so "bleed" also matches "bleeding".
    p = normalise(phrase).rstrip()
    return bool(p.strip()) and p in norm_text
