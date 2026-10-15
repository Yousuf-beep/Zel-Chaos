"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import MascotGreeting from "@/components/MascotGreeting";
import Rise from "@/components/Rise";
import { api, type CycleStatus } from "@/lib/api";
import { formatDate, PHASE_OF_STATUS } from "@/lib/cycle";
import { useRequireUser, useStore } from "@/lib/store";
import { circleNav } from "@/lib/transition";

function CycleCard() {
  const { t, lang } = useStore();
  const [cycle, setCycle] = useState<CycleStatus | null | undefined>(undefined);
  useEffect(() => {
    api.cycle().then((r) => setCycle(r.cycle)).catch(() => setCycle(null));
  }, []);
  if (cycle === undefined) return <div className="home-cycle" data-loading="" aria-hidden="true" />;
  if (!cycle) {
    return (
      <Link className="home-cycle" href="/cycle">
        <span className="hc-dot" aria-hidden="true" />
        <span className="hc-text"><b>{t("cal.track")}</b><small>{t("cal.trackSub")}</small></span>
        <span className="arrow" aria-hidden="true">↗</span>
      </Link>
    );
  }
  const phase = PHASE_OF_STATUS[cycle.phase];
  const n = cycle.days_until_next;
  return (
    <Link className="home-cycle" href="/cycle" data-phase={phase ?? "late"}>
      <span className="hc-dot" aria-hidden="true" />
      <span className="hc-text">
        <b>{t("cycle.day").replace("{n}", String(cycle.cycle_day))} · {phase ? t(`cal.p.${phase}`) : t("cycle.phase.late")}</b>
        <small>
          {cycle.days_late > 0
            ? t("cal.late").replace("{n}", String(cycle.days_late))
            : `${t("cal.next")}: ${formatDate(cycle.next_period_expected, lang, { day: "numeric", month: "short" })} · ${n <= 0 ? t("cal.dueToday") : n === 1 ? t("cal.tomorrow") : t("cal.inDays").replace("{n}", String(n))}`}
        </small>
      </span>
      <span className="hc-cta">{t("cal.open")} <span className="arrow" aria-hidden="true">↗</span></span>
    </Link>
  );
}

export default function Home() {
  const user = useRequireUser();
  const { t } = useStore();
  const router = useRouter();
  if (!user) return null;

  const firstName = user.name.split(/\s+/)[0];

  return (
    <div className="page home">
      <MascotGreeting className="home-mascot" label={t("mascot.label")} lines={[t("greet.hi"), t("greet.help")]} />
      <p className="kicker home-hi"><span className="dot" />{t("home.hi")}, {firstName}</p>
      <Rise className="home-q" delay={4} lines={[t("home.q1"), t("home.q2")]} />
      <div className="home-actions">
        <button className="pill pill-accent pill-lg" style={{ "--i": 0 } as React.CSSProperties} onClick={(e) => circleNav(router, "/chat?voice=1", e)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" /></svg>
          {t("home.call")}
        </button>
        <button className="pill pill-white pill-lg" style={{ "--i": 1 } as React.CSSProperties} onClick={(e) => circleNav(router, "/chat", e, "var(--card)")}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.4 3.6c-.6.5-1.6.1-1.6-.8z" /></svg>
          {t("home.chat")}
        </button>
      </div>
      <p className="home-hint">{t("home.hint")}</p>
      <CycleCard />
    </div>
  );
}
