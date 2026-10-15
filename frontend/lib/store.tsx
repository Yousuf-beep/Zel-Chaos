"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type ResultCard, type UrgentPayload, type User } from "./api";
import { translate } from "./i18n";

const HISTORY_KEY = "sakhi.history";

type Store = {
  /** undefined while the saved login is being checked, null when signed out. */
  user: User | null | undefined;
  signup: (name: string, handle: string, password: string) => Promise<User>;
  login: (handle: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  lang: string;
  setLang: (l: string) => void;
  t: (key: string) => string;
  consented: boolean;
  setConsented: (v: boolean) => void;
  saveHistory: boolean;
  setSaveHistory: (v: boolean) => void;
  sessionId: string | null;
  ensureSession: () => Promise<string>;
  result: ResultCard | null;
  setResult: (r: ResultCard | null) => void;
  urgent: UrgentPayload | null;
  setUrgent: (u: UrgentPayload | null) => void;
  resetConversation: () => Promise<void>;
  quickExit: () => void;
};

const Ctx = createContext<Store | null>(null);

function safeStorage<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [lang, setLangState] = useState("en-IN");
  const [consented, setConsented] = useState(false);
  const [saveHistory, setSaveHistoryState] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [result, setResultState] = useState<ResultCard | null>(null);
  const [urgent, setUrgent] = useState<UrgentPayload | null>(null);
  const pending = useRef<Promise<string> | null>(null);

  useEffect(() => {
    document.documentElement.lang = lang.split("-")[0];
    document.documentElement.dataset.script = lang.split("-")[0];
  }, [lang]);

  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => setUser(null));
  }, []);
  // Everyone with an account agreed to the health-information terms when they signed up.
  useEffect(() => {
    if (user) setConsented(true);
  }, [user]);

  const signup = useCallback(async (name: string, handle: string, password: string) => {
    const { user: u } = await api.signup(name, handle, password);
    setUser(u);
    return u;
  }, []);
  const login = useCallback(async (handle: string, password: string) => {
    const { user: u } = await api.login(handle, password);
    setUser(u);
    return u;
  }, []);

  const setLang = useCallback((l: string) => setLangState(l), []);
  const t = useCallback((key: string) => translate(lang, key), [lang]);

  const ensureSession = useCallback(async () => {
    if (sessionId) return sessionId;
    pending.current ??= api.newSession().then((r) => r.session_id);
    const id = await pending.current;
    pending.current = null;
    setSessionId(id);
    return id;
  }, [sessionId]);

  const setSaveHistory = useCallback((v: boolean) => {
    setSaveHistoryState(v);
    if (!v) safeStorage(() => localStorage.removeItem(HISTORY_KEY), undefined);
  }, []);

  const setResult = useCallback(
    (r: ResultCard | null) => {
      setResultState(r);
      // On-device history only when the user opted in; it never leaves this browser.
      if (r && saveHistory) {
        safeStorage(() => {
          const prev = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
          localStorage.setItem(HISTORY_KEY, JSON.stringify([{ at: new Date().toISOString(), result: r }, ...prev].slice(0, 10)));
        }, undefined);
      }
    },
    [saveHistory],
  );

  const resetConversation = useCallback(async () => {
    if (sessionId) await api.deleteSession(sessionId);
    setSessionId(null);
    setResultState(null);
    setUrgent(null);
  }, [sessionId]);

  const logout = useCallback(async () => {
    if (sessionId) api.deleteSession(sessionId);
    await api.logout();
    setUser(null);
    setConsented(false);
    setSessionId(null);
    setResultState(null);
    setUrgent(null);
  }, [sessionId]);

  const quickExit = useCallback(() => {
    if (sessionId) api.deleteSession(sessionId);
    // Sign out too, so whoever picks up the phone next does not land in the account.
    api.logout();
    safeStorage(() => sessionStorage.clear(), undefined);
    setSessionId(null);
    setResultState(null);
    setUrgent(null);
    // replace() so the Back button does not return here.
    window.location.replace("https://www.google.com/search?q=weather+today");
  }, [sessionId]);

  const value = useMemo<Store>(
    () => ({ user, signup, login, logout, lang, setLang, t, consented, setConsented, saveHistory, setSaveHistory, sessionId, ensureSession, result, setResult, urgent, setUrgent, resetConversation, quickExit }),
    [user, signup, login, logout, lang, setLang, t, consented, saveHistory, setSaveHistory, sessionId, ensureSession, result, setResult, urgent, resetConversation, quickExit],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

/** Sends signed-out visitors back to the start screen. Returns the user once known. */
export function useRequireUser(): User | null | undefined {
  const { user } = useStore();
  const router = useRouter();
  useEffect(() => {
    if (user === null) router.replace("/");
  }, [user, router]);
  return user;
}
