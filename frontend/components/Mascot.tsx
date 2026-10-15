"use client";

import { useEffect, useRef, useState } from "react";

// Sakhi's mascot: a round friend with a sprout. Floats, blinks, follows the pointer with her eyes, and beams when tapped.
export default function Mascot({ size = "lg", label = "Sakhi" }: { size?: "lg" | "sm"; label?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [happy, setHappy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const b = el.getBoundingClientRect();
        const dx = (e.clientX - (b.left + b.width / 2)) / window.innerWidth;
        const dy = (e.clientY - (b.top + b.height / 2)) / window.innerHeight;
        el.style.setProperty("--lx", (Math.max(-1, Math.min(1, dx * 2.4)) * 5).toFixed(2));
        el.style.setProperty("--ly", (Math.max(-1, Math.min(1, dy * 2.4)) * 4).toFixed(2));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
      clearTimeout(timer.current);
    };
  }, []);

  const cheer = () => {
    setHappy(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHappy(false), 1400);
  };

  return (
    <button ref={ref} type="button" className={`mascot mascot-${size}`} data-happy={happy} onClick={cheer} aria-label={label}>
      <span className="mascot-float">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <defs>
            <radialGradient id="mascot-body" cx="0.36" cy="0.3" r="0.8">
              <stop offset="0" style={{ stopColor: "oklch(86% 0.09 340)" }} />
              <stop offset="0.45" style={{ stopColor: "var(--accent-2)" }} />
              <stop offset="1" style={{ stopColor: "var(--accent)" }} />
            </radialGradient>
          </defs>
          <g className="m-sprout">
            <path d="M100 52 C99 40 101 32 106 24" fill="none" stroke="oklch(58% 0.12 160)" strokeWidth="4" strokeLinecap="round" />
            <path d="M105 27 C112 14 128 14 134 20 C126 30 114 32 105 27Z" fill="oklch(72% 0.14 155)" />
            <path d="M103 33 C94 24 80 26 76 32 C84 40 96 39 103 33Z" fill="oklch(66% 0.13 160)" />
          </g>
          <g className="m-body">
            <ellipse cx="100" cy="118" rx="74" ry="68" fill="url(#mascot-body)" />
            <ellipse cx="74" cy="84" rx="18" ry="10" fill="oklch(100% 0 0 / 0.28)" transform="rotate(-24 74 84)" />
            <g className="m-face">
              <g className="m-eyes">
                <g className="m-eye">
                  <ellipse cx="76" cy="112" rx="8" ry="11" fill="oklch(20% 0.04 300)" />
                  <circle cx="79" cy="107" r="3" fill="#fff" />
                </g>
                <g className="m-eye">
                  <ellipse cx="124" cy="112" rx="8" ry="11" fill="oklch(20% 0.04 300)" />
                  <circle cx="127" cy="107" r="3" fill="#fff" />
                </g>
              </g>
              <g className="m-joy" fill="none" stroke="oklch(20% 0.04 300)" strokeWidth="4.5" strokeLinecap="round">
                <path d="M67 114 Q76 102 85 114" />
                <path d="M115 114 Q124 102 133 114" />
              </g>
              <ellipse cx="62" cy="132" rx="11" ry="6.5" fill="var(--coral)" opacity="0.75" />
              <ellipse cx="138" cy="132" rx="11" ry="6.5" fill="var(--coral)" opacity="0.75" />
              <path className="m-mouth" d="M91 133 Q100 142 109 133" fill="none" stroke="oklch(20% 0.04 300)" strokeWidth="4" strokeLinecap="round" />
            </g>
          </g>
        </svg>
      </span>
      <span className="mascot-shadow" aria-hidden="true" />
    </button>
  );
}
