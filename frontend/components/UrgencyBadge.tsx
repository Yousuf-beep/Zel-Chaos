"use client";

import type { Urgency } from "@/lib/api";
import { useStore } from "@/lib/store";

const ICONS: Record<Urgency, React.ReactNode> = {
  emergency: <path d="M12 3l9.5 17h-19zM12 10v4M12 17.5v.01" />,
  see_doctor_soon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  routine: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  self_monitor: <><path d="M4 19V5M4 19h16" /><path d="M7 15l4-4 3 3 5-6" /></>,
};

export default function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const { t } = useStore();
  return (
    <section className="urgency" data-u={urgency} aria-label={t("result.howSoon")}>
      <div className="u-top">
        <span className="u-ico" aria-hidden="true"><svg viewBox="0 0 24 24">{ICONS[urgency]}</svg></span>
        <span>{t("result.howSoon")}</span>
        <span className="pulse" aria-hidden="true" style={{ marginLeft: "auto" }} />
      </div>
      <p className="u-text tight">{t(`urgency.${urgency}`)}</p>
    </section>
  );
}
