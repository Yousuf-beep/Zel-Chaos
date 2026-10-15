"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CycleSetupForm } from "@/components/chat/CycleSheet";
import MonthCalendar from "@/components/cycle/MonthCalendar";
import PhaseWheel from "@/components/cycle/PhaseWheel";
import Rise from "@/components/Rise";
import { api, ApiError, type CycleStatus } from "@/lib/api";
import { dayInfo, diffDays, fertileWindow, formatDate, PHASE_OF_STATUS, PHASES, phaseRanges, todayIso, upcomingPeriods, type Phase } from "@/lib/cycle";
import { playSfx } from "@/lib/sound";
import { useRequireUser, useStore } from "@/lib/store";

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

export default function CyclePage() {
  const user = useRequireUser();
  const { t, lang } = useStore();
  const [cycle, setCycle] = useState<CycleStatus | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<Phase | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) api.cycle().then((r) => setCycle(r.cycle)).catch(() => setCycle(null));
  }, [user]);
  if (!user || cycle === undefined) return null;

  if (!cycle || editing) {
    return (
      <div className="page cyc">
        <div className="column">
          <span className="kicker"><span className="dot" />{t("cal.kicker")}</span>
          <Rise as="h1" className="title-sm cyc-title" lines={[t("cal.setupTitle")]} />
          <div className="q-card">
            <CycleSetupForm
              initial={cycle}
              onDone={(c) => {
                setCycle(c);
                setEditing(false);
                playSfx("ready");
              }}
            />
            {editing && <button type="button" className="text-link" onClick={() => setEditing(false)}>← {t("onboard.back")}</button>}
          </div>
        </div>
      </div>
    );
  }

  const today = todayIso();
  const phase = PHASE_OF_STATUS[cycle.phase];
  const ranges = phaseRanges(cycle.average_cycle_length, cycle.period_length);
  const upcoming = upcomingPeriods(cycle);
  const fw = fertileWindow(cycle);
  const sel = selected ? dayInfo(selected, cycle, today) : null;

  const run = async (fn: () => Promise<{ cycle: CycleStatus | null }>, done: string) => {
    setBusy(true);
    setNote("");
    try {
      const r = await fn();
      if (r.cycle) setCycle(r.cycle);
      setNote(done);
      playSfx("ready");
    } catch (e) {
      setNote(e instanceof ApiError ? e.message : t("companion.error"));
    } finally {
      setBusy(false);
    }
  };
  const log = (iso: string) => run(() => api.logPeriod(iso), t("cal.logged"));
  const until = cycle.days_until_next;

  return (
    <div className="page cyc">
      <div className="column cyc-col">
        <span className="kicker"><span className="dot" />{t("cal.kicker")}</span>
        <Rise as="h1" className="title-sm cyc-title" lines={[t("cal.title")]} />

        <section className="cyc-hero" data-phase={phase ?? "late"}>
          <PhaseWheel length={cycle.average_cycle_length} periodLength={cycle.period_length} day={cycle.cycle_day} phase={phase} late={cycle.days_late} focus={focus} onFocus={setFocus} />
          <div className="cyc-next">
            {cycle.days_late > 0 ? (
              <>
                <p className="c-label">{t("cal.next")}</p>
                <p className="cyc-next-big">{fill(t("cal.late"), { n: cycle.days_late })}</p>
                <p className="c-hint">{t("cal.lateHint")}</p>
              </>
            ) : (
              <>
                <p className="c-label">{t("cal.next")}</p>
                <p className="cyc-next-big">{formatDate(cycle.next_period_expected, lang, { weekday: "short", day: "numeric", month: "long" })}</p>
                <p className="cyc-count">
                  {until <= 0 ? t("cal.dueToday") : until === 1 ? t("cal.tomorrow") : fill(t("cal.inDays"), { n: until })}
                </p>
                {upcoming.length > 1 && (
                  <p className="cyc-then">
                    <span>{t("cal.then")}</span>
                    {upcoming.slice(1).map((d) => <b key={d}>{formatDate(d, lang, { day: "numeric", month: "short" })}</b>)}
                  </p>
                )}
                {cycle.cycle_day <= ranges.ovulation[1] && (
                  <p className="cyc-fertile">
                    <i aria-hidden="true" />
                    {t("cal.fertile")}: {formatDate(fw.from, lang, { day: "numeric", month: "short" })} – {formatDate(fw.to, lang, { day: "numeric", month: "short" })}
                  </p>
                )}
              </>
            )}
            <button className="pill pill-accent cyc-log" disabled={busy || cycle.period_starts.includes(today)} onClick={() => log(today)}>
              <span className="dot" />{t("cal.logToday")}
            </button>
          </div>
        </section>

        <section className="cyc-section" aria-labelledby="phases-title">
          <div className="cyc-section-head">
            <h2 id="phases-title">{t("cal.phases")}</h2>
            <p className="c-hint">{t("cal.phaseTap")}</p>
          </div>
          <div className="phase-cards">
            {PHASES.map((p, i) => {
              const [a, b] = ranges[p];
              return (
                <button
                  key={p}
                  type="button"
                  className="phase-card"
                  data-phase={p}
                  data-current={p === phase || undefined}
                  aria-pressed={focus === p}
                  style={{ "--i": i } as React.CSSProperties}
                  onClick={() => setFocus(focus === p ? null : p)}
                >
                  <span className="pc-top">
                    <i aria-hidden="true" />
                    <b>{t(`cal.p.${p}`)}</b>
                    {p === phase && <em>{t("cal.you")}</em>}
                  </span>
                  <span className="pc-days">{a === b ? fill(t("cal.day1"), { a }) : fill(t("cal.days"), { a, b })}</span>
                  <span className="pc-desc">{t(`cal.pd.${p}`)}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="cyc-section" aria-label={t("cal.title")}>
          <MonthCalendar cycle={cycle} selected={selected} onSelect={(d) => setSelected(selected === d ? null : d)} focus={focus} />
          {sel && selected && (
            <div className="cyc-detail" key={selected}>
              <div>
                <p className="cyc-detail-date">{formatDate(selected, lang, { weekday: "long", day: "numeric", month: "long" })}</p>
                <p className="c-hint">
                  {sel.late ? fill(t("cal.late"), { n: diffDays(selected, cycle.next_period_expected) + 1 })
                    : sel.phase ? `${fill(t("cycle.day"), { n: sel.cycleDay ?? "" })} · ${t(`cal.p.${sel.phase}`)}${sel.predicted ? ` · ${t("cal.legendPredicted")}` : ""}${sel.ovulationDay ? ` · ${t("cal.legendOv")}` : ""}`
                    : t("cal.noData")}
                </p>
              </div>
              {selected <= today && (
                sel.loggedStart ? (
                  <button className="pill pill-ghost" disabled={busy || cycle.period_starts.length < 2} onClick={() => run(() => api.removePeriod(selected), t("cal.removed"))}>
                    {t("cal.remove")}
                  </button>
                ) : (
                  <button className="pill pill-accent" disabled={busy} onClick={() => log(selected)}>{t("cal.logThis")}</button>
                )
              )}
            </div>
          )}
          {note && <p className="c-hint" role="status">{note}</p>}
        </section>

        <section className="cyc-stats">
          <div><span className="c-label">{t("cal.cycleAvg")}</span><b>{fill(t("cal.daysUnit"), { n: cycle.average_cycle_length })}</b></div>
          <div><span className="c-label">{t("cal.periodAvg")}</span><b>{fill(t("cal.daysUnit"), { n: cycle.period_length })}</b></div>
          <div><span className="c-label">{t("cal.logged2")}</span><b>{cycle.period_starts.length}</b></div>
        </section>

        <div className="cyc-foot">
          <button type="button" className="text-link" onClick={() => setEditing(true)}>{t("cal.edit")}</button>
          <Link className="text-link" href="/learn?tab=exercises">{t("cal.moves")} ↗</Link>
        </div>
        <p className="c-hint">{t("cycle.estimate")}</p>
      </div>
    </div>
  );
}
