const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export type MascotKind = "radish" | "cat" | "dog" | "rabbit" | "teddy" | "frog";
export type User = { id: string; name: string; handle: string; onboarded: boolean; mascot?: MascotKind | null };

export type Chip = { name: string; verbatim: string };
export type Urgency = "emergency" | "see_doctor_soon" | "routine" | "self_monitor";

export type ResultCard = {
  urgency: Urgency;
  reflection: string;
  may_be_associated_with: { label: string; why: string }[];
  conditions_to_discuss: string[];
  evidence_map: { your_words: string; pattern: string }[];
  who_to_see: { specialist: string; why: string; low_cost_option: string }[];
  questions_to_ask: string[];
  tests_doctor_may_consider: string[];
  meanwhile: string[];
  seek_urgent_care_if: string[];
  learn_more: string | null;
  spoken_script: string;
  disclaimer: string;
  adolescent: boolean;
  language: string;
  used_safe_template: boolean;
};

export type UrgentPayload = {
  tier: "emergency" | "crisis";
  flags: string[];
  blocks: { kind: "emergency" | "crisis"; message: string; numbers: { label: string; number: string }[] }[];
  lang: string;
};

export type FollowupPayload = {
  question_key: string;
  kind: "single" | "multi" | "age_menarche";
  options: string[];
  step: number;
  max_steps: number;
};

export type ConfirmPayload = { chips: Chip[]; transcript: string };

export type Flow =
  | { type: "urgent"; payload: UrgentPayload }
  | { type: "confirm"; payload: ConfirmPayload }
  | { type: "followup"; payload: FollowupPayload }
  | { type: "result"; payload: ResultCard };

export type CardBody = {
  header: string;
  main_concerns: string[];
  symptom_timeline: { symptom: string; since: string; patient_words: string }[];
  cycle_notes: string;
  other_relevant: string[];
  questions_patient_wants_to_ask: string[];
  language_note: string;
};
export type DoctorCard = CardBody & {
  generated_on: string;
  age: number | null;
  years_since_menarche: number | null;
  language: string;
  localised: CardBody | null;
  qr_text: string;
};

export type CycleStatus = {
  last_period_start: string;
  period_starts: string[];
  cycle_length_setting: number;
  period_length: number;
  average_cycle_length: number;
  cycle_day: number;
  phase: "period" | "follicular" | "fertile_window" | "luteal" | "late";
  on_period: boolean;
  next_period_expected: string;
  days_until_next: number;
  days_late: number;
  cycles_logged: number;
  variation_days: number | null;
  notes: string[];
};
export type CycleSetup = { last_period_start: string; cycle_length: number; period_length: number };

export type CompanionAlert = {
  level: "none" | "soon" | "now" | "emergency" | "crisis";
  message: string;
  numbers: { label: string; number: string }[];
};
export type CompanionReply = {
  reply: string;
  suggestions: string[];
  question: string;
  sentiment: string;
  distress: number;
  alert: CompanionAlert;
  cycle: CycleStatus | null;
  safe_fallback: boolean;
  reply_lang: string;
  conversation_id: string;
  title: string;
};
export type CompanionMessage = {
  role: "user" | "assistant";
  text: string;
  at: number;
  reply?: string;
  suggestions?: string[];
  question?: string;
  alert?: CompanionAlert;
  reply_lang?: string;
};
export type Conversation = { id: string; title: string; created_at: number; updated_at: number; has_report: boolean; message_count: number };

export type Regularity = "regular" | "irregular" | "absent" | "not_started" | "unsure";
export type Profile = {
  age: number | null;
  regularity: Regularity | null;
  concerns: string[];
  conditions: string[];
  hormonal_meds: "yes" | "no" | "declined" | null;
  mascot?: MascotKind | null;
};

