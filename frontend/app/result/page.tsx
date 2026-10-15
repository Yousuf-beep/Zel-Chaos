"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import ResultCards from "@/components/ResultCards";
import { useStore } from "@/lib/store";

export default function Result() {
  const { t, result, resetConversation } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (!result) router.replace("/home");
  }, [result, router]);
  if (!result) return null;

  return (
    <div className="page">
      <div className="column">
        <span className="kicker" style={{ marginBottom: 16 }}><span className="dot" />{t("result.label")}</span>
        <div style={{ marginTop: 14 }}>
          <ResultCards r={result} />
        </div>
        <div className="result-actions">
          <Link className="pill pill-accent pill-lg" href="/doctor-card"><span className="dot" />{t("result.card")}<span className="arrow">↗</span></Link>
          <Link className="pill pill-white" href="/learn">{t("result.learn")} <span className="arrow">↗</span></Link>
          <button
            className="pill pill-ghost"
            onClick={async () => {
              await resetConversation();
              router.push("/home");
            }}
          >
            {t("result.again")}
          </button>
        </div>
      </div>
    </div>
  );
}
