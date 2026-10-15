"use client";

import { useState } from "react";
import type { FollowupPayload } from "@/lib/api";
import { useStore } from "@/lib/store";

const MENARCHE = ["lt1", "1to3", "3to8", "gt8", "never", "unknown"];

export default function FollowUpCard({ q, onAnswer, busy }: { q: FollowupPayload; onAnswer: (value: unknown) => void; busy?: boolean }) {
  const { t } = useStore();
  const [multi, setMulti] = useState<string[]>([]);
  const [age, setAge] = useState("");
  const [menarche, setMenarche] = useState<string | null>(null);
  const skipValue = q.kind === "multi" ? ["none"] : q.kind === "age_menarche" ? { age: null, menarche: "unknown" } : q.question_key === "cycle_pattern" ? "unknown" : "declined";

  const toggle = (o: string) =>
    setMulti((m) => (o === "none" ? ["none"] : m.includes(o) ? m.filter((x) => x !== o) : [...m.filter((x) => x !== "none"), o]));

  return (
    <section className="q-card" key={q.question_key} aria-labelledby="q-title">
      <div className="q-progress" aria-label={`${q.step} ${t("followup.of")} ${q.max_steps}`}>
        {Array.from({ length: q.max_steps }, (_, i) => <i key={i} data-on={i < q.step} />)}
      </div>
      <span className="kicker">{t("followup.label")} · {q.step} {t("followup.of")} {q.max_steps}</span>
      <h2 id="q-title" className="q-title tight" style={{ marginTop: 12 }}>{t(`followup.q.${q.question_key}`)}</h2>

      {q.kind === "single" && (
        <div className="options" role="group">
          {q.options.map((o, i) => (
            <button key={o} className="option" style={{ "--i": i } as React.CSSProperties} disabled={busy} onClick={() => onAnswer(o)}>
              {t(`followup.o.${o}`)}
            </button>
          ))}
        </div>
      )}

      {q.kind === "multi" && (
        <div className="options" role="group">
          {q.options.map((o, i) => (
            <button key={o} role="checkbox" aria-checked={multi.includes(o)} className="option" style={{ "--i": i } as React.CSSProperties} onClick={() => toggle(o)}>
              <span className="tick" aria-hidden="true" />
              {t(`followup.o.${o}`)}
            </button>
          ))}
        </div>
      )}

      {q.kind === "age_menarche" && (
        <div>
          <label className="field">
            {t("followup.age")}
            <input inputMode="numeric" pattern="[0-9]*" maxLength={2} placeholder={t("followup.agePh")} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} />
          </label>
          <span className="field" style={{ marginBottom: 8 }}>{t("followup.periodsStarted")}</span>
          <div className="options" role="radiogroup">
            {MENARCHE.map((o, i) => (
              <button key={o} role="radio" aria-checked={menarche === o} className="option" style={{ "--i": i } as React.CSSProperties} onClick={() => setMenarche(o)}>
                <span className="tick" aria-hidden="true" style={{ borderRadius: "50%" }} />
                {t(`followup.o.${o}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="q-actions">
        <button className="pill pill-ghost" disabled={busy} onClick={() => onAnswer(skipValue)}>
          {t("followup.skip")}
        </button>
        {q.kind !== "single" && (
          <button
            className="pill pill-accent"
            disabled={busy || (q.kind === "multi" ? multi.length === 0 : !age && !menarche)}
            onClick={() => onAnswer(q.kind === "multi" ? multi : { age: age ? Number(age) : null, menarche: menarche ?? "unknown" })}
          >
            {t("followup.continue")} <span className="arrow">↗</span>
          </button>
        )}
      </div>
    </section>
  );
}
