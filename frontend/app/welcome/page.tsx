"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import MonthCalendar from "@/components/cycle/MonthCalendar";
import Stepper from "@/components/cycle/Stepper";
import Mascot, { MASCOTS } from "@/components/Mascot";
import MascotGreeting from "@/components/MascotGreeting";
import Rise from "@/components/Rise";
import { api, type Profile, type Regularity } from "@/lib/api";
import { addDays, formatDate } from "@/lib/cycle";
import { playSfx } from "@/lib/sound";
import { useRequireUser, useStore } from "@/lib/store";
import { circleNav } from "@/lib/transition";

// The one-time questions after sign-up. First she picks which look Nola wears, then a few high-signal, skippable
// questions: age, how her periods usually are (plus dates for cycle tracking), what she wants help with, and what a
// doctor has already told her. Never shown again.

const REGULARITY: Regularity[] = ["regular", "irregular", "absent", "not_started", "unsure"];
const CONCERNS = ["irregular_periods", "painful_periods", "heavy_periods", "skin_hair", "weight", "mood_stress", "sleep", "tiredness", "conceiving", "tracking"];
const CONDITIONS = ["pcos", "thyroid", "diabetes", "anaemia", "endometriosis", "other", "none", "declined"];
const EXCLUSIVE = ["none", "declined"];
const STEPS = 5;

/** The first expected start on or after today, counting whole cycles on from the last one. */
function nextFrom(last: string, len: number) {
  const now = new Date();
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  let d = addDays(last, len);
  while (d < today) d = addDays(d, len);
  return d;
}