export type Report = {
  conversation_id: string;
  title: string;
  generated_at: number;
  summary: {
    summary: string;
    main_concerns: string[];
    symptoms: { symptom: string; since: string; her_words: string }[];
    feelings: string;
    questions_for_doctor: string[];
    summary_her_language: string;
  };
  suggestions_given: string[];
  doctor_flags: { level: string; message: string; at: number }[];
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    let msg = res.statusText;
    try {
      // FastAPI validation errors carry a list here; only plain messages are worth showing.
      const detail = (await res.json()).detail;
      if (typeof detail === "string") msg = detail;
    } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
// The login lives in an httpOnly cookie, so auth calls must carry credentials even when the API is on another origin.
const withCreds = (init: RequestInit = {}): RequestInit => ({ ...init, credentials: "include" });

export const api = {
  me: () => req<{ user: User | null }>("/api/auth/me", withCreds()),
  signup: (name: string, handle: string, password: string) => req<{ user: User }>("/api/auth/signup", withCreds(json({ name, handle, password }))),
  login: (handle: string, password: string) => req<{ user: User }>("/api/auth/login", withCreds(json({ handle, password }))),
  logout: () => fetch(`${BASE}/api/auth/logout`, withCreds({ method: "POST", keepalive: true })).catch(() => undefined),
  languages: () => req<{ languages: import("./i18n").Lang[] }>("/api/languages"),
  newSession: () => req<{ session_id: string }>("/api/session", { method: "POST" }),
  deleteSession: (id: string) => fetch(`${BASE}/api/session/${id}`, { method: "DELETE", keepalive: true }).catch(() => undefined),
  stt: (wav: Blob, lang: string) => {
    const fd = new FormData();
    const t = wav.type;
    const name = t.includes("wav") ? "speech.wav" : t.includes("mp4") || t.includes("aac") ? "speech.m4a" : t.includes("ogg") ? "speech.ogg" : "speech.webm";
    fd.append("file", wav, name);
    fd.append("lang", lang);
    fd.append("mode", "codemix");
    return req<{ transcript: string; lang: string }>("/api/stt", { method: "POST", body: fd });
  },
  analyze: (session_id: string, text: string, lang: string) => req<Flow>("/api/analyze", json({ session_id, text, lang })),
  confirm: (session_id: string, chips: Chip[]) => req<Flow>("/api/confirm", json({ session_id, chips })),
  answer: (session_id: string, question_key: string, answer: unknown) => req<Flow>("/api/answer", json({ session_id, question_key, answer })),
  tts: (text: string, lang: string) => req<{ audio_base64: string; parts: string[]; mime: string }>("/api/tts", json({ text, lang })),
  doctorCard: (session_id: string) => req<DoctorCard>("/api/doctor-card", json({ session_id })),
  profile: () => req<{ profile: Profile | null; onboarded: boolean }>("/api/profile", withCreds()),
  saveProfile: (profile: Profile, cycle: CycleSetup | null) =>
    req<{ profile: Profile; cycle: CycleStatus | null }>("/api/profile", withCreds({ ...json({ profile, cycle }), method: "PUT" })),
  cycle: () => req<{ cycle: CycleStatus | null }>("/api/cycle", withCreds()),
  setupCycle: (s: CycleSetup) => req<{ cycle: CycleStatus }>("/api/cycle", withCreds({ ...json(s), method: "PUT" })),
  logPeriod: (start_date: string) => req<{ cycle: CycleStatus }>("/api/cycle/period", withCreds(json({ start_date }))),
  removePeriod: (start_date: string) =>
    req<{ cycle: CycleStatus | null }>(`/api/cycle/period/${encodeURIComponent(start_date)}`, withCreds({ method: "DELETE" })),
  saveMascot: (mascot: MascotKind) => req<{ mascot: MascotKind }>("/api/profile/mascot", withCreds({ ...json({ mascot }), method: "PUT" })),
  companionChat: (text: string, lang: string, conversation_id: string | null) =>
    req<CompanionReply>("/api/companion/chat", withCreds(json({ text, lang, conversation_id }))),
  conversations: () => req<{ conversations: Conversation[] }>("/api/conversations", withCreds()),
  conversation: (id: string) =>
    req<{ conversation: Conversation; messages: CompanionMessage[] }>(`/api/conversations/${encodeURIComponent(id)}`, withCreds()),
  renameConversation: (id: string, title: string) =>
    req<{ ok: boolean }>(`/api/conversations/${encodeURIComponent(id)}`, withCreds({ ...json({ title }), method: "PATCH" })),
  deleteConversation: (id: string) => req<{ ok: boolean }>(`/api/conversations/${encodeURIComponent(id)}`, withCreds({ method: "DELETE" })),
  clearConversations: () => req<{ ok: boolean }>("/api/conversations", withCreds({ method: "DELETE" })),
  report: (id: string) => req<{ report: Report }>(`/api/conversations/${encodeURIComponent(id)}/report`, withCreds({ method: "POST" })),
  reportPdf: async (id: string) => {
    const res = await fetch(`${BASE}/api/conversations/${encodeURIComponent(id)}/report.pdf`, withCreds());
    if (!res.ok) throw new ApiError(res.status, res.statusText);
    const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "nola-report.pdf";
    return { blob: await res.blob(), name };
  },
  forgetEverything: () => req<{ ok: boolean }>("/api/account/data", withCreds({ method: "DELETE" })),
  myths: (lang: string) => req<{ myths: { id: string; myth: string; fact: string }[] }>(`/api/myths?lang=${encodeURIComponent(lang)}`),
};
