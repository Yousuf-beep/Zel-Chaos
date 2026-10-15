"use client";

import { useEffect, useRef, useState } from "react";
import Rise from "@/components/Rise";
import { api, ApiError, type CompanionAlert, type CycleStatus } from "@/lib/api";
import { useStore } from "@/lib/store";

type Entry =
  | { role: "user"; text: string }
  | { role: "assistant"; reply: string; suggestions: string[]; question: string; alert?: CompanionAlert };

const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const fill = (s: string, n: number) => s.replace("{n}", String(n));

function CycleSetupForm({ initial, onDone, onSkip }: { initial?: CycleStatus | null; onDone: (c: CycleStatus) => void; onSkip?: () => void }) {
  const { t } = useStore();
  const [start, setStart] = useState(initial?.last_period_start ?? "");
  const [cycleLen, setCycleLen] = useState(initial?.cycle_length_setting ?? 28);
  const [periodLen, setPeriodLen] = useState(initial?.period_length ?? 5);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      onDone((await api.setupCycle({ last_period_start: start, cycle_length: cycleLen, period_length: periodLen })).cycle);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("companion.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="cycle-setup" onSubmit={save}>
      {!initial && <Rise className="title-sm" lines={[t("cycle.setupTitle1"), t("cycle.setupTitle2")]} />}
      <p className="body">{t("cycle.setupSub")}</p>
      <label className="field">
        {t("cycle.lastStart")}
        <input type="date" required max={todayIso()} value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <div className="cycle-setup-row">
        <label className="field">
          {t("cycle.cycleLength")}
          <input type="number" inputMode="numeric" min={15} max={90} required value={cycleLen} onChange={(e) => setCycleLen(Number(e.target.value))} />
        </label>
        <label className="field">
          {t("cycle.periodLength")}
          <input type="number" inputMode="numeric" min={1} max={15} required value={periodLen} onChange={(e) => setPeriodLen(Number(e.target.value))} />
        </label>
      </div>
      <p className="c-hint">{t("cycle.notSure")}</p>
      {err && <p className="notice" role="alert">{err}</p>}
      <div className="cycle-setup-actions">
        <button className="pill pill-accent" type="submit" disabled={busy || !start}>{t("cycle.save")} <span className="arrow">↗</span></button>
        {onSkip && <button type="button" className="text-link" onClick={onSkip}>{t("cycle.skip")}</button>}
      </div>
    </form>
  );
}

function CycleStrip({ cycle, onChange, onEdit }: { cycle: CycleStatus; onChange: (c: CycleStatus) => void; onEdit: () => void }) {
  const { t } = useStore();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");

  const log = async (d: string) => {
    try {
      onChange((await api.logPeriod(d)).cycle);
      setOpen(false);
      setNote(t("cycle.logged"));
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : t("companion.error"));
    }
  };

  const next =
    cycle.days_late > 0 ? fill(t("cycle.late"), cycle.days_late)
    : cycle.days_until_next === 0 ? t("cycle.dueToday")
    : fill(t("cycle.nextIn"), cycle.days_until_next);
  const pct = Math.min(100, (cycle.cycle_day / Math.max(cycle.average_cycle_length, cycle.cycle_day)) * 100);

  return (
    <section className="cycle-strip" data-phase={cycle.phase} aria-label={t("cycle.phase." + cycle.phase)}>
      <div className="cycle-strip-top">
        <div>
          <p className="cycle-day">{fill(t("cycle.day"), cycle.cycle_day)} · {t("cycle.phase." + cycle.phase)}</p>
          <p className="cycle-next">{next}</p>
        </div>
        <button className="text-link" onClick={onEdit}>{t("cycle.edit")}</button>
      </div>
      <div className="cycle-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      {!open ? (
        <button className="pill pill-ghost cycle-log" onClick={() => setOpen(true)}>{t("cycle.started")}</button>
      ) : (
        <div className="cycle-log-row">
          <button className="pill pill-accent" onClick={() => log(todayIso())}>{t("cycle.today")}</button>
          <input type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} aria-label={t("cycle.started")} />
          <button className="pill pill-ghost" onClick={() => log(date)}>{t("cycle.save")}</button>
        </div>
      )}
      {note && <p className="c-hint" role="status">{note}</p>}
      <p className="c-hint">{t("cycle.estimate")}</p>
    </section>
  );
}

