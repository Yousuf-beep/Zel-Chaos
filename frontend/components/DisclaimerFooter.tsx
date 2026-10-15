"use client";

import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";

export default function DisclaimerFooter() {
  const { t } = useStore();
  // The chat shows the same line under its composer instead.
  if (usePathname() === "/chat") return null;
  return (
    <aside className="disclaimer no-print" role="note">
      <span className="dot" aria-hidden="true" />
      <span>{t("disclaimer")}</span>
    </aside>
  );
}
