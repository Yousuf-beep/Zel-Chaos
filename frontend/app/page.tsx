"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Rise from "@/components/Rise";
import { ApiError } from "@/lib/api";
import { DEMO_LANGS, FALLBACK_LANGS } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { circleNav } from "@/lib/transition";

type Phase = "splash" | "leaving" | "auth";
type Mode = "signup" | "login";

// The curtain in the root layout only plays on a full page load; later visits skip its delay.
let introPlayed = false;

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function Start() {
  const { t, user } = useStore();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("splash");
  const [delay] = useState(() => (introPlayed ? 0.05 : 0.95));
  const logo = useRef<HTMLHeadingElement>(null);
  const before = useRef<DOMRect | null>(null);
  const submitted = useRef(false);

  useEffect(() => {
    introPlayed = true;
  }, []);

  // The saved login finished loading while the form was open: skip ahead. (After a submit the form runs its own transition.)
  useEffect(() => {
    if (phase === "auth" && user && !submitted.current) router.replace("/home");
  }, [phase, user, router]);

  // FLIP: the logo is the same element in both phases, so it glides from its splash size and spot to its form size and spot.
  useLayoutEffect(() => {
    const el = logo.current;
    const first = before.current;
    before.current = null;
    if (!el || !first || reducedMotion()) return;
    const last = el.getBoundingClientRect();
    const dx = first.left + first.width / 2 - (last.left + last.width / 2);
    el.animate(
      [{ transform: `translate(${dx}px, ${first.top - last.top}px) scale(${first.width / last.width})` }, { transform: "none" }],
      { duration: 950, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
  }, [phase]);

  const go = (next: Phase) => {
    before.current = logo.current?.getBoundingClientRect() ?? null;
    setPhase(next);
  };

  const start = (e: React.MouseEvent) => {
    if (user) return circleNav(router, "/home", e);
    setPhase("leaving");
    setTimeout(() => go("auth"), reducedMotion() ? 0 : 430);
  };

  return (
    <div className="start" data-phase={phase} style={{ "--d": `${delay}s` } as React.CSSProperties}>
      <span className="start-orb" aria-hidden="true" />
      <span className="start-orb two" aria-hidden="true" />
      <div className="start-inner">
        <h1 ref={logo} className="start-logo" aria-label="Sakhi">
          <span className="start-letters" aria-hidden="true">
            {"Sakhi".split("").map((c, i) => <span key={i} style={{ "--i": i } as React.CSSProperties}>{c}</span>)}
          </span>
          <i aria-hidden="true" />
        </h1>
        {phase === "auth" ? (
          <AuthPanel onBack={() => go("splash")} onSubmit={() => (submitted.current = true)} />
        ) : (
          <div className="start-intro">
            <p className="rise start-tagline">
              <span className="ln"><span>{t("splash.tagline")}</span></span>
            </p>
            <button className="pill pill-accent pill-lg start-btn" onClick={start} disabled={phase === "leaving"}>
              <span className="dot" />{t("splash.start")}<span className="arrow">↗</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AuthPanel({ onBack, onSubmit }: { onBack: () => void; onSubmit: () => void }) {
  const { t, lang, setLang, signup, login } = useStore();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signup");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitRef = useRef<HTMLButtonElement>(null);
  const isSignup = mode === "signup";
  const ready = handle.trim() && password && (!isSignup || (name.trim() && agree));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    onSubmit();
    try {
      if (isSignup) await signup(name, handle, password);
      else await login(handle, password);
      const b = submitRef.current?.getBoundingClientRect();
      circleNav(router, "/home", b ? { clientX: b.left + b.width / 2, clientY: b.top + b.height / 2 } : { clientX: 0, clientY: 0 });
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 && err.message ? err.message : t("auth.error"));
      setBusy(false);
    }
  };

  const switchTo = (m: Mode) => {
    setMode(m);
    setError("");
  };

  return (
    <div className="auth">
      <div className="auth-top">
        <button type="button" className="text-link auth-back" onClick={onBack}>← {t("auth.back")}</button>
        <div className="seg" data-mode={mode} role="tablist">
          <i aria-hidden="true" />
          <button type="button" role="tab" aria-selected={isSignup} onClick={() => switchTo("signup")}>{t("auth.signup")}</button>
          <button type="button" role="tab" aria-selected={!isSignup} onClick={() => switchTo("login")}>{t("auth.login")}</button>
        </div>
      </div>

      <Rise key={mode} as="h2" className="auth-title" lines={isSignup ? [t("auth.signupTitle1"), t("auth.signupTitle2")] : [t("auth.loginTitle1"), t("auth.loginTitle2")]} />

      <form className="auth-form" onSubmit={submit} noValidate>
        <div className="fold" data-open={isSignup} inert={!isSignup}>
          <div>
            <label className="float" style={{ "--i": 0 } as React.CSSProperties}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder=" " autoComplete="given-name" maxLength={60} />
              <span>{t("auth.name")}</span>
            </label>
          </div>
        </div>
        <label className="float" style={{ "--i": 1 } as React.CSSProperties}>
          <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder=" " autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={120} />
          <span>{t("auth.handle")}</span>
        </label>
        <label className="float" style={{ "--i": 2 } as React.CSSProperties}>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder=" "
            type={show ? "text" : "password"}
            autoComplete={isSignup ? "new-password" : "current-password"}
            maxLength={200}
          />
          <span>{t("auth.password")}</span>
          <button type="button" className="float-action" onClick={() => setShow((v) => !v)} aria-pressed={show}>{show ? t("auth.hide") : t("auth.show")}</button>
        </label>

        <div className="fold" data-open={isSignup} inert={!isSignup}>
          <div>
            <label className="check" style={{ padding: "10px 4px 2px" }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span className="box" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5" /></svg></span>
              <span style={{ fontSize: 15, lineHeight: 1.4 }}>{t("auth.agree")}</span>
            </label>
            <details className="auth-data">
              <summary>{t("auth.data")} <span aria-hidden="true">+</span></summary>
              <ul>
                {["p1", "p2", "p3"].map((k) => <li key={k}>{t(`consent.${k}`)}</li>)}
              </ul>
            </details>
          </div>
        </div>

        {error && <p className="notice" role="alert">{error}</p>}

        <button ref={submitRef} className="pill pill-accent pill-lg auth-submit" type="submit" disabled={!ready || busy}>
          <span className="dot" />
          {busy ? t("auth.busy") : isSignup ? t("auth.submitSignup") : t("auth.submitLogin")}
          <span className="arrow">↗</span>
        </button>
        <p className="auth-note">{t("auth.note")}</p>
      </form>

      <div className="auth-langs" role="group" aria-label={t("nav.language")}>
        {FALLBACK_LANGS.filter((l) => DEMO_LANGS.includes(l.code)).map((l) => (
          <button key={l.code} type="button" className="lang-pill light" aria-pressed={lang === l.code} onClick={() => setLang(l.code)} lang={l.code}>
            {l.native_name}
          </button>
        ))}
      </div>
    </div>
  );
}
