"use client";

import { PHASES, phaseRanges, type Phase } from "@/lib/cycle";
import { useStore } from "@/lib/store";

// The cycle as a ring: four arcs sized by how long each phase lasts for this person, and a marker on today.
const R = 84;
const C = 2 * Math.PI * R;
const GAP = 3;

export default function PhaseWheel({ length, periodLength, day, phase, late = 0, focus, onFocus }: {
  length: number; periodLength: number; day: number; phase: Phase | null; late?: number;
  focus?: Phase | null; onFocus?: (p: Phase | null) => void;
}) {
  const { t } = useStore();
  const ranges = phaseRanges(length, periodLength);
  const pos = Math.min(day, length) - 0.5;
  const angle = (pos / length) * 360 - 90;
  const mx = 110 + R * Math.cos((angle * Math.PI) / 180);
  const my = 110 + R * Math.sin((angle * Math.PI) / 180);

  return (
    <div className="wheel">
      <svg viewBox="0 0 220 220" role="img" aria-label={`${t("cycle.day").replace("{n}", String(day))}, ${phase ? t(`cal.p.${phase}`) : t("cycle.phase.late")}`}>
        <circle cx="110" cy="110" r={R} className="wheel-track" />
        {PHASES.map((p, i) => {
          const [a, b] = ranges[p];
          const days = b - a + 1;
          if (days <= 0) return null;
          const len = Math.max(0, (days / length) * C - GAP);
          const offset = -((a - 1) / length) * C;
          return (
            <circle
              key={p}
              cx="110"
              cy="110"
              r={R}
              className="wheel-arc"
              data-phase={p}
              data-dim={focus && focus !== p ? "" : undefined}
              style={{ "--i": i, strokeDasharray: `${len} ${C}`, strokeDashoffset: offset } as React.CSSProperties}
              transform="rotate(-90 110 110)"
              onClick={() => onFocus?.(focus === p ? null : p)}
            />
          );
        })}
        <g className="wheel-marker" style={{ "--mx": `${mx}px`, "--my": `${my}px` } as React.CSSProperties}>
          <circle cx={mx} cy={my} r="13" className="wheel-marker-halo" />
          <circle cx={mx} cy={my} r="8" className="wheel-marker-dot" data-phase={phase ?? "late"} />
        </g>
      </svg>
      <div className="wheel-center">
        {late > 0 ? (
          <>
            <b>{late}</b>
            <small>{t("cal.daysLate")}</small>
          </>
        ) : (
          <>
            <small>{t("cal.dayLabel")}</small>
            <b>{day}</b>
            <small>{phase ? t(`cal.p.${phase}`) : ""}</small>
          </>
        )}
      </div>
    </div>
  );
}
