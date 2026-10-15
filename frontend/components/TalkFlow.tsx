"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import FollowUpCard from "@/components/FollowUpCard";
import MicButton from "@/components/MicButton";
import Rise from "@/components/Rise";
import StagedProgress, { type Stage } from "@/components/StagedProgress";
import SymptomChips from "@/components/SymptomChips";
import { api, ApiError, type Chip, type ConfirmPayload, type Flow, type FollowupPayload } from "@/lib/api";
import { useStore } from "@/lib/store";

type Phase = { kind: "input" } | { kind: "busy"; stage: Stage; voice: boolean } | { kind: "confirm"; data: ConfirmPayload } | { kind: "followup"; data: FollowupPayload };

// One conversation flow, two front doors: "call" is voice-first, "chat" is typing-first.
export default function TalkFlow({ mode }: { mode: "call" | "chat" }) {
  const { t, lang, ensureSession, setResult, setUrgent, resetConversation } = useStore();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "input" });
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const prepTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const busy = phase.kind === "busy";
  const voice = mode === "call";

  useEffect(() => () => clearTimeout(prepTimer.current), []);

  const startBusy = (voice: boolean, stage: Stage = "understanding") => {
    setNotice("");
    setPhase({ kind: "busy", stage, voice });
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (stage === "understanding") {
      clearTimeout(prepTimer.current);
      // The backend does not stream stages; after a short wait the last step is shown while the answer is prepared.
      prepTimer.current = setTimeout(() => setPhase((p) => (p.kind === "busy" ? { ...p, stage: "preparing" } : p)), 1400);
    }
  };

  const handle = (flow: Flow, fallback: Phase) => {
    clearTimeout(prepTimer.current);
    if (flow.type === "urgent") {
      setUrgent(flow.payload);
      router.push("/urgent");
    } else if (flow.type === "result") {
      setResult(flow.payload);
      router.push("/result");
    } else if (flow.type === "confirm") {
      setPhase({ kind: "confirm", data: flow.payload });
    } else if (flow.type === "followup") {
      setPhase({ kind: "followup", data: flow.payload });
    } else {
      setPhase(fallback);
    }
  };

  const fail = async (e: unknown, back: Phase) => {
    clearTimeout(prepTimer.current);
    if (e instanceof ApiError && e.status === 404) {
      await resetConversation();
      setPhase({ kind: "input" });
    } else {
      setPhase(back);
    }
    setNotice(t("talk.error"));
  };

  const send = async (msg: string, voice = false, back: Phase = { kind: "input" }) => {
    if (!msg.trim()) return;
    startBusy(voice);
    try {
      const sid = await ensureSession();
      handle(await api.analyze(sid, msg.trim(), lang), back);
      setText("");
    } catch (e) {
      fail(e, back);
    }
  };

  const onAudio = async (wav: Blob, back: Phase = { kind: "input" }) => {
    startBusy(true, "listening");
    try {
      const r = await api.stt(wav, lang);
      if (!r.transcript?.trim()) {
        setPhase(back);
        setNotice(t("talk.notHeard"));
        return;
      }
      await send(r.transcript, true, back);
    } catch (e) {
      fail(e, back);
    }
  };

  const confirm = async (chips: Chip[], back: Phase) => {
    startBusy(false);
    try {
      handle(await api.confirm(await ensureSession(), chips), back);
    } catch (e) {
      fail(e, back);
    }
  };

  const answer = async (value: unknown, back: Phase, key: string) => {
    startBusy(false);
    try {
      handle(await api.answer(await ensureSession(), key, value), back);
    } catch (e) {
      fail(e, back);
    }
  };

  return (
    <div className="page">
      <div className="column">
        {phase.kind === "input" && voice && (
          <div className="call-stage">
            <Rise className="title-sm" lines={[t("call.title1"), t("call.title2")]} />
            <p className="body call-sub">{t("call.sub")}</p>
            <MicButton onAudio={(w) => onAudio(w)} onError={(k) => setNotice(t(k))} />
            {notice && <p className="notice" role="alert">{notice}</p>}
            <Link className="text-link switch-link" href="/chat">{t("call.switch")} <span className="arrow">↗</span></Link>
          </div>
        )}

        {phase.kind === "input" && !voice && (
          <>
            <Rise className="title-sm" lines={[t("talk.title1"), t("talk.title2")]} />
            <form
              className="composer"
              style={{ marginTop: 30 }}
              onSubmit={(e) => {
                e.preventDefault();
                send(text);
              }}
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("talk.typeInstead")}
                aria-label={t("talk.typeInstead")}
                rows={2}
                maxLength={4000}
                lang={lang.split("-")[0]}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(text);
                  }
                }}
              />
              <button className="pill pill-accent" type="submit" disabled={!text.trim()}>
                {t("talk.send")} <span className="arrow">↗</span>
              </button>
            </form>
            {notice && <p className="notice" role="alert">{notice}</p>}
            <p className="kicker" style={{ marginTop: 26 }}>{t("talk.examples")}</p>
            <div className="examples">
              {["ex1", "ex2", "ex3"].map((k) => (
                <button key={k} className="example" onClick={() => setText(t(`talk.${k}`))}>“{t(`talk.${k}`)}”</button>
              ))}
            </div>
            <Link className="text-link switch-link" href="/call">{t("chat.switch")} <span className="arrow">↗</span></Link>
          </>
        )}

        {phase.kind === "busy" && <StagedProgress stage={phase.stage} skipListening={!phase.voice} />}

        {phase.kind === "confirm" && (
          <>
            <SymptomChips
              key={phase.data.transcript}
              chips={phase.data.chips}
              transcript={phase.data.transcript}
              busy={busy}
              onConfirm={(chips) => confirm(chips, phase)}
              onEditTranscript={async (edited) => {
                // An edited transcript replaces the conversation so the old wording is not re-read.
                await resetConversation();
                send(edited, false, phase);
              }}
            />
            {notice && <p className="notice" role="alert">{notice}</p>}
          </>
        )}

        {phase.kind === "followup" && (
          <>
            <FollowUpCard key={phase.data.question_key} q={phase.data} busy={busy} onAnswer={(v) => answer(v, phase, phase.data.question_key)} />
            {notice && <p className="notice" role="alert">{notice}</p>}
            {voice && <MicButton size="sm" onAudio={(w) => onAudio(w, phase)} onError={(k) => setNotice(t(k))} />}
          </>
        )}
      </div>
    </div>
  );
}
