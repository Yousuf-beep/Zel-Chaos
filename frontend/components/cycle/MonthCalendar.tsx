"use client";

import { useMemo, useState } from "react";
import type { CycleStatus } from "@/lib/api";
import { addDays, dayInfo, diffDays, formatDate, monthGrid, todayIso, toDate, type DayInfo, type Phase } from "@/lib/cycle";
import { playSfx } from "@/lib/sound";
import { useStore } from "@/lib/store";

// A month at a glance. In "view" mode each day carries its cycle phase as a soft band (rounded where a phase starts
// and ends), logged period days are filled, predicted ones dashed, and the estimated ovulation day is marked.
// In "pick" mode it is a date picker: future days are off, and the chosen day previews the period that follows it.

export default function MonthCalendar({ cycle, selected, onSelect, mode = "view", periodLength = 5, focus = null, max }: {
  cycle?: CycleStatus | null;
  selected?: string | null;
  onSelect?: (iso: string) => void;
  mode?: "view" | "pick";
  periodLength?: number;
  focus?: Phase | null;
  max?: string;
}) {
  const { t, lang } = useStore();
  const today = todayIso();
  const anchor = toDate(selected ?? today);
  const [ym, setYm] = useState({ y: anchor.getUTCFullYear(), m: anchor.getUTCMonth() });
  const cells = useMemo(() => monthGrid(ym.y, ym.m), [ym]);
  const infos = useMemo(() => {
    const m = new Map<string, DayInfo>();
    if (mode === "view" && cycle) for (const iso of cells) if (iso) m.set(iso, dayInfo(iso, cycle, today));
    return m;
  }, [cells, cycle, mode, today]);

  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(lang, { weekday: "narrow", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 1, 1 + i, 12)))),
    [lang],
  );
  const title = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(ym.y, ym.m, 1, 12)));
  const move = (n: number) => {
    playSfx("slide");
    setYm(({ y, m }) => ({ y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }));
  };
  const limit = max ?? (mode === "pick" ? today : undefined);
  const atLimit = !!limit && ym.y * 12 + ym.m >= toDate(limit).getUTCFullYear() * 12 + toDate(limit).getUTCMonth();

  const preview = (iso: string) => mode === "pick" && !!selected && iso >= selected && diffDays(iso, selected) < periodLength;

  return (
    <div className="cal" data-mode={mode} data-focus={focus ?? undefined}>
      <div className="cal-head">
        <button type="button" className="cal-nav" data-sfx="slide" onClick={() => move(-1)} aria-label={t("cal.prev")}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <p className="cal-title" aria-live="polite">{title}</p>
        <button type="button" className="cal-nav" data-sfx="slide" onClick={() => move(1)} disabled={atLimit} aria-label={t("cal.nextMonth")}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <div className="cal-grid" role="grid" key={`${ym.y}-${ym.m}`}>
        {weekdays.map((w, i) => <span key={`w${i}`} className="cal-wd" aria-hidden="true">{w}</span>)}
        {cells.map((iso, i) => {
          if (!iso) return <span key={`e${i}`} className="cal-empty" />;
          const info = infos.get(iso);
          const col = i % 7;
          const prev = col > 0 && cells[i - 1] ? infos.get(cells[i - 1]!)?.phase : undefined;
          const next = col < 6 && cells[i + 1] ? infos.get(cells[i + 1]!)?.phase : undefined;
          const phase = info?.phase ?? (preview(iso) ? "menstrual" : null);
          const disabled = !!limit && iso > limit;
          const label = [
            formatDate(iso, lang, { weekday: "long", day: "numeric", month: "long" }),
            info?.phase ? t(`cal.p.${info.phase}`) : "",
            info?.predicted ? t("cal.legendPredicted") : "",
            info?.ovulationDay ? t("cal.legendOv") : "",
            iso === today ? t("cal.legendToday") : "",
          ].filter(Boolean).join(", ");
          return (
            <button
              key={iso}
              type="button"
              className="cal-day"
              style={{ "--i": i } as React.CSSProperties}
              data-phase={phase ?? undefined}
              data-band-start={phase && (mode === "pick" ? iso === selected : prev !== phase) ? "" : undefined}
              data-band-end={phase && (mode === "pick" ? !preview(addDays(iso, 1)) : next !== phase) ? "" : undefined}
              data-period={info?.period || undefined}
              data-predicted={info?.predicted || undefined}
              data-ov={info?.ovulationDay || undefined}
              data-late={info?.late || undefined}
              data-today={iso === today || undefined}
              data-dim={focus && info?.phase !== focus ? "" : undefined}
              aria-pressed={selected === iso}
              aria-label={label}
              disabled={disabled}
              onClick={() => onSelect?.(iso)}
            >
              <span className="cal-num">{toDate(iso).getUTCDate()}</span>
            </button>
          );
        })}
      </div>
      {mode === "view" && (
        <div className="cal-legend" aria-hidden="true">
          <span><i className="lg-period" />{t("cal.legendPeriod")}</span>
          <span><i className="lg-predicted" />{t("cal.legendPredicted")}</span>
          <span><i className="lg-ov" />{t("cal.legendOv")}</span>
          <span><i className="lg-today" />{t("cal.legendToday")}</span>
        </div>
      )}
    </div>
  );
}
