import en from "@/locales/en.json";
import hi from "@/locales/hi.json";
import kn from "@/locales/kn.json";
import ta from "@/locales/ta.json";

type Dict = { [k: string]: string | Dict };
const LOCALES: Record<string, Dict> = { "en-IN": en, "hi-IN": hi, "kn-IN": kn, "ta-IN": ta };

export const DEMO_LANGS = ["en-IN", "hi-IN", "kn-IN", "ta-IN"];

export type Lang = { code: string; english_name: string; native_name: string; stt: boolean; tts: boolean };

export const FALLBACK_LANGS: Lang[] = [
  { code: "en-IN", english_name: "English", native_name: "English", stt: true, tts: true },
  { code: "hi-IN", english_name: "Hindi", native_name: "हिन्दी", stt: true, tts: true },
  { code: "kn-IN", english_name: "Kannada", native_name: "ಕನ್ನಡ", stt: true, tts: true },
  { code: "ta-IN", english_name: "Tamil", native_name: "தமிழ்", stt: true, tts: true },
];

function lookup(dict: Dict | undefined, key: string): string | undefined {
  let cur: string | Dict | undefined = dict;
  for (const part of key.split(".")) {
    if (cur == null || typeof cur === "string") return undefined;
    cur = cur[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

// UI copy exists for the demo languages; any other language falls back to English UI while answers come in that language.
export function translate(lang: string, key: string): string {
  return lookup(LOCALES[lang], key) ?? lookup(LOCALES["en-IN"], key) ?? key;
}

export function scriptClass(lang: string): string {
  return `script-${lang.split("-")[0]}`;
}
