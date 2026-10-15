"use client";

import { useEffect, useRef, useState } from "react";
import { IconClose } from "@/components/chat/icons";
import type { Phase } from "@/lib/cycle";
import { playSfx } from "@/lib/sound";
import { useStore } from "@/lib/store";
import Pose, { type PoseId } from "./Pose";

// Gentle stretches for cramps, back ache and stress. Each card opens a practice sheet: pick a time or a number of
// rounds, press start, and the figure moves with a breathe-in / breathe-out cue while a ring fills. Rounds count
// themselves. Finished stretches get a tick for today, kept only on this device.

type Exercise = { id: PoseId; mode: "hold" | "reps"; options: number[]; def: number; inhale: number; exhale: number; phases: Phase[] };

export const EXERCISES: Exercise[] = [
  { id: "child", mode: "hold", options: [30, 60, 120], def: 60, inhale: 4000, exhale: 5000, phases: ["menstrual", "luteal"] },
  { id: "catcow", mode: "reps", options: [5, 10, 15], def: 10, inhale: 4000, exhale: 4000, phases: ["menstrual", "follicular", "ovulation", "luteal"] },
  { id: "happybaby", mode: "hold", options: [30, 60, 90], def: 60, inhale: 3500, exhale: 3500, phases: ["menstrual", "luteal"] },
  { id: "bridge", mode: "reps", options: [5, 10, 15], def: 8, inhale: 3000, exhale: 3500, phases: ["follicular", "ovulation", "luteal"] },
];

const DONE_KEY = "nola.moves";
const today = () => new Date().toLocaleDateString("en-CA");

function readDone(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(DONE_KEY) || "null");
    return v && v.date === today() && Array.isArray(v.done) ? v.done : [];
  } catch {
    return [];
  }
}
function markDone(id: string) {
  try {
    const done = Array.from(new Set([...readDone(), id]));
    localStorage.setItem(DONE_KEY, JSON.stringify({ date: today(), done }));
  } catch {}
}

const ease = (x: number) => (1 - Math.cos(Math.PI * x)) / 2;

/** Breath position (0 out … 1 in) and which half of the breath we are in, for a point in time. */
function breathAt(ms: number, ex: Exercise) {
  const cycle = ex.inhale + ex.exhale;
  const m = ms % cycle;
  return m < ex.inhale ? { b: ease(m / ex.inhale), inhale: true } : { b: 1 - ease((m - ex.inhale) / ex.exhale), inhale: false };
}

/** A requestAnimationFrame clock in milliseconds; `running` false freezes it. */
function useClock(running: boolean) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const tick = (ts: number) => {
      const dt = Math.min(ts - last, 100);
      last = ts;
      setNow((n) => n + dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);
  return [now, setNow] as const;
}

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => setR(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  return r;
}