function AlertCard({ alert }: { alert: CompanionAlert }) {
  const { t } = useStore();
  if (alert.level === "none") return null;
  const title = { soon: t("companion.soonTitle"), now: t("companion.nowTitle"), emergency: t("companion.emergencyTitle"), crisis: t("companion.crisisTitle") }[alert.level];
  return (
    <div className="c-alert" data-level={alert.level} role={alert.level === "soon" ? "note" : "alert"}>
      <strong>{title}</strong>
      <p>{alert.message}</p>
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

export default function CompanionChat() {
  const { t, lang } = useStore();
  const [cycle, setCycle] = useState<CycleStatus | null | undefined>(undefined);
  const [setup, setSetup] = useState<"auto" | "edit" | "skipped">("auto");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.cycle().then((r) => setCycle(r.cycle)).catch(() => setCycle(null));
    api
      .companionHistory()
      .then((r) =>
        setEntries(
          r.messages.map((m) =>
            m.role === "user" ? { role: "user", text: m.text } : { role: "assistant", reply: m.reply ?? m.text, suggestions: m.suggestions ?? [], question: m.question ?? "" },
          ),
        ),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries.length, busy]);

  const send = async (msg: string) => {
    const m = msg.trim();
    if (!m || busy) return;
    setEntries((e) => [...e, { role: "user", text: m }]);
    setText("");
    setBusy(true);
    setNotice("");
    try {
      const r = await api.companionChat(m, lang);
      setEntries((e) => [...e, { role: "assistant", reply: r.reply, suggestions: r.suggestions, question: r.question, alert: r.alert }]);
      if (r.cycle) setCycle(r.cycle);
    } catch (e) {
      setNotice(e instanceof ApiError && e.status !== 500 ? e.message : t("companion.error"));
      setEntries((e) => e.slice(0, -1));
      setText(m);
    } finally {
      setBusy(false);
    }
  };

  const forget = async () => {
    if (!window.confirm(t("companion.forgetConfirm"))) return;
    await api.companionForget().catch(() => undefined);
    setEntries([]);
    setCycle(null);
    setSetup("auto");
  };

  if (cycle === undefined) return <div className="page"><div className="column" /></div>;

  if ((cycle === null && setup === "auto") || setup === "edit") {
    return (
      <div className="page">
        <div className="column">
          <CycleSetupForm
            initial={setup === "edit" ? cycle : null}
            onDone={(c) => {
              setCycle(c);
              setSetup("skipped");
            }}
            onSkip={() => setSetup("skipped")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="column companion">
        {cycle && <CycleStrip cycle={cycle} onChange={setCycle} onEdit={() => setSetup("edit")} />}

        {entries.length === 0 && (
          <>
            <Rise className="title-sm" lines={[t("companion.title1"), t("companion.title2")]} />
            <p className="kicker" style={{ marginTop: 22 }}>{t("companion.tryTitle")}</p>
            <div className="examples">
              {["ex1", "ex2", "ex3"].map((k) => (
                <button key={k} className="example" onClick={() => send(t(`companion.${k}`))}>“{t(`companion.${k}`)}”</button>
              ))}
            </div>
          </>
        )}

        <div className="c-thread" aria-live="polite">
          {entries.map((e, i) =>
            e.role === "user" ? (
              <p key={i} className="c-msg c-user" lang={lang.split("-")[0]}>{e.text}</p>
            ) : (
              <div key={i} className="c-msg c-bot" lang={lang.split("-")[0]}>
                {e.alert && <AlertCard alert={e.alert} />}
                <p>{e.reply}</p>
                {e.suggestions.length > 0 && (
                  <>
                    <p className="c-label">{t("companion.suggestions")}</p>
                    <ul className="c-suggestions">{e.suggestions.map((s, j) => <li key={j}>{s}</li>)}</ul>
                  </>
                )}
                {e.question && <p className="c-question">{e.question}</p>}
              </div>
            ),
          )}
          {busy && <p className="c-msg c-bot c-typing">{t("companion.thinking")}</p>}
          <div ref={endRef} />
        </div>

        {notice && <p className="notice" role="alert">{notice}</p>}
        <form
          className="composer c-composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("companion.placeholder")}
            aria-label={t("companion.placeholder")}
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
          <button className="pill pill-accent" type="submit" disabled={!text.trim() || busy}>
            {t("companion.send")} <span className="arrow">↗</span>
          </button>
        </form>
        <p className="c-hint c-disclaimer">{t("companion.notDiagnosis")}</p>
        {entries.length > 0 && <button className="text-link" onClick={forget}>{t("companion.forget")}</button>}
      </div>
    </div>
  );
}
