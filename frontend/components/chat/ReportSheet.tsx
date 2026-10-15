"use client";

import { useEffect, useRef, useState } from "react";
import Mascot from "@/components/Mascot";
import { api, ApiError, type Report } from "@/lib/api";
import { playSfx } from "@/lib/sound";
import { useStore } from "@/lib/store";
import { IconClose, IconDownload, IconShare } from "./icons";

// The doctor-visit report for one chat: a quick preview here, the full branded PDF (summary + transcript) to keep.
export default function ReportSheet({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const { t } = useStore();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [pdf, setPdf] = useState<{ blob: Blob; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    closeBtn.current?.focus();
    let cancelled = false;
    api
      .report(conversationId)
      .then((r) => {
        if (cancelled) return;
        setReport(r.report);
        playSfx("ready");
        // Fetch the PDF straight away: sharing must happen right after the tap, with no download in between.
        api.reportPdf(conversationId).then((p) => !cancelled && setPdf(p)).catch(() => undefined);
      })
      .catch((e) => !cancelled && setError(e instanceof ApiError && e.status === 409 ? t("report.notEnough") : t("report.error")));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const getPdf = async () => {
    if (pdf) return pdf;
    const p = await api.reportPdf(conversationId);
    setPdf(p);
    return p;
  };

  const download = async () => {
    setBusy(true);
    try {
      const { blob, name } = await getPdf();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError(t("report.error"));
    } finally {
      setBusy(false);
    }
  };

  const file = pdf ? new File([pdf.blob], pdf.name, { type: "application/pdf" }) : null;
  const canShare = !!file && typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] });
  const share = () => {
    if (file) navigator.share({ files: [file], title: t("report.title") }).catch(() => undefined);
  };

  const s = report?.summary;
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet2 report-sheet">
        <div className="sheet2-head">
          <h2 id="report-title">{t("report.title")}</h2>
          <button ref={closeBtn} type="button" className="c2-icon" onClick={onClose} aria-label={t("report.close")}><IconClose /></button>
        </div>
        <p className="body report-sub">{t("report.sub")}</p>

        {!report && !error && (
          <div className="report-making" role="status">
            <Mascot size="xs" mood="thinking" label="" />
            <span className="shimmer-text">{t("report.making")}</span>
          </div>
        )}
        {error && <p className="notice" role="alert">{error}</p>}

        {s && (
          <div className="report-preview">
            <p className="report-summary">{s.summary}</p>
            {s.main_concerns.length > 0 && (
              <section><h3>{t("report.concerns")}</h3><ul>{s.main_concerns.map((c, i) => <li key={i}>{c}</li>)}</ul></section>
            )}
            {s.symptoms.length > 0 && (
              <section>
                <h3>{t("report.noticed")}</h3>
                <ul>{s.symptoms.map((x, i) => <li key={i}>{x.symptom}{x.since && ` · ${x.since}`}{x.her_words && <> · <i>{x.her_words}</i></>}</li>)}</ul>
              </section>
            )}
            {report.doctor_flags.length > 0 && (
              <section><h3>{t("report.flags")}</h3><ul>{report.doctor_flags.map((f, i) => <li key={i}>{f.message || f.level}</li>)}</ul></section>
            )}
            {s.questions_for_doctor.length > 0 && (
              <section><h3>{t("report.questions")}</h3><ul className="report-q">{s.questions_for_doctor.map((q, i) => <li key={i}>{q}</li>)}</ul></section>
            )}
          </div>
        )}

        <p className="report-disclaimer"><span className="dot" aria-hidden="true" />{t("report.disclaimer")}</p>
        {report && (
          <div className="report-actions">
            <button type="button" className="pill pill-accent pill-lg" onClick={download} disabled={busy}>
              <IconDownload /> {busy ? t("report.downloading") : t("report.download")}
            </button>
            {canShare && (
              <button type="button" className="pill pill-lg" onClick={share} aria-label={t("card.share")} title={t("card.share")}>
                <IconShare />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
