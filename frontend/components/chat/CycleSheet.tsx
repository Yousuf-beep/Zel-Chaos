"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import MonthCalendar from "@/components/cycle/MonthCalendar";
import Stepper from "@/components/cycle/Stepper";
import { api, ApiError, type CycleStatus } from "@/lib/api";
import { formatDate } from "@/lib/cycle";
import { useStore } from "@/lib/store";
import { IconClose } from "./icons";

const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const fill = (s: string, n: number) => s.replace("{n}", String(n));

export function cycleLine(t: (k: string) => string, cycle: CycleStatus) {
  return cycle.days_late > 0 ? fill(t("cycle.late"), cycle.days_late)
    : cycle.days_until_next === 0 ? t("cycle.dueToday")
    : fill(t("cycle.nextIn"), cycle.days_until_next);
}

export function CycleSetupForm({ initial, onDone }: { initial: CycleStatus | null; onDone: (c: CycleStatus) => void }) {
  const { t, lang } = useStore();
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
      <p className="body">{t("cycle.setupSub")}</p>
      <p className="field-label">{t("cycle.lastStart")}</p>
      <MonthCalendar mode="pick" selected={start || null} onSelect={setStart} periodLength={periodLen} />
      <p className="cal-picked" aria-live="polite">{start ? formatDate(start, lang, { weekday: "long", day: "numeric", month: "long" }) : t("cal.pickHint")}</p>
      <div className="cycle-setup-row">
        <Stepper label={t("cycle.cycleLength")} value={cycleLen} min={15} max={90} onChange={setCycleLen} />
        <Stepper label={t("cycle.periodLength")} value={periodLen} min={1} max={15} onChange={setPeriodLen} />
      </div>
      <p className="c-hint">{t("cycle.notSure")}</p>
      {err && <p className="notice" role="alert">{err}</p>}
      <div className="cycle-setup-actions">
        <button className="pill pill-accent" type="submit" disabled={busy || !start}>{t("cycle.save")} <span className="arrow">↗</span></button>
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
  const pct = Math.min(100, (cycle.cycle_day / Math.max(cycle.average_cycle_length, cycle.cycle_day)) * 100);

  return (
    <section className="cycle-strip" data-phase={cycle.phase} aria-label={t("cycle.phase." + cycle.phase)}>
      <div className="cycle-strip-top">
        <div>
          <p className="cycle-day">{fill(t("cycle.day"), cycle.cycle_day)} · {t("cycle.phase." + cycle.phase)}</p>
          <p className="cycle-next">{cycleLine(t, cycle)}</p>
        </div>
        <span className="cycle-strip-links">
          <Link className="text-link" href="/cycle">{t("cal.open")}</Link>
          <button className="text-link" onClick={onEdit}>{t("cycle.edit")}</button>
        </span>
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

export default function CycleSheet({ cycle, onChange, onClose }: { cycle: CycleStatus | null; onChange: (c: CycleStatus) => void; onClose: () => void }) {
  const { t } = useStore();
  const [editing, setEditing] = useState(!cycle);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="cycle-title">
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet2">
        <div className="sheet2-head">
          <h2 id="cycle-title">{t("chatui.cycleTitle")}</h2>
          <button ref={closeBtn} type="button" className="c2-icon" onClick={onClose} aria-label={t("report.close")}><IconClose /></button>
        </div>
        {editing || !cycle ? (
          <CycleSetupForm
            initial={cycle}
            onDone={(c) => {
              onChange(c);
              setEditing(false);
            }}
          />
        ) : (
          <CycleStrip cycle={cycle} onChange={onChange} onEdit={() => setEditing(true)} />
        )}
      </div>
    </div>
  );
}
