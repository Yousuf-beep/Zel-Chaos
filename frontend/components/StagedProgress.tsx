"use client";

import { useStore } from "@/lib/store";

export type Stage = "listening" | "understanding" | "preparing";
const ORDER: Stage[] = ["listening", "understanding", "preparing"];

export default function StagedProgress({ stage, skipListening }: { stage: Stage; skipListening?: boolean }) {
  const { t } = useStore();
  const steps = skipListening ? ORDER.slice(1) : ORDER;
  const at = steps.indexOf(stage);
  return (
    <div className="stages" role="status" aria-live="polite">
      {steps.map((s, i) => (
        <div key={s} className="stage" data-s={i < at ? "done" : i === at ? "active" : "todo"}>
          <span className="mark" aria-hidden="true" />
          <span>{t(`stages.${s}`)}</span>
        </div>
      ))}
      <div style={{ display: "grid", gap: 10, marginTop: 26 }} aria-hidden="true">
        <div className="shimmer" style={{ width: "92%" }} />
        <div className="shimmer" style={{ width: "74%" }} />
        <div className="shimmer" style={{ width: "58%" }} />
      </div>
    </div>
  );
}
