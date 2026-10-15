"use client";

import { useEffect, useState } from "react";
import { PHASES, type Phase } from "@/lib/cycle";
import { playSfx } from "@/lib/sound";
import { useStore } from "@/lib/store";

// Small, everyday food habits with Indian examples. Tips can be filtered by cycle phase (her current phase is picked
// for her when we know it), each opens to say why it helps and what to try. A glass-by-glass water tracker sits on top;
// it resets each day and is kept only on this device.

type Tip = { id: string; phases: Phase[]; icon: React.ReactNode };

const I = (d: React.ReactNode) => <svg viewBox="0 0 32 32" aria-hidden="true">{d}</svg>;
const TIPS: Tip[] = [
  { id: "water", phases: ["menstrual", "follicular", "ovulation", "luteal"], icon: I(<><path d="M9 6h14l-2 21H11z" /><path d="M10.2 14h11.6" /></>) },
  { id: "caffeine", phases: ["menstrual", "luteal"], icon: I(<><path d="M7 12h15v7a6 6 0 0 1-6 6h-3a6 6 0 0 1-6-6z" /><path d="M22 14h2a3 3 0 0 1 0 6h-2M12 4c-1 2 1 3 0 5M17 4c-1 2 1 3 0 5" /></>) },
  { id: "iron", phases: ["menstrual", "follicular"], icon: I(<><path d="M16 27c-6 0-10-5-10-11 0-5 4-9 10-9 4 0 7 2 9 5" /><path d="M16 7c0-2 2-4 5-4M14 15c3 0 5 2 5 5" /></>) },
  { id: "grains", phases: ["follicular", "ovulation", "luteal"], icon: I(<><path d="M16 28V8" /><path d="M16 12c-3-1-5-3-5-6 3 0 5 2 5 6zM16 12c3-1 5-3 5-6-3 0-5 2-5 6zM16 19c-3-1-5-3-5-6 3 0 5 2 5 6zM16 19c3-1 5-3 5-6-3 0-5 2-5 6z" /></>) },
  { id: "sugar", phases: ["luteal", "follicular"], icon: I(<><rect x="8" y="8" width="16" height="16" rx="3" /><path d="M6 26L26 6" /></>) },
  { id: "magnesium", phases: ["menstrual", "luteal"], icon: I(<><path d="M8 24c10 2 17-5 17-14-2 0-3 1-4 2-1 7-6 11-13 12z" /><path d="M25 10l1-3" /></>) },
  { id: "fats", phases: ["menstrual", "ovulation"], icon: I(<><ellipse cx="16" cy="17" rx="8" ry="10" /><path d="M16 9c-2 3-2 13 0 16M12 12c2 2 6 2 8 0M12 21c2-2 6-2 8 0" /></>) },
  { id: "salt", phases: ["luteal"], icon: I(<><path d="M11 12h10l-1 15h-8z" /><path d="M11 12c0-4 2-7 5-7s5 3 5 7M14 8.5h.01M18 8.5h.01" /></>) },
  { id: "protein", phases: ["follicular", "ovulation", "luteal", "menstrual"], icon: I(<><path d="M5 17h22a11 8 0 0 1-22 0z" /><path d="M9 13c2-3 5-3 7-1 2-2 5-2 7 1" /></>) },
];

const WATER_KEY = "nola.water";
const GOAL = 8;
const today = () => new Date().toLocaleDateString("en-CA");

function Water() {
  const { t } = useStore();
  const [n, setN] = useState(0);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(WATER_KEY) || "null");
      if (v && v.date === today()) setN(v.n);
    } catch {}
  }, []);
  const set = (v: number) => {
    setN(v);
    playSfx(v === GOAL ? "chime" : "fill");
    try {
      localStorage.setItem(WATER_KEY, JSON.stringify({ date: today(), n: v }));
    } catch {}
  };
  return (
    <section className="water" aria-labelledby="water-title">
      <div className="water-head">
        <div>
          <h3 id="water-title">{t("food.waterTitle")}</h3>
          <p className="c-hint">{n >= GOAL ? t("food.waterDone") : t("food.waterSub")}</p>
        </div>
        <p className="water-count"><b>{n}</b>/{GOAL}</p>
      </div>
      <div className="glasses" role="group" aria-label={t("food.waterTitle")}>
        {Array.from({ length: GOAL }, (_, i) => (
          <button
            key={i}
            type="button"
            className="glass"
            data-sfx="fill"
            data-full={i < n || undefined}
            aria-pressed={i < n}
            aria-label={t("food.glass").replace("{n}", String(i + 1))}
            onClick={() => set(i < n && i === n - 1 ? i : i + 1)}
          >
            <svg viewBox="0 0 24 32" aria-hidden="true">
              <defs><clipPath id={`gl${i}`}><path d="M4 3h16l-2 26H6z" /></clipPath></defs>
              <g clipPath={`url(#gl${i})`}><rect className="glass-water" x="0" y="3" width="24" height="29" /></g>
              <path className="glass-line" d="M4 3h16l-2 26H6z" />
            </svg>
          </button>
        ))}
      </div>
    </section>
  );
}

export default function Food({ phase }: { phase: Phase | null }) {
  const { t } = useStore();
  const [filter, setFilter] = useState<Phase | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (phase) setFilter(phase);
  }, [phase]);
  const tips = TIPS.filter((tip) => filter === "all" || tip.phases.includes(filter));

  return (
    <div className="food">
      <p className="lede moves-lede">{t("food.lede")}</p>
      <Water />
      <div className="food-filter" role="radiogroup" aria-label={t("food.filter")}>
        <span className="c-label">{t("food.filter")}</span>
        <div className="chips">
          {(["all", ...PHASES] as const).map((p) => (
            <button key={p} type="button" role="radio" className="chip-option" data-phase={p} aria-checked={filter === p} onClick={() => setFilter(p)}>
              {p === "all" ? t("food.all") : t(`cal.p.${p}`)}
              {p === phase && <span className="you-dot" aria-label={t("cal.you")} />}
            </button>
          ))}
        </div>
        {phase && filter === phase && <p className="c-hint">{t(`food.phaseNote.${phase}`)}</p>}
      </div>
      <div className="tips">
        {tips.map((tip, i) => {
          const isOpen = open === tip.id;
          return (
            <div key={tip.id} className="tip" data-open={isOpen || undefined} style={{ "--i": i } as React.CSSProperties}>
              <button type="button" className="tip-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : tip.id)}>
                <span className="tip-icon">{tip.icon}</span>
                <span className="tip-title">
                  <b>{t(`food.${tip.id}.title`)}</b>
                  <small>{t(`food.${tip.id}.line`)}</small>
                </span>
                <span className="tip-plus" aria-hidden="true">+</span>
              </button>
              <div className="tip-body" inert={!isOpen}>
                <div>
                  <p><span className="c-label">{t("food.why")}</span>{t(`food.${tip.id}.why`)}</p>
                  <p><span className="c-label">{t("food.try")}</span>{t(`food.${tip.id}.try`)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="c-hint">{t("food.note")}</p>
    </div>
  );
}
