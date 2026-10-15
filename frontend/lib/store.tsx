"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type MascotKind, type ResultCard, type UrgentPayload, type User } from "./api";
import { translate } from "./i18n";
import { installSound } from "./sound";

const HISTORY_KEY = "nola.history";
// Who was signed in on this device, so a return visit opens straight into the app. It is only a hint: the session
// itself is the httpOnly cookie, and /api/auth/me confirms it on every load. No email or health data is kept here.
const USER_KEY = "nola.user";
// The look Nola wears. Kept on the device too so she appears in the right shape before /me answers.
const MASCOT_KEY = "nola.mascot";
const KINDS: MascotKind[] = ["radish", "cat", "dog", "rabbit", "teddy", "frog"];

type Store = {
  /** undefined while the saved login is being checked, null when signed out. */
  user: User | null | undefined;
  signup: (name: string, handle: string, password: string) => Promise<User>;
  login: (handle: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  markOnboarded: () => void;
  mascot: MascotKind;
  /** Changes the look at once; saved to the account when it already has a profile. */
  setMascot: (k: MascotKind, opts?: { local?: boolean }) => void;
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

function cacheUser(u: User | null) {
  safeStorage(() => {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify({ id: u.id, name: u.name, onboarded: u.onboarded }));
    else localStorage.removeItem(USER_KEY);
  }, undefined);
}

// Keys from before the rename to Nola move over once, so a returning user keeps her sign-in hint and settings.
function migrateStorage() {
  safeStorage(() => {
    for (const k of ["user", "history", "sound"]) {
      const old = localStorage.getItem(`sakhi.${k}`);
      if (old !== null && localStorage.getItem(`nola.${k}`) === null) localStorage.setItem(`nola.${k}`, old);
      localStorage.removeItem(`sakhi.${k}`);
    }
  }, undefined);
}

function cachedUser(): User | null {
  return safeStorage(() => {
    const raw = JSON.parse(localStorage.getItem(USER_KEY) || "null");
    return raw && typeof raw.id === "string" && typeof raw.name === "string" ? { ...raw, handle: "", onboarded: !!raw.onboarded } : null;
  }, null);
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [lang, setLangState] = useState("en-IN");
  const [consented, setConsented] = useState(false);
  const [saveHistory, setSaveHistoryState] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [result, setResultState] = useState<ResultCard | null>(null);
  const [urgent, setUrgent] = useState<UrgentPayload | null>(null);
  const [mascot, setMascotState] = useState<MascotKind>("radish");
  const pending = useRef<Promise<string> | null>(null);

  useEffect(() => {
    document.documentElement.lang = lang.split("-")[0];
    document.documentElement.dataset.script = lang.split("-")[0];
  }, [lang]);

  useEffect(() => {
    migrateStorage();
    installSound();
    const saved = safeStorage(() => localStorage.getItem(MASCOT_KEY), null) as MascotKind | null;
    if (saved && KINDS.includes(saved)) setMascotState(saved);
    const cached = cachedUser();
    if (cached) setUser(cached);
    api
      .me()
      .then((r) => {
        setUser(r.user);
        cacheUser(r.user);
        if (r.user?.mascot) rememberMascot(r.user.mascot);
      })
      // Offline: keep the remembered user; any real request will still need the session cookie.
      .catch(() => setUser(cached));
  }, []);
  // Everyone with an account agreed to the health-information terms when they signed up.
  useEffect(() => {
    if (user) setConsented(true);
  }, [user]);

  const rememberMascot = (k: MascotKind) => {
    setMascotState(k);
    safeStorage(() => localStorage.setItem(MASCOT_KEY, k), undefined);
  };
  const setMascot = useCallback((k: MascotKind, { local = false } = {}) => {
    rememberMascot(k);
    if (!local) api.saveMascot(k).catch(() => undefined);
  }, []);

  const signup = useCallback(async (name: string, handle: string, password: string) => {
    const { user: u } = await api.signup(name, handle, password);
    setUser(u);
    cacheUser(u);
    return u;
  }, []);
  const login = useCallback(async (handle: string, password: string) => {
    const { user: u } = await api.login(handle, password);
    setUser(u);
    cacheUser(u);
    if (u.mascot) rememberMascot(u.mascot);
    return u;
  }, []);
  const markOnboarded = useCallback(() => {
    setUser((u) => {
      const next = u ? { ...u, onboarded: true } : u;
      cacheUser(next ?? null);
      return next;
    });
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
    cacheUser(null);
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
    cacheUser(null);
    safeStorage(() => sessionStorage.clear(), undefined);
    setSessionId(null);
    setResultState(null);
    setUrgent(null);
    // replace() so the Back button does not return here.
    window.location.replace("https://www.google.com/search?q=weather+today");
  }, [sessionId]);

  const value = useMemo<Store>(
    () => ({ user, signup, login, logout, markOnboarded, mascot, setMascot, lang, setLang, t, consented, setConsented, saveHistory, setSaveHistory, sessionId, ensureSession, result, setResult, urgent, setUrgent, resetConversation, quickExit }),
    [user, signup, login, logout, markOnboarded, mascot, setMascot, lang, setLang, t, consented, saveHistory, setSaveHistory, sessionId, ensureSession, result, setResult, urgent, resetConversation, quickExit],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

/** Sends signed-out visitors back to the start screen, and new accounts to the one-time questions first.
 * Returns the user once they may see the page. */
export function useRequireUser({ onboarding = false } = {}): User | null | undefined {
  const { user } = useStore();
  const router = useRouter();
  const misplaced = !!user && user.onboarded === onboarding;
  useEffect(() => {
    if (user === null) router.replace("/");
    else if (misplaced) router.replace(onboarding ? "/home" : "/welcome");
  }, [user, misplaced, onboarding, router]);
  return misplaced ? undefined : user;
}
