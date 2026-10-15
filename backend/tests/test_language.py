import asyncio

import config
from services.language import LanguageDetector, base_code, prompt_label

det = LanguageDetector()  # tests run in MOCK mode, so Sarvam LID is skipped and the local rules decide


def detect(text, ui="en-IN", previous=None):
    return asyncio.run(det.detect(text, ui, previous)).code


def test_hinglish_typed_in_english_letters():
    assert detect("mujhe bahut stress ho raha hai, periods late hain") == "hi-IN-Latn"
    assert detect("yaar cramps bahut bad hain, kuch samajh nahi aa raha") == "hi-IN-Latn"


def test_plain_english_stays_english():
    assert detect("My period is late and I feel anxious about exams") == "en-IN"


def test_native_scripts():
    assert detect("मुझे बहुत थकान लग रही है") == "hi-IN"
    assert detect("ನನಗೆ ತುಂಬಾ ಸುಸ್ತಾಗಿದೆ") == "kn-IN"
    assert detect("எனக்கு ரொம்ப சோர்வா இருக்கு") == "ta-IN"
    assert detect("मला खूप थकवा आला आहे", ui="mr-IN") == "mr-IN"


def test_short_reply_keeps_previous_style():
    assert detect("ok thanks", previous="hi-IN-Latn") == "hi-IN-Latn"
    assert detect("ok thanks") == "en-IN"


def test_labels():
    assert base_code("hi-IN-Latn") == "hi-IN"
    assert "Hinglish" in prompt_label("hi-IN-Latn") and "never use Devanagari" in prompt_label("hi-IN-Latn")
    assert prompt_label("hi-IN") == "Hindi"
    assert config.lang_name("hi-IN-Latn") == "Hinglish"
