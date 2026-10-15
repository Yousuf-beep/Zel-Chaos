"use client";

import { useSyncExternalStore } from "react";

// UI sound, after the ZEL site: off by default, nothing downloads until it is first switched on, every button and link
// taps, and a few moments get their own sound. Web Audio (not cloned <audio> elements) so sounds that follow a network
// reply, like a message arriving, still play on iOS once the context has been unlocked by a tap.
// Safari before iOS 18.4 cannot play Ogg Vorbis, so it gets the AAC copies.
// A few tiny sounds (the thought bubble, typing, exercise cues) are synthesised instead of shipped as files.

type FileSfx = "tap" | "send" | "receive" | "slide" | "toggle" | "voice" | "ready";
type SynthSfx = "pop" | "type" | "tick" | "chime" | "fill";
export type Sfx = FileSfx | SynthSfx;
// The Kenney tap is a 10 ms click, so it needs more gain than the longer sounds to be heard at all.
const VOLUME: Record<FileSfx, number> = { tap: 0.5, send: 0.32, receive: 0.4, slide: 0.22, toggle: 0.35, voice: 0.4, ready: 0.28 };

// [start Hz, end Hz, seconds, peak gain, wave]; several notes play one after another.
type Note = [number, number, number, number, OscillatorType];
const SYNTH: Record<SynthSfx, Note[]> = {
  pop: [[380, 920, 0.09, 0.22, "sine"]],
  type: [[1900, 1500, 0.025, 0.035, "triangle"]],
  tick: [[1250, 1250, 0.05, 0.08, "sine"]],
  fill: [[520, 780, 0.12, 0.14, "sine"]],
  chime: [[784, 784, 0.16, 0.14, "sine"], [988, 988, 0.16, 0.14, "sine"], [1319, 1319, 0.4, 0.14, "sine"]],
};
const KEY = "nola.sound";

let enabled = false;
let ctx: AudioContext | null = null;
const buffers = new Map<Sfx, Promise<AudioBuffer | null>>();
const listeners = new Set<() => void>();
let installed = false;

const ext = () => (new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? "ogg" : "m4a");

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  ctx = Ctx ? new Ctx() : null;
  return ctx;
}

function load(name: FileSfx): Promise<AudioBuffer | null> {
  let p = buffers.get(name);
  if (!p) {
    const c = context();
    p = c
      ? fetch(`/sfx/${name}.${ext()}`)
          .then((r) => r.arrayBuffer())
          .then((b) => c.decodeAudioData(b))
          .catch(() => null)
      : Promise.resolve(null);
    buffers.set(name, p);
  }
  return p;
}

function emit() {
  listeners.forEach((l) => l());
}

function synth(c: AudioContext, notes: Note[]) {
  let at = c.currentTime + 0.005;
  for (const [f0, f1, dur, peak, wave] of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(f0, at);
    osc.frequency.exponentialRampToValueAtTime(f1, at + dur);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.012, dur / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);
    at += dur * 0.7;
  }
}

export function playSfx(name: Sfx) {
  if (!enabled || document.hidden) return;
  const c = context();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => undefined);
  if (name in SYNTH) return synth(c, SYNTH[name as SynthSfx]);
  load(name as FileSfx).then((buf) => {
    if (!buf || !enabled) return;
    const src = c.createBufferSource();
    const gain = c.createGain();
    gain.gain.value = VOLUME[name as FileSfx];
    src.buffer = buf;
    src.connect(gain).connect(c.destination);
    src.start();
  });
}

export function setSound(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  if (on) {
    context()?.resume().catch(() => undefined);
    (Object.keys(VOLUME) as FileSfx[]).forEach(load);
    playSfx("toggle");
  }
  emit();
}

/** Restores the saved choice and taps on every button and link. Call once on the client. */
export function installSound() {
  if (installed) return;
  installed = true;
  try {
    enabled = localStorage.getItem(KEY) === "on";
  } catch {}
  // The context can only start inside a user gesture; the first tap after a reload unlocks it, and the files load
  // then so that tap already has its sound.
  const unlock = () => {
    if (!enabled) return;
    context()?.resume().catch(() => undefined);
    (Object.keys(VOLUME) as FileSfx[]).forEach(load);
  };
  document.addEventListener("pointerdown", unlock, { passive: true });
  document.addEventListener("keydown", unlock, { passive: true });
  document.addEventListener("click", (e) => {
    const hit = (e.target as Element | null)?.closest?.("a, button, summary, [role='tab'], [role='radio']");
    if (hit && !hit.closest("[data-sfx]")) playSfx("tap");
  });
  emit();
}

export function useSoundOn(): boolean {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => enabled,
    () => false,
  );
}
