"""Audio normalisation around Sarvam.

In:  whatever the browser recorded -> 16 kHz mono s16 WAV under 30 s (what Saaras works best with).
Out: one or more Bulbul WAV chunks -> a single MP3 (small, plays on Android + iOS) or WAV.
ffmpeg is used when available; without it, PCM WAV is handled in pure Python and other input is passed through,
since Sarvam auto-detects most codecs.
"""
import asyncio
import io
import logging
import subprocess
import tempfile
import wave
from dataclasses import dataclass
from pathlib import Path

import config

log = logging.getLogger("sakhi.audio")
TARGET_RATE = 16000


class AudioError(Exception):
    pass


@dataclass
class WavInfo:
    rate: int
    channels: int
    sampwidth: int
    seconds: float


def wav_info(data: bytes) -> WavInfo | None:
    try:
        with wave.open(io.BytesIO(data)) as w:
            frames, rate = w.getnframes(), w.getframerate()
            return WavInfo(rate, w.getnchannels(), w.getsampwidth(), frames / rate if rate else 0.0)
    except (wave.Error, EOFError):
        return None


def _trim_wav(data: bytes, max_seconds: float) -> bytes:
    with wave.open(io.BytesIO(data)) as r:
        params = r.getparams()
        frames = r.readframes(int(max_seconds * r.getframerate()))
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setparams(params)
        w.writeframes(frames)
    return out.getvalue()


def _sniff_ext(data: bytes) -> str:
    head = data[:16]
    if head[:4] == b"RIFF":
        return ".wav"
    if head[:4] == b"\x1aE\xdf\xa3":
        return ".webm"
    if head[4:8] == b"ftyp":
        return ".m4a"
    if head[:4] == b"OggS":
        return ".ogg"
    if head[:3] == b"ID3" or head[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
        return ".mp3"
    return ".bin"


def _run_ffmpeg(args: list[str], inputs: dict[str, bytes], output_name: str) -> bytes:
    # Temp files, not pipes: iOS MP4/M4A recordings often put the index at the end, which needs a seekable input.
    with tempfile.TemporaryDirectory(dir=config.AUDIO_TMP_DIR) as tmp:
        tmpdir = Path(tmp)
        for name, blob in inputs.items():
            (tmpdir / name).write_bytes(blob)
        cmd = [config.FFMPEG_PATH, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
               *[a.replace("{tmp}", str(tmpdir)) for a in args], str(tmpdir / output_name)]
        proc = subprocess.run(cmd, capture_output=True, timeout=20)
        if proc.returncode != 0:
            raise AudioError(proc.stderr.decode(errors="replace")[-300:])
        return (tmpdir / output_name).read_bytes()


async def ffmpeg(args: list[str], inputs: dict[str, bytes], output_name: str) -> bytes:
    # A worker thread rather than asyncio subprocesses: uvicorn --reload on Windows runs a selector loop,
    # which cannot spawn asyncio subprocesses.
    return await asyncio.to_thread(_run_ffmpeg, args, inputs, output_name)


async def prepare_for_stt(data: bytes) -> tuple[bytes, str, float | None]:
    """Returns (audio bytes, filename for the upload, duration in seconds if known)."""
    info = wav_info(data)
    ideal = info and info.rate == TARGET_RATE and info.channels == 1 and info.sampwidth == 2
    if ideal:
        if info.seconds > config.STT_MAX_SECONDS:
            data = _trim_wav(data, config.STT_MAX_SECONDS)
        return data, "speech.wav", min(info.seconds, config.STT_MAX_SECONDS)

    if config.FFMPEG_PATH:
        ext = _sniff_ext(data)
        try:
            out = await ffmpeg(
                ["-i", "{tmp}/in" + ext, "-t", str(config.STT_MAX_SECONDS), "-vn", "-ac", "1", "-ar", str(TARGET_RATE),
                 "-sample_fmt", "s16", "-af", "highpass=f=60", "-f", "wav"],
                {"in" + ext: data}, "out.wav")
            conv = wav_info(out)
            return out, "speech.wav", conv.seconds if conv else None
        except (AudioError, subprocess.TimeoutExpired, OSError) as e:
            log.warning("ffmpeg could not convert input, sending as recorded: %s", str(e)[:120])

    if info and info.seconds > config.STT_MAX_SECONDS:
        data = _trim_wav(data, config.STT_MAX_SECONDS)
    log.info("no ffmpeg; sending audio as recorded")
    return data, "speech" + _sniff_ext(data).replace(".bin", ".wav"), info.seconds if info else None


def _concat_wavs_python(chunks: list[bytes]) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        for i, c in enumerate(chunks):
            with wave.open(io.BytesIO(c)) as r:
                if i == 0:
                    w.setparams(r.getparams())
                w.writeframes(r.readframes(r.getnframes()))
    return out.getvalue()


async def combine_tts(chunks: list[bytes]) -> tuple[bytes, str]:
    """Joins Bulbul WAV chunks into one track. Returns (bytes, mime)."""
    if not chunks:
        raise AudioError("no audio")
    want_mp3 = config.TTS_OUTPUT_FORMAT == "mp3" and bool(config.FFMPEG_PATH)
    if not want_mp3:
        return (chunks[0] if len(chunks) == 1 else _concat_wavs_python(chunks)), "audio/wav"
    inputs = {f"c{i}.wav": c for i, c in enumerate(chunks)}
    args: list[str] = []
    for name in inputs:
        args += ["-i", "{tmp}/" + name]
    n = len(chunks)
    graph = "".join(f"[{i}:a]" for i in range(n)) + f"concat=n={n}:v=0:a=1[a]"
    args += ["-filter_complex", graph, "-map", "[a]", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k"]
    try:
        return await ffmpeg(args, inputs, "out.mp3"), "audio/mpeg"
    except (AudioError, subprocess.TimeoutExpired, OSError) as e:
        log.warning("mp3 encode failed, serving wav: %s", str(e)[:120])
        return (chunks[0] if n == 1 else _concat_wavs_python(chunks)), "audio/wav"
