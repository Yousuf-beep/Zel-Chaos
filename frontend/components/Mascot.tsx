"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { MascotKind } from "@/lib/api";
import { useStore } from "@/lib/store";

// Nola, the app's mascot and namesake: a round friend who floats, blinks, follows the pointer with her eyes, and beams
// when tapped. She can wear one of several looks (picked at sign-up); every look shares the same round body, face and
// motion, and only adds its own ears, nose and colours on top.
// In voice mode `mood` drives her: she leans in while listening, bobs while thinking and talks while speaking;
// the --lvl custom property (0-1, set by the caller) carries the live voice level.
export type MascotMood = "idle" | "listening" | "thinking" | "speaking";
export type { MascotKind };
export const MASCOTS: MascotKind[] = ["radish", "cat", "dog", "rabbit", "teddy", "frog"];

const INK = "oklch(20% 0.04 300)";

type Look = {
  /** Light, middle and edge colours of the body's radial gradient. */
  body: [string, string, string];
  /** Drawn behind the body: sprout, ears. */
  back?: React.ReactNode;
  /** Drawn on the body, under the face: ear flaps, patches, muzzle. */
  front?: React.ReactNode;
  /** Drawn with the face (moves with the eyes): nose, whiskers, teeth. */
  face?: React.ReactNode;
  eyes?: { x: [number, number]; y: number };
  mouth?: string;
  cheeks?: { y: number; x: [number, number] };
};

