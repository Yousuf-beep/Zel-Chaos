"use client";

import { useStore } from "@/lib/store";

export default function QuickExit({ className = "" }: { className?: string }) {
  const { t, quickExit } = useStore();
  return (
    <button className={`pill pill-dark exit-pill ${className}`} onClick={quickExit} aria-label={t("nav.exitLabel")} title={t("nav.exitLabel")}>
      <span>{t("nav.exit")}</span>
      <span className="x" aria-hidden="true">×</span>
    </button>
  );
}
