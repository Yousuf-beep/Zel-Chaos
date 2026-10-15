import base64
import hashlib
import logging
from contextlib import asynccontextmanager
from datetime import date, timedelta

from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

import config
from adapters.sarvam import get_speech
from models.schemas import (AnalyzeRequest, AnswerRequest, CompanionRequest, ConfirmRequest, LoginRequest,
                            PeriodStartRequest, SignupRequest, TTSRequest)
from services.auth import AuthError, User, auth
from services.companion import companion
from services.cycle import CycleSetup, cycles
from services.db import db
from services.memory import memory
from services.orchestrator import orchestrator
from services.session import store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
log = logging.getLogger("sakhi")

@asynccontextmanager
async def lifespan(_app: FastAPI):
    await db.open()  # fail fast at startup if Supabase is unreachable
    yield
    await db.close()


app = FastAPI(title=config.APP_NAME, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.ALLOWED_ORIGINS, allow_methods=["*"], allow_headers=["*"])

speech = get_speech()
_tts_cache: dict[str, dict] = {}
_MYTHS = config.load_json(config.KB_DIR / "myths.json")["myths"]
MAX_AUDIO_BYTES = 5 * 1024 * 1024


@app.get("/api/health")
async def health():
    return {"ok": True, "mock_mode": config.MOCK_MODE, "mock_speech": config.MOCK_SPEECH, "mock_llm": config.MOCK_LLM,
            "ffmpeg": bool(config.FFMPEG_PATH), "tts_format": "mp3" if config.TTS_OUTPUT_FORMAT == "mp3" and config.FFMPEG_PATH else "wav",
            "demo_mode": config.DEMO_MODE, "database": db.backend, "memory": memory.backend,
            "models": {"llm": config.GROQ_MODEL, "stt": config.SARVAM_STT_MODEL, "tts": config.SARVAM_TTS_MODEL}}


@app.get("/api/languages")
async def languages():
    return config.LANGUAGES


AUTH_COOKIE = "sakhi_auth"


def _set_auth_cookie(request: Request, response: Response, token: str) -> None:
    https = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
    response.set_cookie(AUTH_COOKIE, token, max_age=config.AUTH_TTL_DAYS * 86400, httponly=True, samesite="lax", secure=https, path="/")


@app.post("/api/auth/signup")
async def signup(req: SignupRequest, request: Request, response: Response):
    try:
        user, token = await auth.signup(req.name, req.handle, req.password)
    except AuthError as e:
        raise HTTPException(e.status, str(e))
    _set_auth_cookie(request, response, token)
    return {"user": user.public()}


@app.post("/api/auth/login")
async def login(req: LoginRequest, request: Request, response: Response):
    try:
        user, token = await auth.login(req.handle, req.password)
    except AuthError as e:
        raise HTTPException(e.status, str(e))
    _set_auth_cookie(request, response, token)
    return {"user": user.public()}


@app.get("/api/auth/me")
async def me(request: Request):
    user = await auth.user_for(request.cookies.get(AUTH_COOKIE))
    return {"user": user.public() if user else None}


@app.post("/api/auth/logout")
async def logout(request: Request, response: Response):
    await auth.logout(request.cookies.get(AUTH_COOKIE))
    response.delete_cookie(AUTH_COOKIE, path="/")
    return {"ok": True}


@app.post("/api/session")
async def new_session():
    return {"session_id": store.create().id}


@app.delete("/api/session/{sid}")
async def delete_session(sid: str):
    store.delete(sid)
    return {"ok": True}


@app.post("/api/stt")
async def stt(file: UploadFile = File(...), lang: str = Form("auto"), mode: str = Form("codemix")):
    audio = await file.read()
    if not audio or len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(400, "Audio missing or too large")
    try:
        return await speech.stt(audio, lang, mode)
    except Exception as e:
        log.warning("stt failed: %s %s", type(e).__name__, str(e)[:200])
        return {"transcript": "", "lang": lang, "confidence": 0}


