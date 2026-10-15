"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Rise from "@/components/Rise";
import Ribbon from "@/components/Ribbon";
import { api } from "@/lib/api";
import { DEMO_LANGS, FALLBACK_LANGS, type Lang } from "@/lib/i18n";
import { useStore } from "@/lib/store";

const GREETINGS = ["Hello", "नमस्ते", "ನಮಸ್ಕಾರ", "வணக்கம்"];

export default function About() {
  const { t, lang, setLang, user } = useStore();
  const router = useRouter();
  const [langs, setLangs] = useState<Lang[]>(FALLBACK_LANGS);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api.languages().then((r) => setLangs(r.languages)).catch(() => undefined);
  }, []);

  const shown = showAll ? langs : langs.filter((l) => DEMO_LANGS.includes(l.code));
  const statement = t("welcome.statement").split(" ");

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <Rise
          id="hero-title"
          className="hero-title"
          delay={7}
          lines={[t("welcome.line1"), t("welcome.line2"), <>{t("welcome.line3")} <span className="accent">{t("welcome.accent")}</span> {t("welcome.line4")}</>]}
        />
        <div className="hero-frame">
          <span className="orb" aria-hidden="true" />
          <span className="orb two" aria-hidden="true" />
          <div className="frame-top">
            <span>{t("welcome.hint")}</span>
            <span className="wave" aria-hidden="true">
              {Array.from({ length: 9 }, (_, i) => <i key={i} style={{ "--i": i } as React.CSSProperties} />)}
            </span>
          </div>
          <div className="frame-greet" aria-hidden="true">
            {GREETINGS.map((g, i) => <span key={g} style={{ "--i": i } as React.CSSProperties}>{g}</span>)}
          </div>
          <div className="frame-bottom">
            <p style={{ fontSize: 13, letterSpacing: "0.04em", opacity: 0.85 }}>{t("welcome.pick")}</p>
            <div className="lang-row" role="radiogroup" aria-label={t("welcome.pick")}>
              {shown.map((l) => (
                <button key={l.code} role="radio" aria-checked={lang === l.code} className="lang-pill" lang={l.code} onClick={() => setLang(l.code)} title={l.english_name}>
                  {l.native_name}
                </button>
              ))}
            </div>
            <div className="frame-cta">
              <button className="text-link" onClick={() => setShowAll((v) => !v)}>{showAll ? t("welcome.less") : t("welcome.more")}</button>
              <button className="pill pill-white" onClick={() => router.push(user ? "/home" : "/")}>
                <span className="dot" />{t("welcome.start")}<span className="arrow">↗</span>
              </button>
            </div>
          </div>
        </div>
        <a className="scroll-cue" href="#how" aria-label={t("welcome.scroll")}>
          <span aria-hidden="true">+</span><span aria-hidden="true">+</span><b>{t("welcome.scroll")}</b><span aria-hidden="true">+</span><span aria-hidden="true">+</span>
        </a>
      </section>

      <section className="section" id="how" data-reveal aria-labelledby="how-title">
        <Ribbon id="rb1" from="oklch(55% 0.2 320)" to="oklch(76% 0.13 32)" d="M-120 150 C160 210 350 290 520 600 C700 900 560 1230 290 1190 C-50 1130 -20 800 290 740 C640 650 1070 760 1240 980 C1430 1270 1490 950 1690 1060 C1790 1120 1780 1260 1790 1320" />
        <Rise as="h2" id="how-title" className="title how-title" lines={[t("welcome.howTitle1"), t("welcome.howTitle2")]} />
        <div className="steps">
          {[1, 2, 3].map((n) => (
            <article key={n} className="step" data-reveal="up" style={{ "--i": n } as React.CSSProperties}>
              <div className="step-num"><span>0{n}</span><span aria-hidden="true">↗</span></div>
              <div>
                <h3 className="tight">{t(`welcome.how${n}t`)}</h3>
                <p className="body">{t(`welcome.how${n}`)}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section" style={{ paddingTop: 20 }} aria-label="Nola promise">
        <p className="statement tight">
          {statement.map((w, i) => (
            <span key={i} className="w" style={{ "--p": i / statement.length } as React.CSSProperties}>{w} </span>
          ))}
        </p>
      </section>

      <Link href="/learn" className="marquee" aria-label={t("welcome.pmosLink")}>
        <div aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i}>{i % 2 ? t("welcome.pmosLink") : t("welcome.pmos")} <b className="accent">✺</b></span>
          ))}
        </div>
      </Link>

      <section className="section" data-reveal aria-label="Start">
        <Ribbon id="rb2" from="oklch(84% 0.1 190)" to="oklch(90% 0.08 170)" d="M430 -180 C210 360 500 700 960 690 C1430 680 1260 310 1310 60 C1390 -250 1700 -100 1620 270 C1510 690 1250 760 1260 890" />
        <Rise as="h2" className="display" lines={[t("talk.title1"), t("talk.title2")]} />
        <div style={{ marginTop: 40, display: "flex", gap: 12, flexWrap: "wrap" }} data-reveal="up">
          <button className="pill pill-accent pill-lg" onClick={() => router.push(user ? "/home" : "/")}>
            <span className="dot" />{t("welcome.start")}<span className="arrow">↗</span>
          </button>
          <Link className="pill pill-white" href="/learn">{t("nav.learn")} <span className="arrow">↗</span></Link>
        </div>
      </section>

      <footer className="foot-note">
        <span>{t("welcome.private")}</span>
        <span>© Nola · CHAOS 2026</span>
      </footer>
    </>
  );
}
