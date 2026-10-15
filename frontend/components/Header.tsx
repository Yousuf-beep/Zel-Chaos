"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { DEMO_LANGS, FALLBACK_LANGS } from "@/lib/i18n";
import QuickExit from "./QuickExit";

const LINKS = [
  { href: "/home", key: "side.home", auth: true },
  { href: "/call", key: "side.call", auth: true },
  { href: "/chat", key: "side.chat", auth: true },
  { href: "/learn", key: "side.learn" },
  { href: "/doctor-card", key: "side.card" },
  { href: "/about", key: "side.about" },
  { href: "/consent", key: "side.privacy" },
];

export default function Header() {
  const { t, lang, setLang, user, logout } = useStore();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const closeBtn = useRef<HTMLButtonElement>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    if (!open) return;
    closeBtn.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // The start screen is its own full-bleed brand moment.
  if (pathname === "/") return null;

  const close = () => {
    setOpen(false);
    menuBtn.current?.focus({ preventScroll: true });
  };
  const links = LINKS.filter((l) => !l.auth || user);

  return (
    <>
      <header className="header no-print" data-scrolled={scrolled && !open}>
        <div className="header-left">
          <button ref={menuBtn} className="burger" aria-expanded={open} aria-controls="side-panel" aria-label={t("side.open")} onClick={() => setOpen(true)}>
            <i /><i /><i />
          </button>
          <Link className="logo" href={user ? "/home" : "/"} aria-label="Sakhi home">
            Sakhi<i aria-hidden="true" />
          </Link>
        </div>
        <nav className="header-actions" aria-label="Main">
          <QuickExit />
        </nav>
      </header>

      <div className="side-scrim no-print" data-open={open} onClick={close} aria-hidden="true" />
      <aside id="side-panel" className="side no-print" data-open={open} aria-label={t("nav.explore")} aria-hidden={!open} inert={!open}>
        <div className="side-top">
          <span className="side-hi">{user ? `${t("side.hi")}, ${user.name.split(/\s+/)[0]}` : t("side.guest")}</span>
          <button ref={closeBtn} className="side-close" onClick={close} aria-label={t("side.close")}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <nav className="side-nav" aria-label={t("nav.explore")}>
          {links.map((l, i) => (
            <Link key={l.href} href={l.href} style={{ "--i": i } as React.CSSProperties} aria-current={pathname === l.href ? "page" : undefined}>
              <span>{t(l.key)}</span>
              <small>0{i + 1}</small>
            </Link>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="side-langs" role="group" aria-label={t("nav.language")}>
            {FALLBACK_LANGS.filter((l) => DEMO_LANGS.includes(l.code)).map((l) => (
              <button key={l.code} aria-pressed={lang === l.code} onClick={() => setLang(l.code)} lang={l.code}>
                {l.native_name}
              </button>
            ))}
          </div>
          {user ? (
            <button
              className="side-auth"
              onClick={async () => {
                await logout();
                router.push("/");
              }}
            >
              {t("side.logout")} <span className="arrow">↗</span>
            </button>
          ) : (
            <Link className="side-auth" href="/">{t("side.login")} <span className="arrow">↗</span></Link>
          )}
        </div>
      </aside>
    </>
  );
}
