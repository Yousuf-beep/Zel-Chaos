"use client";

import { playSfx } from "@/lib/sound";
import { useStore } from "@/lib/store";

// A − value + control for small whole numbers, easier on a phone than a number field.
export default function Stepper({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (n: number) => void;
}) {
  const { t } = useStore();
  const set = (n: number) => {
    const v = Math.max(min, Math.min(max, n));
    if (v !== value) {
      playSfx("tick");
      onChange(v);
    }
  };
  return (
    <div className="stepper" role="group" aria-label={label}>
      <span className="stepper-label">{label}</span>
      <div className="stepper-row">
        <button type="button" data-sfx="tick" onClick={() => set(value - 1)} disabled={value <= min} aria-label={`${t("cal.minus")}: ${label}`}>−</button>
        <output aria-live="polite"><b key={value}>{value}</b><small>{t("cal.daysWord")}</small></output>
        <button type="button" data-sfx="tick" onClick={() => set(value + 1)} disabled={value >= max} aria-label={`${t("cal.plus")}: ${label}`}>+</button>
      </div>
    </div>
  );
}