const LOOKS: Record<MascotKind, Look> = {
  radish: {
    body: ["oklch(86% 0.09 340)", "var(--accent-2)", "var(--accent)"],
    back: (
      <g className="m-sprout">
        <path d="M100 52 C99 40 101 32 106 24" fill="none" stroke="oklch(58% 0.12 160)" strokeWidth="4" strokeLinecap="round" />
        <path d="M105 27 C112 14 128 14 134 20 C126 30 114 32 105 27Z" fill="oklch(72% 0.14 155)" />
        <path d="M103 33 C94 24 80 26 76 32 C84 40 96 39 103 33Z" fill="oklch(66% 0.13 160)" />
      </g>
    ),
  },
  cat: {
    body: ["oklch(90% 0.07 70)", "oklch(78% 0.13 58)", "oklch(66% 0.15 45)"],
    back: (
      <g className="m-ears" strokeLinejoin="round">
        <g className="m-ear">
          <path d="M40 92 L50 34 L92 60 Z" fill="oklch(70% 0.14 48)" stroke="oklch(70% 0.14 48)" strokeWidth="10" />
          <path d="M53 76 L57 48 L80 63 Z" fill="oklch(80% 0.09 10)" />
        </g>
        <g className="m-ear">
          <path d="M160 92 L150 34 L108 60 Z" fill="oklch(70% 0.14 48)" stroke="oklch(70% 0.14 48)" strokeWidth="10" />
          <path d="M147 76 L143 48 L120 63 Z" fill="oklch(80% 0.09 10)" />
        </g>
      </g>
    ),
    front: (
      <g fill="oklch(62% 0.15 45 / 0.55)">
        <path d="M100 52 C96 62 96 70 100 76 C104 70 104 62 100 52Z" />
        <path d="M84 55 C82 62 83 68 86 72 C89 67 89 61 84 55Z" />
        <path d="M116 55 C118 62 117 68 114 72 C111 67 111 61 116 55Z" />
      </g>
    ),
    face: (
      <g>
        <path d="M94 124 Q100 121 106 124 L100 130 Z" fill="oklch(66% 0.14 10)" stroke="oklch(66% 0.14 10)" strokeWidth="2.5" strokeLinejoin="round" />
        <g stroke={INK} strokeWidth="2.6" strokeLinecap="round" opacity="0.55">
          <path d="M48 122 L22 116" /><path d="M48 130 L20 132" />
          <path d="M152 122 L178 116" /><path d="M152 130 L180 132" />
        </g>
      </g>
    ),
    mouth: "M89 133 Q94.5 140 100 133 Q105.5 140 111 133",
  },
  dog: {
    body: ["oklch(93% 0.035 80)", "oklch(84% 0.06 70)", "oklch(72% 0.08 60)"],
    back: null,
    front: (
      <g>
        <ellipse cx="126" cy="108" rx="18" ry="19" fill="oklch(58% 0.08 50 / 0.45)" />
        <ellipse cx="100" cy="135" rx="24" ry="16" fill="oklch(97% 0.02 80)" />
        <g className="m-ears m-ears-flop" fill="oklch(52% 0.08 45)">
          <path className="m-ear" d="M50 66 C30 62 18 82 22 112 C25 132 40 138 50 126 C58 114 60 82 50 66Z" />
          <path className="m-ear" d="M150 66 C170 62 182 82 178 112 C175 132 160 138 150 126 C142 114 140 82 150 66Z" />
        </g>
      </g>
    ),
    face: (
      <g>
        <ellipse cx="100" cy="126" rx="9" ry="6" fill={INK} />
        <ellipse cx="97" cy="124" rx="3" ry="1.6" fill="#fff" opacity="0.6" />
        <path d="M100 131 L100 136" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      </g>
    ),
    mouth: "M90 136 Q95 142 100 136 Q105 142 110 136",
    cheeks: { y: 134, x: [58, 142] },
  },
  rabbit: {
    body: ["oklch(99% 0.005 300)", "oklch(93% 0.03 320)", "oklch(83% 0.06 330)"],
    back: (
      <g className="m-ears m-ears-tall">
        <g className="m-ear">
          <ellipse cx="76" cy="40" rx="15" ry="38" fill="oklch(91% 0.035 320)" transform="rotate(-12 76 78)" />
          <ellipse cx="76" cy="44" rx="7" ry="28" fill="oklch(84% 0.08 5)" transform="rotate(-12 76 78)" />
        </g>
        <g className="m-ear">
          <ellipse cx="124" cy="40" rx="15" ry="38" fill="oklch(91% 0.035 320)" transform="rotate(12 124 78)" />
          <ellipse cx="124" cy="44" rx="7" ry="28" fill="oklch(84% 0.08 5)" transform="rotate(12 124 78)" />
        </g>
      </g>
    ),
    face: (
      <g>
        <ellipse cx="100" cy="125" rx="6" ry="4.2" fill="oklch(70% 0.13 5)" />
        <path d="M95 136 h10 v6 a2 2 0 0 1 -2 2 h-6 a2 2 0 0 1 -2 -2 Z" fill="#fff" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M100 136 V144" stroke={INK} strokeWidth="1.4" />
      </g>
    ),
    mouth: "M89 133 Q94.5 139 100 133 Q105.5 139 111 133",
  },
  teddy: {
    body: ["oklch(82% 0.06 65)", "oklch(68% 0.08 55)", "oklch(55% 0.08 48)"],
    back: (
      <g className="m-ears m-ears-round">
        <g className="m-ear">
          <circle cx="48" cy="66" r="24" fill="oklch(58% 0.08 48)" />
          <circle cx="48" cy="66" r="13" fill="oklch(84% 0.05 60)" />
        </g>
        <g className="m-ear">
          <circle cx="152" cy="66" r="24" fill="oklch(58% 0.08 48)" />
          <circle cx="152" cy="66" r="13" fill="oklch(84% 0.05 60)" />
        </g>
      </g>
    ),
    front: <ellipse cx="100" cy="135" rx="26" ry="18" fill="oklch(90% 0.04 70)" />,
    face: (
      <g>
        <ellipse cx="100" cy="126" rx="9.5" ry="6.5" fill={INK} />
        <ellipse cx="97" cy="124" rx="3" ry="1.6" fill="#fff" opacity="0.6" />
        <path d="M100 132 L100 137" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      </g>
    ),
    mouth: "M91 137 Q95.5 143 100 137 Q104.5 143 109 137",
    cheeks: { y: 134, x: [58, 142] },
  },
  frog: {
    body: ["oklch(92% 0.1 135)", "oklch(80% 0.15 140)", "oklch(66% 0.15 148)"],
    back: (
      <g>
        <circle cx="68" cy="70" r="27" fill="oklch(78% 0.15 140)" />
        <circle cx="132" cy="70" r="27" fill="oklch(78% 0.15 140)" />
        <circle cx="68" cy="70" r="18" fill="#fff" />
        <circle cx="132" cy="70" r="18" fill="#fff" />
      </g>
    ),
    front: (
      <g fill="oklch(66% 0.15 148 / 0.4)">
        <circle cx="152" cy="150" r="7" /><circle cx="140" cy="164" r="4.5" /><circle cx="48" cy="152" r="5" />
      </g>
    ),
    eyes: { x: [68, 132], y: 72 },
    mouth: "M74 124 Q100 146 126 124",
    cheeks: { y: 128, x: [56, 144] },
  },
};

