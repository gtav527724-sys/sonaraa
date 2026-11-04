"use client";

import { create } from "zustand";

export interface AccentDef {
  name: string;
  value: string;
}

export const ACCENTS: AccentDef[] = [
  { name: "Lime", value: "#c6ff3f" },
  { name: "Violet", value: "#a78bfa" },
  { name: "Cyan", value: "#22d3ee" },
  { name: "Pink", value: "#f472b6" },
  { name: "Orange", value: "#fb923c" },
  { name: "Gold", value: "#facc15" },
];

const KEY = "sonara:settings";

interface SettingsState {
  // audio
  crossfadeSec: number; // 0 = off
  gapless: boolean;
  fadePlay: boolean;
  autoplaySimilar: boolean;
  normalize: boolean; // balances loudness between songs
  speed: number;
  dataWarn: boolean;
  resumePlayback: boolean;
  keepAwake: boolean;
  eqEnabled: boolean;
  eqPreset: string;
  eqGains: number[];
  // appearance & feel
  accent: string;
  amoled: boolean;
  reduceMotion: boolean;
  perfMode: boolean;
  haptics: boolean;
  // meta
  hydrated: boolean;
  patch: (p: Partial<Omit<SettingsState, "patch" | "hydrate" | "hydrated">>) => void;
  hydrate: () => void;
}

const DEFAULTS = {
  crossfadeSec: 0,
  gapless: true,
  fadePlay: true,
  autoplaySimilar: true,
  normalize: true,
  speed: 1,
  dataWarn: true,
  resumePlayback: true,
  keepAwake: true,
  eqEnabled: false,
  eqPreset: "Flat",
  eqGains: [0, 0, 0, 0, 0],
  accent: "#c6ff3f",
  amoled: false,
  reduceMotion: false,
  perfMode: false,
  haptics: true,
};

function applySideEffects(s: SettingsState) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--acc", s.accent);
  root.classList.toggle("amoled", s.amoled);
  root.classList.toggle("rm", s.reduceMotion);
  root.classList.toggle("perf", s.perfMode);
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,

  patch: (p) => {
    set(p);
    const s = get();
    applySideEffects(s);
    try {
      const { patch: _p, hydrate: _h, hydrated: _d, ...persist } = s;
      window.localStorage.setItem(KEY, JSON.stringify(persist));
    } catch {
      /* noop */
    }
    // live-apply playback prefs
    import("./player").then((m) => m.applyAudioPrefs());
  },

  hydrate: () => {
    if (get().hydrated) return;
    let stored: Partial<typeof DEFAULTS> = {};
    try {
      stored = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
    } catch {
      /* noop */
    }
    set({ ...DEFAULTS, ...stored, hydrated: true });
    applySideEffects(get());
  },
}));