def _session_error():
    raise HTTPException(404, "Session expired. Please start again.")


@app.post("/api/analyze")
async def analyze(req: AnalyzeRequest):
    return await orchestrator.analyze(req.session_id, req.text, req.lang)


@app.post("/api/confirm")
async def confirm(req: ConfirmRequest):
    try:
        return await orchestrator.confirm(req.session_id, [c.model_dump() for c in req.chips])
    except KeyError:
        _session_error()


@app.post("/api/answer")
async def answer(req: AnswerRequest):
    try:
        return await orchestrator.answer(req.session_id, req.question_key, req.answer)
    except KeyError:
        _session_error()


@app.post("/api/tts")
async def tts(req: TTSRequest):
    key = hashlib.sha256(f"{req.lang}|{req.text}".encode()).hexdigest()
    if key in _tts_cache:
        return _tts_cache[key]
    lang = config.LANG_BY_CODE.get(req.lang.removesuffix("-Latn"), {})
    if not lang.get("tts", False):
        raise HTTPException(422, "Audio replies aren't available in this language yet.")
    try:
        audio_bytes, mime = await speech.tts(req.text, req.lang)
    except Exception as e:
        log.warning("tts failed: %s %s", type(e).__name__, str(e)[:200])
        raise HTTPException(502, "Audio is unavailable right now.")
    b64 = base64.b64encode(audio_bytes).decode()
    out = {"audio_base64": b64, "parts": [b64], "mime": mime}
    _tts_cache[key] = out
    return out


@app.post("/api/doctor-card")
async def doctor_card(req: dict):
    try:
        return await orchestrator.doctor_card(str(req.get("session_id", "")))
    except KeyError:
        _session_error()


@app.get("/api/myths")
async def myths(lang: str = "en-IN"):
    # Localised myth cards are cached into myths.json in Phase 4; English is the fallback.
    return {"lang": lang, "myths": [{"id": m["id"], **(m.get(lang) or m["en"])} for m in _MYTHS]}


async def _require_user(request: Request) -> User:
    user = await auth.user_for(request.cookies.get(AUTH_COOKIE))
    if not user:
        raise HTTPException(401, "Please log in again.")
    return user


def _past_date(raw) -> date:
    try:
        d = date.fromisoformat(str(raw))
    except ValueError:
        raise HTTPException(422, "Enter a valid date.")
    if d > date.today() or d < date.today() - timedelta(days=365):
        raise HTTPException(422, "Pick a date within the last year, not in the future.")
    return d


@app.get("/api/cycle")
async def get_cycle(request: Request):
    return {"cycle": await cycles.status((await _require_user(request)).id)}


@app.put("/api/cycle")
async def setup_cycle(req: CycleSetup, request: Request):
    user = await _require_user(request)
    _past_date(req.last_period_start.isoformat())
    return {"cycle": await cycles.setup(user.id, req)}


@app.post("/api/cycle/period")
async def log_period(req: PeriodStartRequest, request: Request):
    status = await cycles.log_start((await _require_user(request)).id, _past_date(req.start_date))
    if status is None:
        raise HTTPException(409, "Set up cycle tracking first.")
    return {"cycle": status}


@app.delete("/api/cycle/period/{start_date}")
async def remove_period(start_date: str, request: Request):
    return {"cycle": await cycles.remove_start((await _require_user(request)).id, _past_date(start_date))}


@app.post("/api/companion/chat")
async def companion_chat(req: CompanionRequest, request: Request):
    user = await _require_user(request)
    return await companion.chat(user.id, user.name, req.text, req.lang)


@app.get("/api/companion/history")
async def companion_history(request: Request):
    return {"messages": await companion.history((await _require_user(request)).id)}


@app.delete("/api/companion/history")
async def companion_forget(request: Request):
    """Deletes chat history and notes, and the cycle log too, so 'forget me' means everything."""
    user = await _require_user(request)
    await companion.forget(user.id)
    await cycles.delete(user.id)
    return {"ok": True}
