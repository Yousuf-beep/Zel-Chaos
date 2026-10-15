"use client";

import type { ResultCard } from "@/lib/api";
import { useStore } from "@/lib/store";

export default function EvidencePanel({ items }: { items: ResultCard["evidence_map"] }) {
  const { t } = useStore();
  if (!items.length) return null;
  return (
    <details className="block evidence">
      <summary>
        <span>{t("result.why")}</span>
        <span className="plus" aria-hidden="true">+</span>
      </summary>
      <div className="ev-body">
        <p className="sub" style={{ margin: "12px 0" }}>{t("result.whyHint")}</p>
        {items.map((e, i) => (
          <div className="ev-row" key={i}>
            <q>{e.your_words}</q>
            <span>{e.pattern}</span>
          </div>
        ))}
      </div>
    </details>
  );
}
