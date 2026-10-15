"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import type { CardBody, DoctorCard } from "@/lib/api";
import { translate } from "@/lib/i18n";
import { useStore } from "@/lib/store";

function Column({ body, lang, card }: { body: CardBody; lang: string; card: DoctorCard }) {
  const tl = (k: string) => translate(lang, k);
  return (
    <div lang={lang.split("-")[0]}>
      {(card.age || card.years_since_menarche != null) && (
        <div className="dsec">
          <p>
            {card.age ? <>{tl("card.age")}: <b style={{ fontWeight: 500 }}>{card.age}</b>&nbsp;&nbsp;</> : null}
            {card.years_since_menarche != null ? <>{tl("card.ysm")}: <b style={{ fontWeight: 500 }}>~{card.years_since_menarche}</b></> : null}
          </p>
        </div>
      )}
      <div className="dsec"><h3>{tl("card.concerns")}</h3><ul>{body.main_concerns.map((c, i) => <li key={i}>{c}</li>)}</ul></div>
      {body.symptom_timeline.length > 0 && (
        <div className="dsec">
          <h3>{tl("card.timeline")}</h3>
          <ul>
            {body.symptom_timeline.map((s, i) => (
              <li key={i}>{s.symptom}{s.since && ` · ${s.since}`}{s.patient_words && <> · <i>{s.patient_words}</i></>}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="dsec"><h3>{tl("card.cycle")}</h3><p>{body.cycle_notes}</p></div>
      {body.other_relevant.length > 0 && <div className="dsec"><h3>{tl("card.other")}</h3><ul>{body.other_relevant.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
      <div className="dsec"><h3>{tl("card.questions")}</h3><ul>{body.questions_patient_wants_to_ask.map((c, i) => <li key={i}>{c}</li>)}</ul></div>
      <p className="sub">{body.language_note}</p>
    </div>
  );
}

export default function DoctorCardView({ card }: { card: DoctorCard }) {
  const { t } = useStore();
  const qr = useRef<HTMLCanvasElement>(null);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    if (qr.current) QRCode.toCanvas(qr.current, card.qr_text, { margin: 1, width: 264, errorCorrectionLevel: "L" }).catch(() => undefined);
    setCanShare(typeof navigator !== "undefined" && !!navigator.share);
  }, [card.qr_text]);

  const share = () => navigator.share?.({ title: "Sakhi — doctor visit card", text: card.qr_text }).catch(() => undefined);

  return (
    <>
      <article className="dcard" data-reveal="tilt">
        <div className="dcard-head">
          <div>
            <p className="h">{card.header}</p>
            <p className="d">{card.generated_on}</p>
          </div>
          <div className="qr">
            <canvas ref={qr} aria-label={t("card.scan")} role="img" />
            {t("card.scan")}
          </div>
        </div>
        <div className={`dcols ${card.localised ? "two" : ""}`}>
          <Column body={card} lang="en-IN" card={card} />
          {card.localised && <Column body={card.localised} lang={card.language} card={card} />}
        </div>
      </article>
      <div className="dcard-actions no-print">
        <button className="pill pill-accent" onClick={() => window.print()}><span className="dot" />{t("card.print")}</button>
        {canShare && <button className="pill" onClick={share}>{t("card.share")} <span className="arrow">↗</span></button>}
      </div>
    </>
  );
}
