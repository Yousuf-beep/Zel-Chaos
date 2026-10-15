"use client";

import { useEffect, useRef, useState } from "react";
import type { CompanionAlert, CompanionMessage } from "@/lib/api";
import { speak, type Speech } from "@/lib/speak";
import { useStore } from "@/lib/store";
import { IconCheck, IconCopy, IconSpeaker, IconStop } from "./icons";

export type Entry =
  | { role: "user"; text: string; at: number }
  | { role: "assistant"; reply: string; suggestions: string[]; question: string; alert?: CompanionAlert; lang: string; at: number };

export function toEntry(m: CompanionMessage): Entry {
  return m.role === "user"
    ? { role: "user", text: m.text, at: m.at }
    : { role: "assistant", reply: m.reply ?? m.text, suggestions: m.suggestions ?? [], question: m.question ?? "", alert: m.alert, lang: m.reply_lang ?? "en-IN", at: m.at };
}

export function AlertCard({ alert }: { alert: CompanionAlert }) {
  const { t } = useStore();
  if (alert.level === "none") return null;
  const title = { soon: t("companion.soonTitle"), now: t("companion.nowTitle"), emergency: t("companion.emergencyTitle"), crisis: t("companion.crisisTitle") }[alert.level];
  return (
    <div className="c-alert" data-level={alert.level} role={alert.level === "soon" ? "note" : "alert"}>
      <strong>{title}</strong>
      {alert.message && <p>{alert.message}</p>}
      {alert.numbers.length > 0 && (
        <div className="c-alert-calls">
          {alert.numbers.map((n) => (
            <a key={n.number} href={`tel:${n.number.replace(/[^\d]/g, "")}`}>{t("companion.call")} {n.number} · {n.label}</a>
          ))}
        </div>
      )}
    </div>
  );
}

function NolaActions({ text, spoken, lang }: { text: string; spoken: string; lang: string }) {
  const { t } = useStore();
  const [copied, setCopied] = useState(false);
  const [playing, setPlaying] = useState(false);
  const speech = useRef<Speech | null>(null);
  useEffect(() => () => speech.current?.stop(), []);

  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  const listen = () => {
    if (speech.current) {
      speech.current.stop();
      speech.current = null;
      return setPlaying(false);
    }
    const s = speak(spoken, lang);
    speech.current = s;
    setPlaying(true);
    s.done.then(() => {
      if (speech.current === s) speech.current = null;
      setPlaying(false);
    });
  };

  return (
    <div className="msg-actions">
      <button type="button" onClick={copy} aria-label={copied ? t("chatui.copied") : t("chatui.copy")} title={copied ? t("chatui.copied") : t("chatui.copy")}>
        {copied ? <IconCheck /> : <IconCopy />}
      </button>
      <button type="button" onClick={listen} aria-pressed={playing} aria-label={playing ? t("chatui.stopListen") : t("chatui.listen")} title={playing ? t("chatui.stopListen") : t("chatui.listen")}>
        {playing ? <IconStop /> : <IconSpeaker />}
      </button>
    </div>
  );
}

export default function Message({ entry, isLast }: { entry: Entry; isLast: boolean }) {
  const { t, lang } = useStore();
  if (entry.role === "user") {
    return <div className="msg msg-user" lang={lang.split("-")[0]}><p>{entry.text}</p></div>;
  }
  const spoken = [entry.reply, entry.question].filter(Boolean).join(" ");
  const copyText = [entry.reply, ...entry.suggestions.map((s) => `• ${s}`), entry.question].filter(Boolean).join("\n");
  return (
    <div className="msg msg-nola" lang={entry.lang.split("-")[0]} data-last={isLast}>
      {entry.alert && <AlertCard alert={entry.alert} />}
      <p>{entry.reply}</p>
      {entry.suggestions.length > 0 && (
        <div className="msg-suggest">
          <p className="c-label">{t("companion.suggestions")}</p>
          <ul>{entry.suggestions.map((s, j) => <li key={j}>{s}</li>)}</ul>
        </div>
      )}
      {entry.question && <p className="msg-question">{entry.question}</p>}
      <NolaActions text={copyText} spoken={spoken} lang={entry.lang} />
    </div>
  );
}
