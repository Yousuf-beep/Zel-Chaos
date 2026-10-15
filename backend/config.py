import json
import os
import shutil
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR.parent / ".env")
load_dotenv(BASE_DIR / ".env")

APP_NAME = "Sakhi"


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
SARVAM_API_KEY = os.getenv("SARVAM_API_KEY", "")
SARVAM_BASE_URL = os.getenv("SARVAM_BASE_URL", "https://api.sarvam.ai").rstrip("/")
# TODO(verify): Sarvam docs quickstart also shows saaras:v4; confirm which is enabled on our account.
SARVAM_STT_MODEL = os.getenv("SARVAM_STT_MODEL", "saaras:v3")
SARVAM_TTS_MODEL = os.getenv("SARVAM_TTS_MODEL", "bulbul:v3")
CLAUDE_FAST_MODEL = os.getenv("CLAUDE_FAST_MODEL", "claude-haiku-5-5")
CLAUDE_MAIN_MODEL = os.getenv("CLAUDE_MAIN_MODEL", "claude-sonnet-5-5")
# Groq Cloud (OpenAI-compatible API) runs every LLM step: extraction, explanation, guardrail check and the companion chat.
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

# MOCK_MODE=true forces every mock. Otherwise each service is real only when its key is present,
# so the app always runs end-to-end.
MOCK_MODE = _bool("MOCK_MODE", True)
MOCK_SPEECH = MOCK_MODE or not SARVAM_API_KEY
MOCK_LLM = MOCK_MODE or not GROQ_API_KEY

# Supabase Postgres holds accounts, cycle data and companion history. Empty = local SQLite (tests/offline dev) and
# in-process chat memory.
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
DB_POOL_MAX = int(os.getenv("DB_POOL_MAX", "10"))
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
HISTORY_TTL_DAYS = int(os.getenv("HISTORY_TTL_DAYS", "90"))
HISTORY_RECENT_TURNS = 12  # messages sent verbatim to the model each turn
HISTORY_MAX_MESSAGES = 400  # per user, oldest trimmed
NOTES_EVERY_MESSAGES = 10  # refresh the long-term notes summary this often

FFMPEG_PATH = os.getenv("FFMPEG_PATH", "").strip() or shutil.which("ffmpeg") or ""
if FFMPEG_PATH and not Path(FFMPEG_PATH).is_file():
    FFMPEG_PATH = shutil.which("ffmpeg") or ""
AUDIO_TMP_DIR = os.getenv("AUDIO_TMP_DIR", "").strip() or None
TTS_OUTPUT_FORMAT = os.getenv("TTS_OUTPUT_FORMAT", "mp3").strip().lower()
TTS_PACE = float(os.getenv("TTS_PACE", "1.0"))
TTS_SAMPLE_RATE = 22050
STT_MAX_SECONDS = 29.5  # Sarvam REST STT accepts clips under 30 s.
DEMO_MODE = _bool("DEMO_MODE", False)
MAX_FOLLOWUPS = int(os.getenv("MAX_FOLLOWUPS", "4"))
SESSION_TTL_MIN = int(os.getenv("SESSION_TTL_MIN", "30"))
AUTH_DB_PATH = os.getenv("AUTH_DB_PATH", "").strip() or str(BASE_DIR / "data" / "sakhi.db")
AUTH_TTL_DAYS = int(os.getenv("AUTH_TTL_DAYS", "30"))
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]

SARVAM_TIMEOUT_S = 15
CLAUDE_TIMEOUT_S = 25
GROQ_TIMEOUT_S = 30
TTS_MAX_CHARS = 2500

KB_DIR = BASE_DIR / "kb"
PROMPTS_DIR = BASE_DIR / "prompts"


def load_json(path: Path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


LANGUAGES = load_json(BASE_DIR / "config" / "languages.json")
LANG_BY_CODE = {l["code"]: l for l in LANGUAGES["languages"]}


def lang_name(code: str) -> str:
    """'hi-IN-Latn' (Hindi typed in English letters) reads as 'Hinglish'."""
    if code.endswith("-Latn"):
        base = LANG_BY_CODE.get(code[:-5], {}).get("english_name", "English")
        return "Hinglish" if code == "hi-IN-Latn" else f"{base} (in English letters)"
    return LANG_BY_CODE.get(code, {}).get("english_name", "English")
