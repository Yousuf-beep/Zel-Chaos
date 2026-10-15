"use client";

import { api } from "./api";
import { b64ToUrl } from "./audio";

export type Speech = { done: Promise<void>; stop: () => void };

// Reads text aloud: Sarvam TTS through the backend, or the browser's own voice when that is unavailable.
// `done` settles when playback ends, is stopped, or fails; it never rejects.
export function speak(text: string, lang: string): Speech {
  let stopped = false;
  let audio: HTMLAudioElement | null = null;
  const urls: string[] = [];
  let finish: () => void = () => undefined;
  const done = new Promise<void>((resolve) => (finish = resolve));

  const cleanup = () => {
    urls.forEach(URL.revokeObjectURL);
    finish();
  };

  const browserVoice = () => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth || stopped) return cleanup();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang.replace("-Latn", "");
    u.onend = u.onerror = cleanup;
    synth.cancel();
    synth.speak(u);
  };

  api
    .tts(text, lang)
    .then((r) => {
      if (stopped) return cleanup();
      urls.push(...r.parts.map((p) => b64ToUrl(p, r.mime)));
      let i = 0;
      const next = () => {
        if (stopped || i >= urls.length) return cleanup();
        audio = new Audio(urls[i++]);
        audio.onended = next;
        audio.onerror = next;
        audio.play().catch(cleanup);
      };
      next();
    })
    .catch(browserVoice);

  return {
    done,
    stop() {
      stopped = true;
      audio?.pause();
      window.speechSynthesis?.cancel();
      cleanup();
    },
  };
}