/** The mascot the signed-in person picked, or radish (the original look) if none. */
export function useMascotKind(): MascotKind {
  return useStore().mascot;
}

export default function Mascot({ size = "lg", label = "Nola", mood = "idle", kind, onTap, decorative = false }: {
  size?: "lg" | "sm" | "xs" | "voice" | "stage" | "tile"; label?: string; mood?: MascotMood; kind?: MascotKind; onTap?: () => void;
  /** Render as a plain picture (inside another button), without the tap reaction. */
  decorative?: boolean;
}) {
  const chosen = useMascotKind();
  const look = LOOKS[kind ?? chosen] ?? LOOKS.radish;
  const ref = useRef<HTMLElement>(null);
  const gradient = `nola-body-${useId().replace(/:/g, "")}`;
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
    if (onTap) return onTap();
    setHappy(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHappy(false), 1400);
  };

  const [lx, rx] = look.eyes?.x ?? [76, 124];
  const ey = look.eyes?.y ?? 112;
  const cheeks = look.cheeks ?? { y: 132, x: [62, 138] };

  const body = (
    <>
      <span className="mascot-float">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <defs>
            <radialGradient id={gradient} cx="0.36" cy="0.3" r="0.8">
              <stop offset="0" style={{ stopColor: look.body[0] }} />
              <stop offset="0.45" style={{ stopColor: look.body[1] }} />
              <stop offset="1" style={{ stopColor: look.body[2] }} />
            </radialGradient>
          </defs>
          {look.back}
          <g className="m-body">
            <ellipse cx="100" cy="118" rx="74" ry="68" fill={`url(#${gradient})`} />
            <ellipse cx="74" cy="84" rx="18" ry="10" fill="oklch(100% 0 0 / 0.28)" transform="rotate(-24 74 84)" />
            {look.front}
            <g className="m-face">
              <g className="m-eyes">
                <g className="m-eye">
                  <ellipse cx={lx} cy={ey} rx="8" ry="11" fill={INK} />
                  <circle cx={lx + 3} cy={ey - 5} r="3" fill="#fff" />
                </g>
                <g className="m-eye">
                  <ellipse cx={rx} cy={ey} rx="8" ry="11" fill={INK} />
                  <circle cx={rx + 3} cy={ey - 5} r="3" fill="#fff" />
                </g>
              </g>
              <g className="m-joy" fill="none" stroke={INK} strokeWidth="4.5" strokeLinecap="round">
                <path d={`M${lx - 9} ${ey + 2} Q${lx} ${ey - 10} ${lx + 9} ${ey + 2}`} />
                <path d={`M${rx - 9} ${ey + 2} Q${rx} ${ey - 10} ${rx + 9} ${ey + 2}`} />
              </g>
              <ellipse cx={cheeks.x[0]} cy={cheeks.y} rx="11" ry="6.5" fill="var(--coral)" opacity="0.75" />
              <ellipse cx={cheeks.x[1]} cy={cheeks.y} rx="11" ry="6.5" fill="var(--coral)" opacity="0.75" />
              {look.face}
              <path className="m-mouth" d={look.mouth ?? "M91 133 Q100 142 109 133"} fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </g>
        </svg>
      </span>
      <span className="mascot-shadow" aria-hidden="true" />
    </>
  );
  const common = { className: `mascot mascot-${size}`, "data-kind": kind ?? chosen, "data-happy": happy, "data-mood": mood };
  if (decorative) return <span ref={ref as React.Ref<HTMLSpanElement>} {...common} aria-hidden="true">{body}</span>;
  return (
    <button ref={ref as React.Ref<HTMLButtonElement>} type="button" {...common} onClick={cheer} aria-label={label}>
      {body}
    </button>
  );
}
