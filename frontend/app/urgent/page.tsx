"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import AudioPlayer from "@/components/AudioPlayer";
import QuickExit from "@/components/QuickExit";
import { useStore } from "@/lib/store";

export default function Urgent() {
  const { t, urgent, resetConversation } = useStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!urgent) router.replace("/home");
  }, [urgent, router]);
  useEffect(() => setMounted(true), []);
  // Portalled to <body>: the page-enter wrapper's transform would otherwise trap position:fixed inside it.
  if (!urgent || !mounted) return null;

  const crisis = urgent.tier === "crisis";
  const numbers = urgent.blocks.flatMap((b) => b.numbers).filter((n, i, all) => all.findIndex((x) => x.number === n.number) === i);
  const spoken = urgent.blocks.map((b) => b.message).join(" ");

  return createPortal(
    <div className="urgent-screen" data-tier={urgent.tier} role="alertdialog" aria-labelledby="urgent-title" aria-describedby="urgent-msg">
      <div className="urgent-top">
        <span className="kicker" style={{ color: "inherit", opacity: 0.85 }}><span className="pulse" aria-hidden="true" />Sakhi</span>
        <QuickExit />
      </div>
      <h1 id="urgent-title" className="tight">{crisis ? t("urgent.crisisTitle") : t("urgent.emergencyTitle")}</h1>
      <div id="urgent-msg" style={{ display: "grid", gap: 14 }}>
        {urgent.blocks.map((b) => <p key={b.kind}>{b.message}</p>)}
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {numbers.map((n, i) => (
          <a key={n.number} className="call" href={`tel:${n.number.replace(/[^\d]/g, "")}`} style={{ "--i": i } as React.CSSProperties}>
            <span>
              <small>{t("urgent.call")} · {n.label}</small>
              {n.number}
            </span>
            <span className="ph" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" /></svg>
            </span>
          </a>
        ))}
      </div>
      <AudioPlayer text={spoken} lang={urgent.lang} compact />
      <button
        className="pill"
        style={{ alignSelf: "flex-start", marginTop: "auto" }}
        onClick={async () => {
          await resetConversation();
          router.push("/home");
        }}
      >
        {t("urgent.back")}
      </button>
    </div>,
    document.body,
  );
}
