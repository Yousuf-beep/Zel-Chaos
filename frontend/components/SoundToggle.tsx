"use client";

import { useEffect, useRef } from "react";
import { setSound, useSoundOn } from "@/lib/sound";
import { useStore } from "@/lib/store";

// The ZEL sound pill: a wave that travels while sound is on and eases flat when it is off.
export default function SoundToggle({ className = "" }: { className?: string }) {
  const { t } = useStore();
  const on = useSoundOn();
  const path = useRef<SVGPathElement>(null);
  const target = useRef(0);

  useEffect(() => {
    target.current = on ? 1 : 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let amp = reduced ? target.current : Number(path.current?.dataset.amp ?? 0);
    let phase = 0;
    let last = 0;
    let frame = 0;
    const draw = () => {
      let d = "";
      for (let i = 0; i <= 22; i++) {
        const u = i / 22;
        const y = 14 - amp * 6.5 * Math.sin(u * Math.PI * 2 + phase) * Math.sin(u * Math.PI);
        d += `${i ? "L" : "M"}${(3 + i).toFixed(1)} ${y.toFixed(2)}`;
      }
      path.current?.setAttribute("d", d);
      if (path.current) path.current.dataset.amp = String(amp);
    };
    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
      last = now;
      amp += (target.current - amp) * (1 - Math.exp(-7 * dt));
      if (Math.abs(amp - target.current) < 0.002) amp = target.current;
      if (!reduced) phase -= dt * 7;
      draw();
      if ((amp > 0 && !reduced) || amp !== target.current) frame = requestAnimationFrame(tick);
    };
    draw();
    if (!reduced) frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [on]);

  return (
    <button
      type="button"
      className={`sound-pill ${className}`}
      data-sfx="toggle"
      aria-pressed={on}
      aria-label={on ? t("sound.off") : t("sound.on")}
      title={on ? t("sound.isOn") : t("sound.isOff")}
      onClick={() => setSound(!on)}
    >
      <svg viewBox="0 0 28 28" aria-hidden="true"><path ref={path} d="M3 14H25" /></svg>
    </button>
  );
}
