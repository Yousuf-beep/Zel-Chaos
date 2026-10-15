"use client";

import { useEffect, useRef, useState } from "react";
import Mascot, { type MascotMood } from "@/components/Mascot";
import { api, type CompanionAlert, type CompanionReply } from "@/lib/api";
import { MAX_RECORD_MS, startRecording, type Recorder } from "@/lib/audio";
import { playSfx } from "@/lib/sound";
import { speak, type Speech } from "@/lib/speak";
import { useStore } from "@/lib/store";
import { AlertCard } from "./Message";
import { IconCaptions, IconClose, IconMic, IconMicOff } from "./icons";

type State = "starting" | "listening" | "thinking" | "speaking" | "paused";

// Hands-free turn taking: speech is detected from the mic level, and a pause of SILENCE_MS after it ends the turn.
const SPEECH_LEVEL = 0.12;
const SILENCE_LEVEL = 0.07;
const SPEECH_MIN_MS = 180;
const SILENCE_MS = 1300;

// Full-screen voice conversation with Nola. Every turn is sent through the same chat as typed messages, so closing
// voice mode drops her back into the text thread with everything said so far.
export default function VoiceMode({ onTurn, onClose }: { onTurn: (text: string) => Promise<CompanionReply | null>; onClose: () => void }) {
  const { t, lang } = useStore();
  const [state, setState] = useState<State>("starting");
  const [captions, setCaptions] = useState(true);
  const [heard, setHeard] = useState("");
  const [said, setSaid] = useState("");
  const [note, setNote] = useState("");
  const [alert, setAlert] = useState<CompanionAlert | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const rec = useRef<Recorder | null>(null);
  const speech = useRef<Speech | null>(null);
  const raf = useRef(0);
  const closed = useRef(false);
  const stateRef = useRef<State>("starting");
  // The loop below outlives renders, so it reads the latest props through refs.
  const onTurnRef = useRef(onTurn);
  onTurnRef.current = onTurn;
  const setS = (s: State) => {
    stateRef.current = s;
    setState(s);
  };

  const level = (v: number) => stage.current?.style.setProperty("--lvl", v.toFixed(3));

  const stopListening = () => {
    cancelAnimationFrame(raf.current);
    level(0);
  };

  const finishTurn = async () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    stopListening();
    setS("thinking");
    try {
      const { transcript } = await api.stt(await r.stop(), lang);
      if (closed.current) return;
      if (!transcript?.trim()) {
        setNote(t("voice.noSpeech"));
        return void listen();
      }
      setHeard(transcript.trim());
      setSaid("");
      const reply = await onTurnRef.current(transcript.trim());
      if (closed.current) return;
      if (!reply) {
        setNote(t("talk.error"));
        return setS("paused");
      }
      setAlert(reply.alert.level === "none" ? null : reply.alert);
      const text = [reply.reply, reply.question].filter(Boolean).join(" ");
      setSaid(text);
      setS("speaking");
      const s = speak(text, reply.reply_lang || lang);
      speech.current = s;
      await s.done;
      if (speech.current === s && !closed.current && stateRef.current === "speaking") {
        speech.current = null;
        listen();
      }
    } catch {
      if (closed.current) return;
      setNote(t("talk.error"));
      setS("paused");
    }
  };

  const listen = async () => {
    if (closed.current) return;
    setS("starting");
    try {
      const r = await startRecording();
      if (closed.current) return r.cancel();
      rec.current = r;
    } catch {
      setNote(t("talk.micDenied"));
      return setS("paused");
    }
    setS("listening");
    const started = performance.now();
    let speechSince = 0;
    let spoke = false;
    let quietSince = 0;
    const tick = () => {
      const r = rec.current;
      if (!r) return;
      const v = r.level();
      level(v);
      const now = performance.now();
      if (v > SPEECH_LEVEL) {
        speechSince ||= now;
        quietSince = 0;
        if (now - speechSince > SPEECH_MIN_MS && !spoke) {
          spoke = true;
          setNote("");
        }
      } else {
        speechSince = 0;
        if (spoke && v < SILENCE_LEVEL) quietSince ||= now;
      }
      if ((spoke && quietSince && now - quietSince > SILENCE_MS) || now - started > MAX_RECORD_MS) return void finishTurn();
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    closed.current = false;
    playSfx("voice");
    listen();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && end();
    window.addEventListener("keydown", onKey);
    return () => {
      closed.current = true;
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf.current);
      rec.current?.cancel();
      speech.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const end = () => {
    closed.current = true;
    playSfx("voice");
    onClose();
  };

  const tapNola = () => {
    if (stateRef.current === "listening") finishTurn();
    else if (stateRef.current === "speaking") {
      speech.current?.stop();
      speech.current = null;
      listen();
    } else if (stateRef.current === "paused") listen();
  };

  const toggleMic = () => {
    if (stateRef.current === "paused") return void listen();
    cancelAnimationFrame(raf.current);
    rec.current?.cancel();
    rec.current = null;
    speech.current?.stop();
    speech.current = null;
    level(0);
    setS("paused");
  };

  const mood: MascotMood = state === "listening" ? "listening" : state === "thinking" ? "thinking" : state === "speaking" ? "speaking" : "idle";
  const status = {
    starting: t("voice.starting"), listening: t("voice.listening"), thinking: t("voice.thinking"), speaking: t("voice.speaking"), paused: t("voice.paused"),
  }[state];
  const hint = state === "listening" ? t("voice.tapToSend") : state === "speaking" ? t("voice.tapToInterrupt") : "";

  return (
    <div className="voice" role="dialog" aria-modal="true" aria-label={t("chatui.voice")} data-state={state}>
      <span className="start-orb" aria-hidden="true" />
      <span className="start-orb two" aria-hidden="true" />
      <div className="voice-top">
        <button type="button" className="voice-chip" aria-pressed={captions} onClick={() => setCaptions((c) => !c)}>
          <IconCaptions /> {t("voice.captions")}
        </button>
      </div>

      <div className="voice-stage" ref={stage}>
        <Mascot size="voice" mood={mood} label={hint || status} onTap={tapNola} />
        <p className="voice-status" aria-live="polite">{status}</p>
        <p className="voice-hint">{note || hint}</p>
      </div>

      {alert && <div className="voice-alert"><AlertCard alert={alert} /></div>}
      {captions && (heard || said) && (
        <div className="voice-captions" aria-live="polite">
          {heard && <p className="vc-you">{heard}</p>}
          {said && <p className="vc-nola">{said}</p>}
        </div>
      )}

      <div className="voice-controls">
        <button type="button" className="voice-btn" onClick={toggleMic} aria-pressed={state === "paused"} aria-label={state === "paused" ? t("voice.unmute") : t("voice.mute")} title={state === "paused" ? t("voice.unmute") : t("voice.mute")}>
          {state === "paused" ? <IconMicOff /> : <IconMic />}
        </button>
        <button type="button" className="voice-btn voice-end" data-sfx="voice" onClick={end} aria-label={t("voice.end")} title={t("voice.end")}>
          <IconClose />
        </button>
      </div>
    </div>
  );
}
