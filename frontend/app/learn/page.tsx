"use client";

import { useEffect, useState } from "react";
import AudioPlayer from "@/components/AudioPlayer";
import Ribbon from "@/components/Ribbon";
import Rise from "@/components/Rise";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

type Myth = { id: string; myth: string; fact: string };

export default function Learn() {
  const { t, lang } = useStore();
  const [myths, setMyths] = useState<Myth[]>([]);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [listen, setListen] = useState<string | null>(null);

  useEffect(() => {
    api.myths(lang).then((r) => setMyths(r.myths)).catch(() => setMyths([]));
  }, [lang]);

  return (
    <div className="page" style={{ paddingInline: 0 }}>
      <section className="section" style={{ paddingTop: 0 }} data-reveal aria-labelledby="pmos-title">
        <Ribbon id="rb3" from="oklch(58% 0.2 330)" to="oklch(76% 0.13 32)" d="M-100 380 C300 260 520 420 760 700 C980 960 1300 980 1500 760 C1700 540 1820 620 2000 700" />
        <span className="kicker"><span className="dot" />{t("learn.label")}</span>
        <Rise as="h1" id="pmos-title" className="title" lines={[t("learn.renameTitle")]} />
        <p className="rename tight" aria-label="Polycystic Ovary Syndrome is now Polyendocrine Metabolic Ovarian Syndrome">
          <s>{t("learn.old")}</s> Ovary Syndrome
          <span className="new">{t("learn.newWord")} {t("learn.ovarian")}</span>
        </p>
        <p className="lede" style={{ marginTop: 34, maxWidth: 760 }} data-reveal="up">{t("learn.rename")}</p>
        <div style={{ maxWidth: 520 }} data-reveal="up">
          <AudioPlayer text={t("learn.rename")} lang={lang} />
        </div>
      </section>

      <section className="section" style={{ paddingTop: 30 }} data-reveal aria-labelledby="myth-title">
        <Rise as="h2" id="myth-title" className="title" lines={[t("learn.mythsTitle1"), t("learn.mythsTitle2")]} />
        <div className="myths">
          {myths.map((m, i) => (
            <div key={m.id} data-reveal="up" style={{ "--i": i % 2 } as React.CSSProperties}>
              <button className="myth" aria-pressed={!!flipped[m.id]} onClick={() => setFlipped((f) => ({ ...f, [m.id]: !f[m.id] }))} style={{ width: "100%" }}>
                <span className="myth-inner" style={{ display: "block" }}>
                  <span className="myth-face front" aria-hidden={!!flipped[m.id]}>
                    <span className="tagline"><span>{t("learn.myth")} · 0{i + 1}</span><span aria-hidden="true">↻</span></span>
                    <span className="mf-text">{m.myth}</span>
                    <span className="hint">{t("learn.tap")}</span>
                  </span>
                  <span className="myth-face back" aria-hidden={!flipped[m.id]}>
                    <span className="tagline"><span>{t("learn.fact")}</span><span aria-hidden="true">✓</span></span>
                    <span className="mf-text">{m.fact}</span>
                    <span className="hint">↻</span>
                  </span>
                </span>
              </button>
              <button className="text-link" style={{ marginTop: 10 }} onClick={() => setListen(listen === m.id ? null : m.id)}>{t("learn.listen")}</button>
              {listen === m.id && <AudioPlayer text={`${m.myth} ${m.fact}`} lang={lang} compact />}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
