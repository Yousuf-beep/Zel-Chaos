"use client";

import { useEffect, useState } from "react";
import { playSfx } from "@/lib/sound";
import Mascot, { type MascotKind } from "./Mascot";

// Nola introduces herself: a cartoon thought bubble pops up over her head and types each line in turn, erasing the
// previous one first, then stays on the last line. The full line sizes the bubble from the start (an invisible copy
// sits under the typed text) so it does not grow letter by letter. Reduced motion shows each line whole.

const TYPE_MS = 48;
const ERASE_MS = 18;
const HOLD_MS = 1500;

type Step = { line: number; shown: number; erasing: boolean };

export default function MascotGreeting({ lines, label, size = "lg", kind, className = "" }: {
  lines: string[]; label: string; size?: "lg" | "sm" | "stage"; kind?: MascotKind; className?: string;
}) {
  const [step, setStep] = useState<Step>({ line: 0, shown: 0, erasing: false });
  const [visible, setVisible] = useState(false);
  const key = lines.join("\u0000");

  // Restart when the lines change (a new mascot was picked, or the language changed).
  useEffect(() => {
    setStep({ line: 0, shown: 0, erasing: false });
    setVisible(false);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => {
      setVisible(true);
      playSfx("pop");
      if (reduced) setStep({ line: lines.length - 1, shown: lines[lines.length - 1].length, erasing: false });
    }, reduced ? 0 : 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!visible) return;
    const text = lines[step.line] ?? "";
    const last = step.line === lines.length - 1;
    let wait: number;
    let next: Step;
    if (step.erasing) {
      if (step.shown === 0) {
        wait = 160;
        next = { line: step.line + 1, shown: 0, erasing: false };
      } else {
        wait = ERASE_MS;
        next = { ...step, shown: step.shown - 1 };
      }
    } else if (step.shown < text.length) {
      const prev = text[step.shown - 1] ?? "";
      wait = /[.,!?।]/.test(prev) ? 260 : TYPE_MS + Math.random() * 30;
      next = { ...step, shown: step.shown + 1 };
    } else {
      if (last) return;
      wait = HOLD_MS;
      next = { ...step, erasing: true };
    }
    const t = setTimeout(() => {
      if (!step.erasing && next.shown > step.shown && next.shown % 2 === 1) playSfx("type");
      if (next.line !== step.line) playSfx("pop");
      setStep(next);
    }, wait);
    return () => clearTimeout(t);
  }, [step, visible, lines]);

  const text = lines[step.line] ?? "";
  const typing = visible && (step.erasing || step.shown < text.length);

  return (
    <div className={`greet ${className}`} data-size={size}>
      <div className="tb" data-visible={visible} key={step.line} aria-hidden="true">
        <span className="tb-cloud">
          <i className="tb-puff" style={{ "--x": "14%", "--y": "-10px", "--s": "34px" } as React.CSSProperties} />
          <i className="tb-puff" style={{ "--x": "40%", "--y": "-16px", "--s": "44px" } as React.CSSProperties} />
          <i className="tb-puff" style={{ "--x": "68%", "--y": "-12px", "--s": "38px" } as React.CSSProperties} />
          <i className="tb-puff b" style={{ "--x": "28%", "--y": "-12px", "--s": "34px" } as React.CSSProperties} />
          <i className="tb-puff b" style={{ "--x": "62%", "--y": "-10px", "--s": "30px" } as React.CSSProperties} />
          <span className="tb-text">
            <span className="tb-ghost">{text}</span>
            <span className="tb-typed">
              {text.slice(0, step.shown)}
              <span className="tb-caret" data-typing={typing} />
            </span>
          </span>
        </span>
        <i className="tb-dot one" />
        <i className="tb-dot two" />
        <i className="tb-dot three" />
      </div>
      <p className="sr-only" aria-live="polite">{visible ? text : ""}</p>
      <Mascot size={size} label={label} kind={kind} />
    </div>
  );
}
