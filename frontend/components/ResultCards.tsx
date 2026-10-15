"use client";

import type { ResultCard } from "@/lib/api";
import { useStore } from "@/lib/store";
import AudioPlayer from "./AudioPlayer";
import EvidencePanel from "./EvidencePanel";
import UrgencyBadge from "./UrgencyBadge";

const I = {
  doctor: <><circle cx="12" cy="7" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
  link: <><path d="M9 15l6-6" /><path d="M11 6l1-1a4 4 0 0 1 6 6l-1 1M13 18l-1 1a4 4 0 0 1-6-6l1-1" /></>,
  ask: <><path d="M21 12a8 8 0 0 1-12 7l-5 1 1-4a8 8 0 1 1 16-4z" /><path d="M9.5 9.5a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2 2-2 3M12 17v.01" /></>,
  test: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" /></>,
  leaf: <><path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14z" /><path d="M5 19l7-7" /></>,
  alert: <><path d="M12 3l9.5 17h-19zM12 10v4M12 17.5v.01" /></>,
};
const Ico = ({ d }: { d: React.ReactNode }) => <svg viewBox="0 0 24 24" aria-hidden="true">{d}</svg>;

export default function ResultCards({ r }: { r: ResultCard }) {
  const { t } = useStore();
  let n = 0;
  const reveal = () => ({ "data-reveal": "up", style: { "--i": n++ % 3 } as React.CSSProperties });

  return (
    <div>
      <UrgencyBadge urgency={r.urgency} />
      <AudioPlayer text={r.spoken_script} lang={r.language} />
      <p className="reflection">{r.reflection}</p>
      {r.used_safe_template && <p className="notice">{t("result.template")}</p>}
      {r.adolescent && <p className="notice">{t("result.teen")}</p>}

      <div className="blocks">
        <section className="block" {...reveal()}>
          <h2><Ico d={I.doctor} />{t("result.whoToSee")}</h2>
          <ul style={{ gap: 18 }}>
            {r.who_to_see.map((w, i) => (
              <li key={i} style={{ paddingLeft: 0 }} className="no-dot">
                <p className="big">{w.specialist}</p>
                <p className="sub">{w.why}</p>
                <span className="low-cost"><b>{t("result.lowCost")}</b> {w.low_cost_option}</span>
              </li>
            ))}
          </ul>
        </section>

        {r.may_be_associated_with.length > 0 && (
          <section className="block" {...reveal()}>
            <h2><Ico d={I.link} />{t("result.mayBe")}</h2>
            <ul style={{ gap: 16 }}>
              {r.may_be_associated_with.map((a, i) => (
                <li key={i}>
                  <p style={{ fontSize: 18, letterSpacing: "-0.01em" }}>{a.label}</p>
                  <p className="sub">{a.why}</p>
                </li>
              ))}
            </ul>
            {r.conditions_to_discuss.length > 0 && (
              <>
                <p className="sub" style={{ marginTop: 18 }}>{t("result.discuss")}</p>
                <div className="tags">{r.conditions_to_discuss.map((c) => <span key={c} className="tag">{c}</span>)}</div>
              </>
            )}
          </section>
        )}

        <div {...reveal()}><EvidencePanel items={r.evidence_map} /></div>

        {r.questions_to_ask.length > 0 && (
          <section className="block" {...reveal()}>
            <h2><Ico d={I.ask} />{t("result.questions")}</h2>
            <ul>{r.questions_to_ask.map((q, i) => <li key={i}>{q}</li>)}</ul>
          </section>
        )}

        {r.tests_doctor_may_consider.length > 0 && (
          <section className="block" {...reveal()}>
            <h2><Ico d={I.test} />{t("result.tests")}</h2>
            <div className="tags" style={{ marginTop: 0 }}>{r.tests_doctor_may_consider.map((x) => <span key={x} className="tag">{x}</span>)}</div>
            <p className="sub" style={{ marginTop: 12 }}>{t("result.testsHint")}</p>
          </section>
        )}

        {r.meanwhile.length > 0 && (
          <section className="block soft" {...reveal()}>
            <h2><Ico d={I.leaf} />{t("result.meanwhile")}</h2>
            <ul>{r.meanwhile.map((m, i) => <li key={i}>{m}</li>)}</ul>
          </section>
        )}

        <section className="block warn" {...reveal()}>
          <h2><Ico d={I.alert} />{t("result.urgentIf")}</h2>
          <ul>{r.seek_urgent_care_if.map((m, i) => <li key={i}>{m}</li>)}</ul>
          <a className="pill pill-dark" href="tel:112" style={{ marginTop: 16 }}>{t("urgent.call")} 112</a>
        </section>

        <p className="sub" style={{ textAlign: "center", padding: "8px 0" }}>{r.disclaimer}</p>
      </div>
    </div>
  );
}