export default function Welcome() {
  const user = useRequireUser({ onboarding: true });
  const { t, lang, markOnboarded, mascot, setMascot } = useStore();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [age, setAge] = useState("");
  const [regularity, setRegularity] = useState<Regularity | null>(null);
  const [lastStart, setLastStart] = useState("");
  const [noDate, setNoDate] = useState(false);
  const [cycleLen, setCycleLen] = useState(28);
  const [periodLen, setPeriodLen] = useState(5);
  const [concerns, setConcerns] = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const [meds, setMeds] = useState<Profile["hormonal_meds"]>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const finishBtn = useRef<HTMLButtonElement>(null);
  if (!user) return null;

  const toggle = (list: string[], set: (v: string[]) => void, v: string, exclusive: string[] = []) => {
    if (list.includes(v)) return set(list.filter((x) => x !== v));
    set(exclusive.includes(v) ? [v] : [...list.filter((x) => !exclusive.includes(x)), v]);
  };

  const finish = async () => {
    setBusy(true);
    setError("");
    const n = parseInt(age, 10);
    const profile: Profile = {
      age: n >= 8 && n <= 80 ? n : null,
      regularity,
      concerns,
      conditions,
      hormonal_meds: meds,
      mascot,
    };
    const tracksCycle = regularity !== "not_started" && lastStart && !noDate;
    try {
      await api.saveProfile(profile, tracksCycle ? { last_period_start: lastStart, cycle_length: cycleLen, period_length: periodLen } : null);
      markOnboarded();
      const b = finishBtn.current?.getBoundingClientRect();
      circleNav(router, "/home", b ? { clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 } : { clientX: 0, clientY: 0 });
    } catch {
      setError(t("onboard.error"));
      setBusy(false);
    }
  };

  const next = () => (step < STEPS ? setStep(step + 1) : finish());
  const firstName = user.name.split(/\s+/)[0];

  if (step === 0) {
    return (
      <div className="page onboard">
        <div className="column onboard-intro">
          <MascotGreeting size="sm" label={t("mascot.label")} lines={[t("greet.hiName").replace("{name}", firstName), t("greet.help")]} className="onboard-greet" />
          <p className="kicker"><span className="dot" />{t("onboard.kicker")}</p>
          <Rise className="title-sm" lines={[t("onboard.title")]} />
          <p className="body">{t("onboard.privacy")}</p>
          <button className="pill pill-accent pill-lg" onClick={() => setStep(1)}>
            <span className="dot" />{t("onboard.start")}<span className="arrow">↗</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page onboard">
      <div className="column">
        <div className="q-card" key={step}>
          <div className="q-progress" aria-label={`${step} ${t("onboard.of")} ${STEPS}`}>
            {Array.from({ length: STEPS }, (_, i) => <i key={i} data-on={i < step} />)}
          </div>

          {step === 1 && (
            <>
              <h2 className="q-title">{t("mascot.pickQ")}</h2>
              <p className="c-hint onboard-sub">{t("mascot.pickHint")}</p>
              <MascotGreeting size="stage" kind={mascot} label={t(`mascot.k.${mascot}`)} lines={[t(`mascot.say.${mascot}`)]} className="pick-stage" />
              <div className="mascot-picks" role="radiogroup" aria-label={t("mascot.pickQ")}>
                {MASCOTS.map((k, i) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    className="mascot-pick"
                    data-sfx="pop"
                    aria-checked={mascot === k}
                    style={{ "--i": i } as React.CSSProperties}
                    onClick={() => {
                      playSfx("pop");
                      setMascot(k, { local: true });
                    }}
                  >
                    <Mascot size="tile" kind={k} decorative />
                    <span>{t(`mascot.k.${k}`)}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="q-title">{t("onboard.ageQ")}</h2>
              <label className="field">
                {t("onboard.ageHint")}
                <input type="number" inputMode="numeric" min={8} max={80} value={age} placeholder={t("onboard.agePh")} onChange={(e) => setAge(e.target.value)} autoFocus />
              </label>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="q-title">{t("onboard.cycleQ")}</h2>
              <div className="options" role="radiogroup">
                {REGULARITY.map((r, i) => (
                  <button key={r} type="button" role="radio" className="option" aria-checked={regularity === r} style={{ "--i": i } as React.CSSProperties} onClick={() => setRegularity(regularity === r ? null : r)}>
                    <span className="tick" aria-hidden="true" />{t(`onboard.r.${r}`)}
                  </button>
                ))}
              </div>
              {regularity !== "not_started" && (
                <div className="onboard-cycle">
                  <p className="field-label">{t("onboard.lastStart")}</p>
                  {!noDate && <MonthCalendar mode="pick" selected={lastStart || null} onSelect={setLastStart} periodLength={periodLen} />}
                  <label className="check onboard-nodate">
                    <input type="checkbox" checked={noDate} onChange={(e) => setNoDate(e.target.checked)} />
                    <span className="box" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5" /></svg></span>
                    <span>{t("onboard.noDate")}</span>
                  </label>
                  {!noDate && (
                    <>
                      <div className="cycle-setup-row">
                        <Stepper label={t("cycle.cycleLength")} value={cycleLen} min={15} max={90} onChange={setCycleLen} />
                        <Stepper label={t("cycle.periodLength")} value={periodLen} min={1} max={15} onChange={setPeriodLen} />
                      </div>
                      {lastStart && (
                        <p className="onboard-predict" key={`${lastStart}-${cycleLen}`}>
                          <i aria-hidden="true" />
                          {t("cal.predictLine").replace("{date}", formatDate(nextFrom(lastStart, cycleLen), lang, { weekday: "short", day: "numeric", month: "long" }))}
                        </p>
                      )}
                      <p className="c-hint">{t("onboard.lengthHint")}</p>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="q-title">{t("onboard.concernsQ")}</h2>
              <p className="c-hint onboard-sub">{t("onboard.pickAny")}</p>
              <div className="chips onboard-chips">
                {CONCERNS.map((c, i) => (
                  <button key={c} type="button" className="chip-option" aria-pressed={concerns.includes(c)} style={{ "--i": i } as React.CSSProperties} onClick={() => toggle(concerns, setConcerns, c)}>
                    {t(`onboard.c.${c}`)}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <h2 className="q-title">{t("onboard.healthQ")}</h2>
              <p className="c-hint onboard-sub">{t("onboard.healthHint")}</p>
              <div className="chips onboard-chips">
                {CONDITIONS.map((c, i) => (
                  <button key={c} type="button" className="chip-option" aria-pressed={conditions.includes(c)} style={{ "--i": i } as React.CSSProperties} onClick={() => toggle(conditions, setConditions, c, EXCLUSIVE)}>
                    {t(`onboard.d.${c}`)}
                  </button>
                ))}
              </div>
              <h3 className="onboard-q2">{t("onboard.medsQ")}</h3>
              <div className="chips onboard-chips" role="radiogroup">
                {(["yes", "no", "declined"] as const).map((m) => (
                  <button key={m} type="button" role="radio" className="chip-option" aria-checked={meds === m} onClick={() => setMeds(meds === m ? null : m)}>
                    {t(`onboard.m.${m}`)}
                  </button>
                ))}
              </div>
            </>
          )}

          {error && <p className="notice" role="alert">{error}</p>}
          <div className="q-actions">
            <button type="button" className="text-link" onClick={() => setStep(step - 1)} disabled={busy}>← {t("onboard.back")}</button>
            <div className="onboard-actions">
              <button type="button" className="text-link" onClick={next} disabled={busy}>{t("onboard.skip")}</button>
              <button ref={finishBtn} type="button" className="pill pill-accent" onClick={next} disabled={busy}>
                {busy ? t("onboard.saving") : step === STEPS ? t("onboard.finish") : t("onboard.next")} <span className="arrow">↗</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
