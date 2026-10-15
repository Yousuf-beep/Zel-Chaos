"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { MAX_RECORD_MS, startRecording, type Recorder } from "@/lib/audio";
import { playSfx } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { IconMic, IconSend, IconStop, IconWave } from "./icons";

// Claude-app style composer: the field grows with the text; the mic dictates into it; the round button opens voice
// mode while the field is empty and becomes Send once there is something to send.
export default function Composer({ busy, onSend, onVoice, onNotice, draft, setDraft }: {
  busy: boolean;
  onSend: (text: string) => void;
  onVoice: () => void;
  onNotice: (msg: string) => void;
  draft: string;
  setDraft: (v: string) => void;
}) {
  const { t, lang } = useStore();
  const field = useRef<HTMLTextAreaElement>(null);
  const [rec, setRec] = useState<Recorder | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const micBtn = useRef<HTMLButtonElement>(null);
  const live = useRef<Recorder | null>(null);
  live.current = rec;

  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [draft]);

  useEffect(() => () => live.current?.cancel(), []);

  useEffect(() => {
    if (!rec) return;
    const started = performance.now();
    let raf = 0;
    const tick = () => {
      micBtn.current?.style.setProperty("--lvl", rec.level().toFixed(3));
      if (performance.now() - started >= MAX_RECORD_MS) return void stopDictation(rec);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec]);

  const stopDictation = async (r = rec) => {
    if (!r) return;
    setRec(null);
    micBtn.current?.style.setProperty("--lvl", "0");
    setTranscribing(true);
    try {
      const { transcript } = await api.stt(await r.stop(), lang);
      if (transcript?.trim()) setDraft((draft ? draft.trimEnd() + " " : "") + transcript.trim());
      else onNotice(t("talk.notHeard"));
    } catch {
      onNotice(t("talk.notHeard"));
    } finally {
      setTranscribing(false);
      field.current?.focus();
    }
  };

  const dictate = async () => {
    if (rec) return stopDictation();
    if (!navigator.mediaDevices?.getUserMedia) return onNotice(t("talk.micDenied"));
    try {
      setRec(await startRecording());
    } catch {
      onNotice(t("talk.micDenied"));
    }
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || busy || rec || transcribing) return;
    playSfx("send");
    onSend(text);
  };

  const hasText = draft.trim().length > 0;
  return (
    <form
      className="composer2"
      data-rec={!!rec}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={field}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={transcribing ? t("chatui.transcribing") : t("chatui.placeholder")}
        aria-label={t("chatui.placeholder")}
        rows={1}
        maxLength={4000}
        lang={lang.split("-")[0]}
        onKeyDown={(e) => {
          // Desktop: Enter sends, Shift+Enter breaks the line. Phones keep Enter for new lines, like the Claude app.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !window.matchMedia("(pointer: coarse)").matches) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="composer2-row">
        <span className="composer2-status" aria-live="polite">
          {rec ? <><span className="rec-dot" aria-hidden="true" />{t("talk.recording")}</> : transcribing ? t("chatui.transcribing") : ""}
        </span>
        <button
          ref={micBtn}
          type="button"
          className="c2-icon c2-mic"
          data-rec={!!rec}
          onClick={dictate}
          disabled={transcribing}
          aria-pressed={!!rec}
          aria-label={rec ? t("chatui.stopDictate") : t("chatui.dictate")}
          title={rec ? t("chatui.stopDictate") : t("chatui.dictate")}
        >
          {rec ? <IconStop /> : <IconMic />}
        </button>
        {hasText ? (
          <button type="submit" className="c2-round" data-sfx="send" disabled={busy || !!rec || transcribing} aria-label={t("chatui.send")} title={t("chatui.send")}>
            <IconSend />
          </button>
        ) : (
          <button type="button" className="c2-round" data-sfx="voice" onClick={onVoice} disabled={!!rec || transcribing} aria-label={t("chatui.voice")} title={t("chatui.voice")}>
            <IconWave />
          </button>
        )}
      </div>
    </form>
  );
}
