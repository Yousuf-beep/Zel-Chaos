"use client";

import { useStore } from "@/lib/store";

export default function DisclaimerFooter() {
  const { t } = useStore();
  return (
    <aside className="disclaimer no-print" role="note">
      <span className="dot" aria-hidden="true" />
      <span>{t("disclaimer")}</span>
    </aside>
  );
}
