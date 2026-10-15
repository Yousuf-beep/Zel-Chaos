"use client";

import { useRouter } from "next/navigation";
import Mascot from "@/components/Mascot";
import Rise from "@/components/Rise";
import { useRequireUser, useStore } from "@/lib/store";
import { circleNav } from "@/lib/transition";

export default function Home() {
  const user = useRequireUser();
  const { t } = useStore();
  const router = useRouter();
  if (!user) return null;

  const firstName = user.name.split(/\s+/)[0];

  return (
    <div className="page home">
      <div className="home-mascot">
        <Mascot />
      </div>
      <p className="kicker home-hi"><span className="dot" />{t("home.hi")}, {firstName}</p>
      <Rise className="home-q" delay={4} lines={[t("home.q1"), t("home.q2")]} />
      <div className="home-actions">
        <button className="pill pill-accent pill-lg" style={{ "--i": 0 } as React.CSSProperties} onClick={(e) => circleNav(router, "/call", e)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" /></svg>
          {t("home.call")}
        </button>
        <button className="pill pill-white pill-lg" style={{ "--i": 1 } as React.CSSProperties} onClick={(e) => circleNav(router, "/chat", e, "var(--card)")}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.4 3.6c-.6.5-1.6.1-1.6-.8z" /></svg>
          {t("home.chat")}
        </button>
      </div>
      <p className="home-hint">{t("home.hint")}</p>
    </div>
  );
}