function Preview({ ex, label }: { ex: Exercise; label: string }) {
  const reduced = useReducedMotion();
  const [ms] = useClock(!reduced);
  return <Pose id={ex.id} breath={reduced ? 0.6 : breathAt(ms, ex).b} label={label} />;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, "0")}`;

function Practice({ ex, onClose, onDone }: { ex: Exercise; onClose: () => void; onDone: () => void }) {
  const { t } = useStore();
  const [target, setTarget] = useState(ex.def);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [elapsed, setElapsed] = useClock(running);
  const [idle] = useClock(!running && elapsed === 0 && !finished);
  const lastHalf = useRef<boolean | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const cycle = ex.inhale + ex.exhale;
  const total = ex.mode === "hold" ? target * 1000 : target * cycle;
  const progress = Math.min(1, elapsed / total);
  const { b, inhale } = breathAt(running || elapsed > 0 ? elapsed : idle, ex);
  const rep = Math.min(target, Math.floor(elapsed / cycle) + 1);
  const name = t(`moves.${ex.id}.name`);

  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, []);

  // A soft tick each time the cue flips between breathing in and out; a chime when the set is done.
  useEffect(() => {
    if (!running) {
      lastHalf.current = null;
      return;
    }
    if (lastHalf.current !== null && lastHalf.current !== inhale) playSfx("tick");
    lastHalf.current = inhale;
  }, [inhale, running]);
  useEffect(() => {
    if (running && elapsed >= total) {
      setRunning(false);
      setFinished(true);
      markDone(ex.id);
      onDone();
      playSfx("chime");
    }
  }, [elapsed, total, running, ex.id, onDone]);

  const reset = () => {
    setRunning(false);
    setFinished(false);
    setElapsed(0);
  };
  const toggle = () => {
    if (finished) {
      reset();
      setTimeout(() => setRunning(true), 0);
      return;
    }
    playSfx(running ? "tap" : "pop");
    setRunning(!running);
  };

  const R = 46;
  const C = 2 * Math.PI * R;
  const steps = t(`moves.${ex.id}.steps`).split("|");

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="practice-title">
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet2 practice">
        <div className="sheet2-head">
          <div>
            <h2 id="practice-title">{name}</h2>
            <p className="c-hint practice-alt">{t(`moves.${ex.id}.alt`)}</p>
          </div>
          <button ref={closeBtn} type="button" className="c2-icon" onClick={onClose} aria-label={t("report.close")}><IconClose /></button>
        </div>

        <div className="practice-stage" data-running={running || undefined}>
          <Pose id={ex.id} breath={b} label={name} />
          <p className="practice-cue" aria-live="polite" data-in={inhale || undefined}>
            {finished ? t("moves.done") : running || elapsed > 0 ? (inhale ? t("moves.in") : t("moves.out")) : t("moves.ready")}
          </p>
        </div>

        <div className="practice-row">
          <div className="practice-ring" data-finished={finished || undefined}>
            <svg viewBox="0 0 110 110" aria-hidden="true">
              <circle cx="55" cy="55" r={R} className="ring-track" />
              <circle cx="55" cy="55" r={R} className="ring-fill" style={{ strokeDasharray: C, strokeDashoffset: C * (1 - progress) }} transform="rotate(-90 55 55)" />
            </svg>
            <div className="ring-text">
              {ex.mode === "hold" ? (
                <><b>{mmss(Math.ceil((total - elapsed) / 1000))}</b><small>{t("moves.left")}</small></>
              ) : (
                <><b>{finished ? target : rep}<span>/{target}</span></b><small>{t("moves.round")}</small></>
              )}
            </div>
          </div>
          <div className="practice-controls">
            <div className="practice-opts" role="radiogroup" aria-label={ex.mode === "hold" ? t("moves.howLong") : t("moves.howMany")}>
              {ex.options.map((o) => (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  className="chip-option"
                  aria-checked={target === o}
                  disabled={running}
                  onClick={() => {
                    setTarget(o);
                    reset();
                  }}
                >
                  {ex.mode === "hold" ? (o < 60 ? t("moves.sec").replace("{n}", String(o)) : t("moves.min").replace("{n}", String(o / 60))) : t("moves.rounds").replace("{n}", String(o))}
                </button>
              ))}
            </div>
            <div className="practice-btns">
              <button type="button" className="pill pill-accent" data-sfx="pop" onClick={toggle}>
                {running ? t("moves.pause") : finished ? t("moves.again") : elapsed > 0 ? t("moves.resume") : t("moves.start")}
              </button>
              {elapsed > 0 && !finished && <button type="button" className="text-link" onClick={reset}>{t("moves.reset")}</button>}
            </div>
          </div>
        </div>

        <ol className="practice-steps">
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
        <p className="c-hint">{t("moves.safety")}</p>
      </div>
    </div>
  );
}

export default function Exercises({ phase }: { phase: Phase | null }) {
  const { t } = useStore();
  const [open, setOpen] = useState<Exercise | null>(null);
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => setDone(readDone()), []);

  return (
    <div className="moves">
      <p className="lede moves-lede">{t("moves.lede")}</p>
      <div className="move-grid">
        {EXERCISES.map((ex, i) => {
          const good = phase && ex.phases.includes(phase);
          return (
            <button key={ex.id} type="button" className="move-card" style={{ "--i": i } as React.CSSProperties} onClick={() => setOpen(ex)}>
              <span className="move-art"><Preview ex={ex} label={t(`moves.${ex.id}.name`)} /></span>
              <span className="move-body">
                <span className="move-tags">
                  <span>{ex.mode === "hold" ? t("moves.hold") : t("moves.flow")}</span>
                  {good && <span className="good">{t("moves.goodNow")}</span>}
                  {done.includes(ex.id) && <span className="done">✓ {t("moves.doneToday")}</span>}
                </span>
                <b>{t(`moves.${ex.id}.name`)}</b>
                <small>{t(`moves.${ex.id}.why`)}</small>
                <span className="move-go">{t("moves.practice")} <span className="arrow" aria-hidden="true">↗</span></span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="c-hint">{t("moves.safety")}</p>
      {open && <Practice ex={open} onClose={() => setOpen(null)} onDone={() => setDone(readDone())} />}
    </div>
  );
}
