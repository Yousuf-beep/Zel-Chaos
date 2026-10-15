"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Mascot from "@/components/Mascot";
import QuickExit from "@/components/QuickExit";
import { api, ApiError, type CompanionReply, type Conversation, type CycleStatus } from "@/lib/api";
import { playSfx } from "@/lib/sound";
import { useStore } from "@/lib/store";
import ChatDrawer from "./ChatDrawer";
import Composer from "./Composer";
import CycleSheet from "./CycleSheet";
import Message, { toEntry, type Entry } from "./Message";
import ReportSheet from "./ReportSheet";
import VoiceMode from "./VoiceMode";
import { IconEdit, IconHome, IconMenu, IconMore, IconNew, IconReport, IconTrash } from "./icons";

const greetingKey = () => {
  const h = new Date().getHours();
  return h < 12 ? "chatui.morning" : h < 17 ? "chatui.afternoon" : "chatui.evening";
};

// Nola's chat, laid out like the Claude phone app: chats drawer on the left, the thread, and a composer that can
// dictate or switch into voice mode. Every chat is saved (encrypted) on the server and can become a doctor-visit report.
export default function ChatApp() {
  const { t, lang, user, logout } = useStore();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [voice, setVoice] = useState(false);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [cycleOpen, setCycleOpen] = useState(false);
  const [topMenu, setTopMenu] = useState(false);
  const [cycle, setCycle] = useState<CycleStatus | null | undefined>(undefined);
  const activeRef = useRef<string | null>(null);
  const thread = useRef(0); // bumps on every switch, so a late reply never lands in another chat
  const scroller = useRef<HTMLDivElement>(null);

  const select = (id: string | null) => {
    thread.current++;
    activeRef.current = id;
    setActiveId(id);
    setTopMenu(false);
  };

  const upsert = useCallback((c: Partial<Conversation> & { id: string }) => {
    setConversations((list) => {
      const prev = list?.find((x) => x.id === c.id);
      const next: Conversation = { title: "", created_at: Date.now() / 1000, updated_at: Date.now() / 1000, has_report: false, message_count: 0, ...prev, ...c };
      return [next, ...(list ?? []).filter((x) => x.id !== c.id)];
    });
  }, []);

  const openConversation = useCallback(async (id: string) => {
    select(id);
    setDrawer(false);
    setEntries([]);
    setNotice("");
    setLoadingThread(true);
    const token = thread.current;
    try {
      const r = await api.conversation(id);
      if (token !== thread.current) return;
      setEntries(r.messages.map(toEntry));
    } catch (e) {
      if (token !== thread.current) return;
      if (e instanceof ApiError && e.status === 404) {
        setConversations((l) => l?.filter((c) => c.id !== id) ?? l);
        select(null);
        setNotice(t("chatui.gone"));
      } else setNotice(t("companion.error"));
    } finally {
      if (token === thread.current) setLoadingThread(false);
    }
  }, [t]);

  useEffect(() => {
    api.conversations().then((r) => setConversations(r.conversations)).catch(() => setConversations([]));
    api.cycle().then((r) => setCycle(r.cycle)).catch(() => setCycle(null));
    const params = new URLSearchParams(window.location.search);
    const c = params.get("c");
    if (c) openConversation(c);
    if (params.get("voice") === "1") setVoice(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The open chat lives in the URL, so a refresh or the back button returns to it.
  useEffect(() => {
    window.history.replaceState(window.history.state, "", activeId ? `/chat?c=${encodeURIComponent(activeId)}` : "/chat");
  }, [activeId]);

  useEffect(() => {
    const el = scroller.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: entries.length > 2 ? "smooth" : "auto" });
  }, [entries.length, busy, loadingThread]);

  const send = async (text: string): Promise<CompanionReply | null> => {
    const token = thread.current;
    setEntries((e) => [...e, { role: "user", text, at: Date.now() / 1000 }]);
    setDraft("");
    setBusy(true);
    setNotice("");
    try {
      const r = await api.companionChat(text, lang, activeRef.current);
      if (token !== thread.current) return r;
      if (activeRef.current !== r.conversation_id) {
        activeRef.current = r.conversation_id;
        setActiveId(r.conversation_id);
      }
      setEntries((e) => [...e, { role: "assistant", reply: r.reply, suggestions: r.suggestions, question: r.question, alert: r.alert, lang: r.reply_lang, at: Date.now() / 1000 }]);
      const prev = conversations?.find((c) => c.id === r.conversation_id);
      upsert({ id: r.conversation_id, title: r.title, updated_at: Date.now() / 1000, message_count: (prev?.message_count ?? 0) + 2 });
      if (r.cycle) setCycle(r.cycle);
      playSfx("receive");
      return r;
    } catch (e) {
      if (token !== thread.current) return null;
      setEntries((list) => list.slice(0, -1));
      setDraft(text);
      if (e instanceof ApiError && e.status === 404) {
        setConversations((l) => l?.filter((c) => c.id !== activeRef.current) ?? l);
        select(null);
        setNotice(t("chatui.gone"));
      } else {
        setNotice(e instanceof ApiError && e.status < 500 && e.message ? e.message : t("companion.error"));
      }
      return null;
    } finally {
      if (token === thread.current) setBusy(false);
    }
  };

  const newChat = () => {
    select(null);
    setEntries([]);
    setDraft("");
    setNotice("");
    setDrawer(false);
  };

  const rename = async (c: Conversation) => {
    const title = window.prompt(t("chatui.renamePrompt"), c.title)?.trim();
    if (!title || title === c.title) return;
    await api.renameConversation(c.id, title.slice(0, 80)).catch(() => undefined);
    setConversations((l) => l?.map((x) => (x.id === c.id ? { ...x, title: title.slice(0, 80) } : x)) ?? l);
  };

  const remove = async (c: Conversation) => {
    if (!window.confirm(t("chatui.deleteConfirm"))) return;
    await api.deleteConversation(c.id).catch(() => undefined);
    setConversations((l) => l?.filter((x) => x.id !== c.id) ?? l);
    if (c.id === activeRef.current) newChat();
  };

  const clearAll = async () => {
    if (!window.confirm(t("chatui.clearConfirm"))) return;
    await api.clearConversations().catch(() => undefined);
    setConversations([]);
    newChat();
  };

  const forgetAll = async () => {
    if (!window.confirm(t("chatui.forgetConfirm"))) return;
    await api.forgetEverything().catch(() => undefined);
    setConversations([]);
    setCycle(null);
    newChat();
  };

  const openDrawer = () => {
    playSfx("slide");
    setDrawer(true);
    api.conversations().then((r) => setConversations(r.conversations)).catch(() => undefined);
  };

  const active = conversations?.find((c) => c.id === activeId);
  const userTurns = entries.filter((e) => e.role === "user").length;
  const firstName = user?.name.split(/\s+/)[0] ?? "";
  const empty = !activeId && entries.length === 0 && !loadingThread;

  // Rendered into <body>: the route template animates a transform, which would trap this full-screen layout
  // (and its fixed drawer, sheets and voice mode) inside a zero-height box.
  return createPortal(
    <div className="chat-app">
      <header className="chat-top">
        <div className="chat-top-actions">
          <button type="button" className="c2-icon" data-sfx="slide" onClick={openDrawer} aria-label={t("chatui.openChats")} aria-expanded={drawer}>
            <IconMenu />
          </button>
          <Link href="/home" className="c2-icon" aria-label={t("chatui.home")} title={t("chatui.home")}>
            <IconHome />
          </Link>
        </div>
        <h1 className="chat-title">{active?.title || (activeId ? "" : "Nola")}</h1>
        <div className="chat-top-actions">
          {activeId && (
            <div className="top-more">
              <button type="button" className="c2-icon" onClick={() => setTopMenu((v) => !v)} aria-expanded={topMenu} aria-label={t("chatui.more")}>
                <IconMore />
              </button>
              {topMenu && active && (
                <div className="menu" role="menu">
                  <button role="menuitem" type="button" onClick={() => (setTopMenu(false), setReportFor(active.id))}><IconReport /> {t("chatui.report")}</button>
                  <button role="menuitem" type="button" onClick={() => (setTopMenu(false), rename(active))}><IconEdit /> {t("chatui.rename")}</button>
                  <button role="menuitem" type="button" className="danger" onClick={() => (setTopMenu(false), remove(active))}><IconTrash /> {t("chatui.delete")}</button>
                </div>
              )}
            </div>
          )}
          <button type="button" className="c2-icon" onClick={newChat} aria-label={t("chatui.newChat")} title={t("chatui.newChat")}>
            <IconNew />
          </button>
          <QuickExit className="chat-exit" />
        </div>
      </header>

      <div className="chat-scroll" ref={scroller} onClick={() => setTopMenu(false)}>
        <div className="chat-inner">
          {empty ? (
            <div className="chat-empty">
              <Mascot size="sm" label={t("mascot.label")} />
              <h2 className="chat-greet">
                <span>{t(greetingKey())}{firstName && `, ${firstName}`}</span>
                <span>{t("chatui.ask")}</span>
              </h2>
              <div className="chat-starters">
                {["ex1", "ex2", "ex3"].map((k, i) => (
                  <button key={k} type="button" className="starter" data-sfx="send" style={{ "--i": i } as React.CSSProperties} onClick={() => (playSfx("send"), send(t(`companion.${k}`)))} disabled={busy}>
                    {t(`companion.${k}`)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="thread" aria-live="polite">
              {loadingThread && <div className="thread-loading" aria-hidden="true">{[60, 80, 45].map((w) => <div key={w} className="shimmer" style={{ width: `${w}%` }} />)}</div>}
              {entries.map((e, i) => <Message key={`${e.at}-${i}`} entry={e} isLast={i === entries.length - 1} />)}
              {busy && (
                <div className="msg-thinking" role="status">
                  <Mascot size="xs" mood="thinking" label="" />
                  <span className="shimmer-text">{t("companion.thinking")}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="chat-bottom">
        {activeId && userTurns >= 2 && !busy && (
          <button type="button" className="report-cta" onClick={() => setReportFor(activeId)}>
            <IconReport />
            <span>{t("chatui.reportCta")}</span>
            <b>{t("chatui.getReport")}</b>
          </button>
        )}
        {notice && <p className="notice chat-notice" role="alert">{notice}</p>}
        <Composer busy={busy} onSend={send} onVoice={() => setVoice(true)} onNotice={setNotice} draft={draft} setDraft={setDraft} />
        <p className="chat-foot">{t("chatui.footer")}</p>
      </div>

      <ChatDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        conversations={conversations}
        activeId={activeId}
        onSelect={openConversation}
        onNew={newChat}
        onRename={rename}
        onDelete={remove}
        onReport={(c) => (setDrawer(false), setReportFor(c.id))}
        cycle={cycle}
        onCycle={() => (setDrawer(false), setCycleOpen(true))}
        onClearAll={clearAll}
        onForgetAll={forgetAll}
        onLogout={async () => {
          await logout();
          router.push("/");
        }}
      />
      {voice && <VoiceMode onTurn={send} onClose={() => setVoice(false)} />}
      {reportFor && <ReportSheet conversationId={reportFor} onClose={() => setReportFor(null)} />}
      {cycleOpen && <CycleSheet cycle={cycle ?? null} onChange={setCycle} onClose={() => setCycleOpen(false)} />}
    </div>,
    document.body,
  );
}
