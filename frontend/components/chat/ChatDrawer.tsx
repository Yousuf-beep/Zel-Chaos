"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import SoundToggle from "@/components/SoundToggle";
import type { Conversation, CycleStatus } from "@/lib/api";
import { DEMO_LANGS, FALLBACK_LANGS } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { cycleLine } from "./CycleSheet";
import { IconClose, IconEdit, IconMore, IconNew, IconReport, IconSearch, IconTrash } from "./icons";

const DAY = 86_400_000;

function groupOf(ts: number): "today" | "yesterday" | "week" | "older" {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const ms = ts * 1000;
  if (ms >= start.getTime()) return "today";
  if (ms >= start.getTime() - DAY) return "yesterday";
  if (ms >= start.getTime() - 7 * DAY) return "week";
  return "older";
}

export default function ChatDrawer(props: {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[] | null;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (c: Conversation) => void;
  onDelete: (c: Conversation) => void;
  onReport: (c: Conversation) => void;
  cycle: CycleStatus | null | undefined;
  onCycle: () => void;
  onClearAll: () => void;
  onForgetAll: () => void;
  onLogout: () => void;
}) {
  const { open, onClose, conversations, activeId } = props;
  const { t, user, lang, setLang } = useStore();
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return setMenuFor(null);
    closeBtn.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (menuFor ? setMenuFor(null) : onClose());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, menuFor]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (conversations ?? []).filter((c) => !q || c.title.toLowerCase().includes(q));
    const out: { key: string; items: Conversation[] }[] = [];
    for (const c of list) {
      const key = groupOf(c.updated_at);
      const last = out[out.length - 1];
      if (last?.key === key) last.items.push(c);
      else out.push({ key, items: [c] });
    }
    return out;
  }, [conversations, query]);

  const act = (fn: (c: Conversation) => void, c: Conversation) => {
    setMenuFor(null);
    fn(c);
  };

  return (
    <>
      <div className="drawer-scrim" data-open={open} onClick={onClose} aria-hidden="true" />
      <aside className="drawer" data-open={open} aria-label={t("chatui.chats")} aria-hidden={!open} inert={!open}>
        <div className="drawer-top">
          <span className="logo">Nola<i aria-hidden="true" /></span>
          <button ref={closeBtn} type="button" className="c2-icon" onClick={onClose} aria-label={t("chatui.closeChats")}><IconClose /></button>
        </div>

        <button type="button" className="pill pill-accent drawer-new" onClick={props.onNew}>
          <IconNew /> {t("chatui.newChat")}
        </button>

        <label className="drawer-search">
          <IconSearch />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("chatui.search")} aria-label={t("chatui.search")} />
        </label>

        <button type="button" className="drawer-cycle" onClick={props.onCycle}>
          {props.cycle ? (
            <>
              <span className="dc-phase" data-phase={props.cycle.phase} aria-hidden="true" />
              <span>
                <b>{t("cycle.day").replace("{n}", String(props.cycle.cycle_day))} · {t("cycle.phase." + props.cycle.phase)}</b>
                <small>{cycleLine(t, props.cycle)}</small>
              </span>
            </>
          ) : (
            <>
              <span className="dc-phase" aria-hidden="true" />
              <span><b>{t("chatui.setUpCycle")}</b><small>{t("cycle.setupSub")}</small></span>
            </>
          )}
        </button>

        <nav className="drawer-list" aria-label={t("chatui.recents")}>
          {conversations === null ? (
            <div className="drawer-loading" aria-hidden="true">{[70, 52, 64].map((w) => <div key={w} className="shimmer" style={{ width: `${w}%` }} />)}</div>
          ) : groups.length === 0 ? (
            <p className="drawer-empty">{query ? t("chatui.noMatch") : t("chatui.noChats")}</p>
          ) : (
            groups.map((g) => (
              <div key={g.key} className="drawer-group">
                <p className="drawer-label">{t(`chatui.${g.key}`)}</p>
                <ul>
                  {g.items.map((c) => (
                    <li key={c.id} data-active={c.id === activeId} data-menu={menuFor === c.id}>
                      <button type="button" className="drawer-item" onClick={() => props.onSelect(c.id)} aria-current={c.id === activeId ? "page" : undefined}>
                        {c.title || t("chatui.newChat")}
                      </button>
                      <button type="button" className="drawer-more" onClick={() => setMenuFor(menuFor === c.id ? null : c.id)} aria-expanded={menuFor === c.id} aria-label={`${t("chatui.more")}: ${c.title}`}>
                        <IconMore />
                      </button>
                      {menuFor === c.id && (
                        <div className="menu" role="menu">
                          <button role="menuitem" type="button" onClick={() => act(props.onReport, c)}><IconReport /> {t("chatui.report")}</button>
                          <button role="menuitem" type="button" onClick={() => act(props.onRename, c)}><IconEdit /> {t("chatui.rename")}</button>
                          <button role="menuitem" type="button" className="danger" onClick={() => act(props.onDelete, c)}><IconTrash /> {t("chatui.delete")}</button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </nav>

        <div className="drawer-bottom">
          <div className="drawer-links">
            <Link href="/home">{t("chatui.home")}</Link>
            <Link href="/call">{t("chatui.symptomCheck")}</Link>
            <Link href="/learn">{t("chatui.learn")}</Link>
            <Link href="/consent">{t("chatui.privacy")}</Link>
          </div>
          <div className="drawer-langs" role="group" aria-label={t("chatui.language")}>
            {FALLBACK_LANGS.filter((l) => DEMO_LANGS.includes(l.code)).map((l) => (
              <button key={l.code} type="button" aria-pressed={lang === l.code} onClick={() => setLang(l.code)} lang={l.code}>{l.native_name}</button>
            ))}
          </div>
          <div className="drawer-row">
            <span>{t("chatui.soundLabel")}</span>
            <SoundToggle />
          </div>
          <div className="drawer-danger">
            <button type="button" onClick={props.onClearAll} disabled={!conversations?.length}>{t("chatui.clearAll")}</button>
            <button type="button" onClick={props.onForgetAll}>{t("chatui.forgetAll")}</button>
          </div>
          <div className="drawer-user">
            <span className="drawer-avatar" aria-hidden="true">{user?.name.trim()[0]?.toUpperCase()}</span>
            <span className="drawer-name">{user?.name}</span>
            <button type="button" className="text-link" onClick={props.onLogout}>{t("chatui.logout")}</button>
          </div>
        </div>
      </aside>
    </>
  );
}
