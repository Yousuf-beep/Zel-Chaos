"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import DoctorCardView from "@/components/DoctorCardView";
import Rise from "@/components/Rise";
import { api, type DoctorCard } from "@/lib/api";
import { useStore } from "@/lib/store";

export default function DoctorCardPage() {
  const { t, sessionId, result } = useStore();
  const [card, setCard] = useState<DoctorCard | null>(null);
  const [state, setState] = useState<"loading" | "empty" | "ready">(sessionId && result ? "loading" : "empty");

  useEffect(() => {
    if (!sessionId || !result) return setState("empty");
    api.doctorCard(sessionId).then((c) => (setCard(c), setState("ready"))).catch(() => setState("empty"));
  }, [sessionId, result]);

  return (
    <div className="page">
      <div className="column" style={{ maxWidth: 860 }}>
        <span className="kicker no-print"><span className="dot" />{t("card.label")}</span>
        <div className="no-print"><Rise className="title-sm" lines={[t("card.title")]} /></div>
        {state === "loading" && (
          <div style={{ display: "grid", gap: 12, marginTop: 30 }} role="status" aria-label={t("card.loading")}>
            <div className="shimmer" style={{ height: 120, borderRadius: 20 }} />
            <div className="shimmer" style={{ width: "70%" }} />
            <div className="shimmer" style={{ width: "50%" }} />
          </div>
        )}
        {state === "empty" && (
          <div className="notice" style={{ marginTop: 30 }}>
            <p>{t("card.empty")}</p>
            <Link className="pill pill-accent" href="/chat" style={{ marginTop: 14 }}>{t("nav.talk")} <span className="arrow">↗</span></Link>
          </div>
        )}
        {state === "ready" && card && <DoctorCardView card={card} />}
      </div>
    </div>
  );
}
