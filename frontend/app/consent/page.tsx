"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Rise from "@/components/Rise";
import { useStore } from "@/lib/store";

const ICONS = [
  <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  <><path d="M4 6h16M4 12h10M4 18h7" /></>,
];

export default function Consent() {
  const { t, setConsented, saveHistory, setSaveHistory } = useStore();
  const [agree, setAgree] = useState(false);
  const router = useRouter();

  return (
    <div className="page">
      <div className="column">
        <span className="kicker"><span className="dot" />{t("consent.label")}</span>
        <Rise className="title-sm" lines={[t("consent.title1"), t("consent.title2")]} />
        <div className="consent-list">
          {["p1", "p2", "p3"].map((k, i) => (
            <div key={k} className="consent-item" data-reveal="up" style={{ "--i": i } as React.CSSProperties}>
              <span className="ico" aria-hidden="true"><svg viewBox="0 0 24 24">{ICONS[i]}</svg></span>
              <p>{t(`consent.${k}`)}</p>
            </div>
          ))}
        </div>

        <label className="check" style={{ marginTop: 18 }}>
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span className="box" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5" /></svg></span>
          <span>{t("consent.agree")}</span>
        </label>
        <label className="switch">
          <span>
            {t("consent.save")}
            <span className="sub" style={{ display: "block", fontSize: 13, color: "var(--ink-soft)" }}>{t("consent.saveHint")}</span>
          </span>
          <input type="checkbox" role="switch" checked={saveHistory} onChange={(e) => setSaveHistory(e.target.checked)} />
          <span className="track" aria-hidden="true" />
        </label>

        <button
          className="pill pill-accent pill-lg"
          style={{ marginTop: 22 }}
          disabled={!agree}
          onClick={() => {
            setConsented(true);
            router.push("/home");
          }}
        >
          <span className="dot" />{t("consent.continue")}<span className="arrow">↗</span>
        </button>
      </div>
    </div>
  );
}
