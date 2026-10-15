"use client";

import { useState } from "react";
import type { Chip } from "@/lib/api";
import { useStore } from "@/lib/store";
import en from "@/locales/en.json";

const ALL = Object.keys(en.symptoms);

export default function SymptomChips({ chips, transcript, onConfirm, onEditTranscript, busy }: {
  chips: Chip[]; transcript: string; onConfirm: (chips: Chip[]) => void; onEditTranscript: (text: string) => void; busy?: boolean;
}) {
  const { t } = useStore();
  const [list, setList] = useState<Chip[]>(chips);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(transcript);

  const remove = (name: string) => {
    setLeaving(name);
    setTimeout(() => {
      setList((l) => l.filter((c) => c.name !== name));
      setLeaving(null);
    }, 320);
  };
  const add = (name: string) => {
    setList((l) => [...l, { name, verbatim: "" }]);
    setAdding(false);
  };
  const available = ALL.filter((n) => !list.some((c) => c.name === n));

  return (
    <section aria-labelledby="confirm-title">
      <span className="kicker"><span className="dot" />{t("confirm.label")}</span>
      <h1 id="confirm-title" className="title-sm tight" style={{ marginTop: 14 }}>{t("confirm.title")}</h1>

      <div className="transcript">
        <small>
          <span>{t("confirm.youSaid")}</span>
          {!editing && <button className="text-link" onClick={() => setEditing(true)}>{t("confirm.edit")}</button>}
        </small>
        {editing ? (
          <>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={t("confirm.youSaid")} />
            <button className="pill pill-accent" style={{ marginTop: 10 }} disabled={busy || !draft.trim()} onClick={() => onEditTranscript(draft.trim())}>
              {t("confirm.update")} <span className="arrow">↗</span>
            </button>
          </>
        ) : (
          <q>{transcript}</q>
        )}
      </div>

      {list.length === 0 && <p className="notice">{t("confirm.none")}</p>}
      <ul className="chips" style={{ listStyle: "none", padding: 0 }} aria-label={t("confirm.label")}>
        {list.map((c, i) => (
          <li key={c.name} className={`chip ${leaving === c.name ? "leaving" : ""}`} style={{ "--i": i } as React.CSSProperties}>
            <span>{t(`symptoms.${c.name}`)}</span>
            <button onClick={() => remove(c.name)} aria-label={`${t("confirm.remove")}: ${t(`symptoms.${c.name}`)}`}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
          </li>
        ))}
        <li>
          <button className="chip-add" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
            <span aria-hidden="true">{adding ? "−" : "+"}</span> {t("confirm.add")}
          </button>
        </li>
      </ul>

      {adding && (
        <div className="sheet">
          <p className="body" style={{ marginBottom: 12 }}>{t("confirm.addTitle")}</p>
          <div className="chips" style={{ marginTop: 0 }}>
            {available.map((n, i) => (
              <button key={n} className="chip-option" style={{ "--i": i } as React.CSSProperties} onClick={() => add(n)}>
                + {t(`symptoms.${n}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: 28 }}>
        <button className="pill pill-accent pill-lg" disabled={busy} onClick={() => onConfirm(list)}>
          <span className="dot" /> {t("confirm.ok")} <span className="arrow">↗</span>
        </button>
      </div>
    </section>
  );
}
