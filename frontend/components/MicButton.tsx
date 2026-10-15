"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_RECORD_MS, startRecording, type Recorder } from "@/lib/audio";
import { useStore } from "@/lib/store";

// Tap to start, tap to stop (auto-stops at the max length). Calls onAudio with a 16 kHz mono WAV.
export default function MicButton({ onAudio, onError, disabled, size }: {
  onAudio: (wav: Blob) => void; onError: (key: string) => void; disabled?: boolean; size?: "sm";
}) {
  const { t } = useStore();
  const [rec, setRec] = useState<Recorder | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const raf = useRef(0);
  const started = useRef(0);

  const stop = async (r = rec) => {
    if (!r) return;
    cancelAnimationFrame(raf.current);
    setRec(null);
    btn.current?.style.setProperty("--lvl", "0");
    try {
      onAudio(await r.stop());
    } catch {
      onError("talk.notHeard");
    }
  };

  useEffect(() => {
    if (!rec) return;
    started.current = performance.now();
    const tick = () => {
      const ms = performance.now() - started.current;
      setElapsed(ms);
      btn.current?.style.setProperty("--lvl", rec.level().toFixed(3));
      if (ms >= MAX_RECORD_MS) return void stop(rec);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec]);

  const live = useRef<Recorder | null>(null);
  live.current = rec;
  useEffect(() => () => live.current?.cancel(), []);

  const toggle = async () => {
    if (rec) return stop();
    if (!navigator.mediaDevices?.getUserMedia) return onError("talk.micDenied");
    try {
      setElapsed(0);
      setRec(await startRecording());
    } catch {
      onError("talk.micDenied");
    }
  };

  const secs = Math.floor(elapsed / 1000);
  return (
    <div className="talk-stage" style={size === "sm" ? { margin: "8px 0 0", gap: 10 } : undefined}>
      <button
        ref={btn}
        className="mic"
        style={size === "sm" ? { width: 92, height: 92 } : undefined}
        data-rec={!!rec}
        onClick={toggle}
        disabled={disabled}
        aria-pressed={!!rec}
        aria-label={rec ? t("talk.tapToStop") : t("talk.tapToStart")}
      >
        <span className="level" aria-hidden="true" />
        <span className="ring" aria-hidden="true" />
        <span className="ring" aria-hidden="true" />
        <span className="ring" aria-hidden="true" />
        {rec ? (
          <svg viewBox="0 0 24 24" aria-hidden="true" style={size === "sm" ? { width: 30, height: 30 } : undefined}><rect x="6" y="6" width="12" height="12" rx="3" fill="currentColor" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" style={size === "sm" ? { width: 30, height: 30 } : undefined}>
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        )}
      </button>
      <div className="mic-label" aria-live="polite">
        {rec ? (
          <>
            <span className="rec-dot" aria-hidden="true" />
            {t("talk.recording")} · 0:{String(secs).padStart(2, "0")}
          </>
        ) : (
          t("talk.tapToStart")
        )}
      </div>
      {rec && (
        <div className="timer-bar" aria-hidden="true">
          <i style={{ "--p": Math.min(1, elapsed / MAX_RECORD_MS) } as React.CSSProperties} />
        </div>
      )}
    </div>
  );
}
