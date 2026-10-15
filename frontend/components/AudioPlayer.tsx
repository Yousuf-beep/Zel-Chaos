"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { b64ToUrl } from "@/lib/audio";
import { useStore } from "@/lib/store";

// Loads after the text is on screen. Multiple TTS chunks play back to back as one track.
export default function AudioPlayer({ text, lang, compact }: { text: string; lang: string; compact?: boolean }) {
  const { t } = useStore();
  const [urls, setUrls] = useState<string[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "playing" | "error">("loading");
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const idx = useRef(0);
  const bars = useMemo(() => Array.from({ length: compact ? 18 : 36 }, (_, i) => 0.35 + 0.65 * Math.abs(Math.sin(i * 1.7 + text.length))), [text, compact]);

  useEffect(() => {
    let cancelled = false;
    let made: string[] = [];
    setState("loading");
    api
      .tts(text, lang)
      .then((r) => {
        if (cancelled) return;
        made = r.parts.map((p) => b64ToUrl(p, r.mime));
        setUrls(made);
        setState("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e?.status === 422 ? t("talk.noTts") : "");
        setState("error");
      });
    return () => {
      cancelled = true;
      audio.current?.pause();
      made.forEach(URL.revokeObjectURL);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, lang]);

  const playFrom = (i: number) => {
    if (!urls) return;
    idx.current = i;
    const a = audio.current ?? new Audio();
    audio.current = a;
    a.src = urls[i];
    a.ontimeupdate = () => a.duration && setProgress((i + a.currentTime / a.duration) / urls.length);
    a.onended = () => (i + 1 < urls.length ? playFrom(i + 1) : (setState("ready"), setProgress(1)));
    a.play().then(() => setState("playing")).catch(() => setState("ready"));
  };

  const toggle = () => {
    if (state === "playing") {
      audio.current?.pause();
      setState("ready");
    } else if (audio.current?.src && progress > 0 && progress < 1) {
      audio.current.play().then(() => setState("playing"));
    } else {
      setProgress(0);
      playFrom(0);
    }
  };

  if (state === "error") return err ? <p className="notice">{err}</p> : null;
  return (
    <div className="audio" data-playing={state === "playing"}>
      <button className="play" onClick={toggle} disabled={state === "loading"} aria-label={state === "playing" ? t("result.pause") : t("result.listen")}>
        {state === "playing" ? (
          <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="3" width="4" height="14" rx="1.5" /><rect x="12" y="3" width="4" height="14" rx="1.5" /></svg>
        ) : (
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.5v13l11-6.5z" /></svg>
        )}
      </button>
      <div className="bars" aria-hidden="true">
        {bars.map((h, i) => (
          <i key={i} data-on={i / bars.length < progress} style={{ "--h": h, "--i": i } as React.CSSProperties} />
        ))}
      </div>
      <span className="lbl">{state === "loading" ? t("result.loadingAudio") : state === "playing" ? t("result.pause") : t("result.listen")}</span>
    </div>
  );
}
