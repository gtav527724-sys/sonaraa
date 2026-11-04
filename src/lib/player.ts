"use client";

import { create } from "zustand";
import { attachEq, resumeEqContext, setEqGains } from "./eq";
import { useSettings } from "./settings";
import { toast } from "./toast";
import type { Track } from "./types";

export type RepeatMode = "off" | "all" | "one";

/* ── dual elements enable real crossfade ───────────────────────────── */
let audioA: HTMLAudioElement | null = null;
let audioB: HTMLAudioElement | null = null;
let active: HTMLAudioElement | null = null;
let standby: HTMLAudioElement | null = null;
let xfadeTimer: ReturnType<typeof setInterval> | null = null;
let xfadeRunning = false;
let dataWarned = false;
let wakeLock: { release: () => Promise<void> } | null = null;

/* watchdog state — the core of "music never dies" */
const watch = {
  lastTime: 0,
  stuckTicks: 0,
  retries: new Map<number, number>(),
  reloading: false,
};

const SESSION_KEY = "sonara:session";

export function getActiveAudio(): HTMLAudioElement {
  return ensureAudio();
}

function effectiveVolume(): number {
  const v = usePlayer.getState().volume;
  const n = useSettings.getState().normalize;
  return Math.min(1, Math.max(0, v * (n ? 0.92 : 1)));
}

function applyRate(el: HTMLAudioElement) {
  el.playbackRate = useSettings.getState().speed || 1;
}

function ls(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveLs(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* noop */
  }
}

/* ── session persistence: resume exactly where you left off ───────── */

function persistSession() {
  const s = usePlayer.getState();
  if (!s.started || !s.queue.length) return;
  try {
    const payload = {
      queue: s.queue.slice(0, 80),
      index: s.index,
      position: s.currentTime,
      at: Date.now(),
    };
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* noop */
  }
}

export function restoreSession() {
  if (!useSettings.getState().resumePlayback) return;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const d = JSON.parse(raw) as {
      queue: Track[];
      index: number;
      position: number;
      at: number;
    };
    if (!d.queue?.length) return;
    usePlayer.setState({
      queue: d.queue,
      index: Math.min(d.index, d.queue.length - 1),
      started: true,
      isPlaying: false,
      currentTime: d.position || 0,
      duration: d.queue[d.index]?.durationSec ?? 0,
      pendingSeek: d.position || 0,
    });
    const el = ensureAudio();
    const t = d.queue[d.index];
    if (t) {
      el.src = t.audioUrl;
      el.dataset.trackId = String(t.id);
      el.preload = "auto";
    }
  } catch {
    /* noop */
  }
}

/* ── wake lock keeps the tab alive while playing ──────────────────── */

async function acquireWakeLock() {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    if (!nav.wakeLock || wakeLock) return;
    wakeLock = await nav.wakeLock.request("screen");
  } catch {
    /* unsupported */
  }
}

async function releaseWakeLock() {
  try {
    await wakeLock?.release();
  } catch {
    /* noop */
  }
  wakeLock = null;
}

/* ── crossfade / queue helpers ────────────────────────────────────── */

function stopPlaybackForSleep(message: string) {
  cancelCrossfade();
  active?.pause();
  usePlayer.getState()._sync({ isPlaying: false });
  usePlayer.getState().clearSleep();
  toast(message);
}

function checkSleepClock() {
  const st = usePlayer.getState();
  if (st.sleepAt && Date.now() >= st.sleepAt) {
    stopPlaybackForSleep("Sleep timer ended — good night");
  }
}

function nextIndexFor(state: PlayerState): number | null {
  const { queue, index, shuffle, repeat } = state;
  if (queue.length === 0) return null;
  if (repeat === "one") return index;
  if (queue.length === 1) return repeat === "all" ? 0 : null;
  if (shuffle) {
    let n: number;
    do {
      n = Math.floor(Math.random() * queue.length);
    } while (n === index);
    return n;
  }
  if (index + 1 < queue.length) return index + 1;
  return repeat === "all" ? 0 : null;
}

/** True only when the element's own media is genuinely near its end. */
function nearRealEnd(el: HTMLAudioElement, within: number) {
  const d = el.duration;
  if (!Number.isFinite(d) || d <= 1) return false;
  return d - el.currentTime <= within;
}

function startCrossfade() {
  const sec = useSettings.getState().crossfadeSec;
  const state = usePlayer.getState();
  const el = active;
  if (!el || xfadeRunning || sec <= 0 || !standby) return;
  if (state.repeat === "one") return;
  const ni = nextIndexFor(state);
  if (ni === null || ni === state.index) return;
  const next = state.queue[ni];
  if (!next) return;

  xfadeRunning = true;
  standby.src = next.audioUrl;
  standby.dataset.trackId = String(next.id);
  standby.volume = 0;
  applyRate(standby);
  standby.play().catch(() => cancelCrossfade());

  const uv = effectiveVolume();
  const t0 = performance.now();
  const dur = sec * 1000;
  xfadeTimer = setInterval(() => {
    const t = Math.min(1, (performance.now() - t0) / dur);
    if (active) active.volume = uv * (1 - t);
    if (standby) standby.volume = uv * t;
    if (t >= 1) finishCrossfade(ni, next);
  }, 60);
}

function finishCrossfade(nextIndex: number, track: Track) {
  if (xfadeTimer) clearInterval(xfadeTimer);
  xfadeTimer = null;
  const old = active;
  if (old) {
    old.pause();
    try {
      old.currentTime = 0;
    } catch {
      /* noop */
    }
  }
  active = standby;
  standby = old;
  xfadeRunning = false;
  watch.lastTime = 0;
  watch.stuckTicks = 0;
  usePlayer.getState()._sync({ index: nextIndex, currentTime: 0 });
  recordHistory(track);
}

function cancelCrossfade() {
  if (xfadeTimer) clearInterval(xfadeTimer);
  xfadeTimer = null;
  if (xfadeRunning && standby) {
    standby.pause();
    standby.removeAttribute("src");
    try {
      standby.load();
    } catch {
      /* noop */
    }
  }
  xfadeRunning = false;
  if (active) active.volume = effectiveVolume();
}

function maybeAutoCrossfade(el: HTMLAudioElement) {
  const sec = useSettings.getState().crossfadeSec;
  if (sec <= 0 || xfadeRunning) return;
  if (nearRealEnd(el, sec)) startCrossfade();
}

function maybePreloadNext(el: HTMLAudioElement) {
  if (!useSettings.getState().gapless || !standby || xfadeRunning) return;
  if (!nearRealEnd(el, 30)) return;
  const state = usePlayer.getState();
  const ni = nextIndexFor(state);
  if (ni === null || ni === state.index) return;
  const next = state.queue[ni];
  if (!next || standby.dataset.preloaded === String(next.id)) return;
  standby.dataset.preloaded = String(next.id);
  standby.dataset.trackId = String(next.id);
  standby.src = next.audioUrl;
}

async function autoplaySimilar() {
  const state = usePlayer.getState();
  const seed = state.queue[state.index];
  const genre = seed?.genre ?? "pop";
  try {
    const res = await fetch(`/api/audius?q=${encodeURIComponent(genre)}`);
    const d = (await res.json()) as { tracks?: Track[] };
    const fresh = (d.tracks ?? []).filter((t) => !state.queue.some((q) => q.id === t.id));
    if (fresh.length) {
      usePlayer.getState()._sync({ queue: [...state.queue, ...fresh] });
      toast(`Autoplay: more ${genre}`);
      usePlayer.getState().next(true);
      return;
    }
  } catch {
    /* noop */
  }
  usePlayer.getState()._sync({ isPlaying: false });
}

function handleEnded() {
  const st = usePlayer.getState();
  if (st.sleepEndOfTrack) {
    stopPlaybackForSleep("Sleep timer: stopped at end of track");
    return;
  }
  if (
    useSettings.getState().autoplaySimilar &&
    st.repeat !== "all" &&
    nextIndexFor(st) === null
  ) {
    autoplaySimilar();
    return;
  }
  st.next(true);
}

/* ── THE FIX: reload the SAME track at the SAME position ──────────── */

function softReload(reason: string) {
  const el = active;
  const st = usePlayer.getState();
  const track = st.current();
  if (!el || !track || watch.reloading) return;
  const tries = watch.retries.get(track.id) ?? 0;

  // After repeated failures try an alternate stream, then finally skip.
  if (tries >= 3) {
    findAlternateStream(track, el.currentTime || st.currentTime);
    return;
  }
  watch.retries.set(track.id, tries + 1);
  watch.reloading = true;

  const pos = el.currentTime || st.currentTime || 0;
  const wasPlaying = st.isPlaying;
  usePlayer.getState()._sync({ buffering: true });

  try {
    el.src = track.audioUrl;
    el.load();
    const onReady = () => {
      el.removeEventListener("loadedmetadata", onReady);
      try {
        if (pos > 0 && Number.isFinite(el.duration) && pos < el.duration - 1) {
          el.currentTime = pos;
        }
      } catch {
        /* noop */
      }
      if (wasPlaying) el.play().catch(() => {});
      watch.reloading = false;
      watch.stuckTicks = 0;
      usePlayer.getState()._sync({ buffering: false });
    };
    el.addEventListener("loadedmetadata", onReady);
    setTimeout(() => {
      watch.reloading = false;
    }, 9000);
  } catch {
    watch.reloading = false;
  }
  if (reason === "stall" && tries === 0) toast("Reconnecting…");
}

async function findAlternateStream(track: Track, pos: number) {
  watch.reloading = true;
  try {
    const q = `${track.title} ${track.artist}`;
    const res = await fetch(`/api/audius?q=${encodeURIComponent(q)}`);
    const d = (await res.json()) as { tracks?: Track[] };
    const match = d.tracks?.find((t) => t.audioUrl && t.audioUrl !== track.audioUrl);
    const el = active;
    if (match && el) {
      usePlayer.getState().replaceTrack(track.id, {
        ...track,
        audioUrl: match.audioUrl,
        audiusId: match.audiusId,
        durationSec: Math.max(match.durationSec, track.durationSec),
      });
      el.src = match.audioUrl;
      el.dataset.trackId = String(track.id);
      el.load();
      el.addEventListener(
        "loadedmetadata",
        () => {
          try {
            if (pos > 0 && pos < (el.duration || 0) - 1) el.currentTime = pos;
          } catch {
            /* noop */
          }
          el.play().catch(() => {});
        },
        { once: true },
      );
      watch.retries.set(track.id, 0);
      watch.reloading = false;
      return;
    }
  } catch {
    /* noop */
  }
  watch.reloading = false;
  usePlayer.getState().next(true); // genuinely unplayable → move on
}

/** Runs every second: detects frozen playback and heals it. */
function startWatchdog() {
  setInterval(() => {
    const st = usePlayer.getState();
    const el = active;
    if (!el || !st.isPlaying || xfadeRunning || watch.reloading) {
      watch.stuckTicks = 0;
      return;
    }
    if (el.paused) {
      // Browser paused us without a user action (background kill, focus loss)
      el.play().catch(() => {});
      return;
    }
    const t = el.currentTime;
    if (Math.abs(t - watch.lastTime) < 0.05) {
      watch.stuckTicks += 1;
      if (watch.stuckTicks === 4) usePlayer.getState()._sync({ buffering: true });
      if (watch.stuckTicks >= 9) {
        watch.stuckTicks = 0;
        softReload("stall");
      }
    } else {
      if (watch.stuckTicks > 0) usePlayer.getState()._sync({ buffering: false });
      watch.stuckTicks = 0;
      watch.retries.set(st.current()?.id ?? -1, 0);
    }
    watch.lastTime = t;
  }, 1000);

  // periodic session save
  setInterval(persistSession, 5000);
}

/* ── element wiring ───────────────────────────────────────────────── */

function attach(el: HTMLAudioElement) {
  el.preload = "auto";
  el.addEventListener("timeupdate", () => {
    if (el !== active) return;
    usePlayer.getState()._sync({ currentTime: el.currentTime });
    maybeAutoCrossfade(el);
    maybePreloadNext(el);
    checkSleepClock();
  });
  const onMeta = () => {
    if (el !== active) return;
    const d = el.duration;
    if (Number.isFinite(d) && d > 0) usePlayer.getState()._sync({ duration: d });
    const pending = usePlayer.getState().pendingSeek;
    if (pending && pending > 0 && pending < d - 1) {
      try {
        el.currentTime = pending;
      } catch {
        /* noop */
      }
      usePlayer.getState()._sync({ pendingSeek: 0 });
    }
  };
  el.addEventListener("loadedmetadata", onMeta);
  el.addEventListener("durationchange", onMeta);
  el.addEventListener("ended", () => {
    if (el !== active || xfadeRunning) return;
    // Guard: only treat as a real ending if we actually reached the end.
    const d = el.duration;
    if (Number.isFinite(d) && d > 2 && d - el.currentTime > 2.5) {
      softReload("early-end");
      return;
    }
    handleEnded();
  });
  el.addEventListener("play", () => {
    if (el === active) usePlayer.getState()._sync({ isPlaying: true });
  });
  el.addEventListener("pause", () => {
    if (el === active && !xfadeRunning) usePlayer.getState()._sync({ isPlaying: false });
  });
  el.addEventListener("waiting", () => {
    if (el === active) usePlayer.getState()._sync({ buffering: true });
  });
  const ready = () => {
    if (el === active) usePlayer.getState()._sync({ buffering: false });
  };
  el.addEventListener("playing", ready);
  el.addEventListener("canplay", ready);
  el.addEventListener("stalled", () => {
    if (el === active) softReload("stall");
  });
  el.addEventListener("error", () => {
    if (el === active) softReload("error");
  });
}

/** Safely attach EQ to a freshly-loaded element. Called before play. */
function maybeAttachEq(el: HTMLAudioElement) {
  const s = useSettings.getState();
  if (!s.eqEnabled) return;
  if (attachEq(el)) setEqGains(el, s.eqGains);
}

export function ensureAudio(): HTMLAudioElement {
  if (!audioA) {
    audioA = new Audio();
    audioB = new Audio();
    attach(audioA);
    attach(audioB);
    active = audioA;
    standby = audioB;
    active.volume = effectiveVolume();
    applyRate(active);
    startWatchdog();

    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        if (usePlayer.getState().isPlaying) softReload("stall");
      });
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
          resumeEqContext();
          const st = usePlayer.getState();
          if (st.isPlaying && active?.paused) active.play().catch(() => {});
        }
      });
    }
  }
  return active!;
}

/** Live-apply volume/rate/EQ prefs (called by the settings store). */
export function applyAudioPrefs() {
  const s = useSettings.getState();
  if (active && !xfadeRunning) {
    active.volume = effectiveVolume();
    applyRate(active);
  }
  if (standby) applyRate(standby);
  if (s.eqEnabled) {
    resumeEqContext();
    // Only attach to elements that aren't mid-playback (safe: chain builds once)
    for (const el of [audioA, audioB]) {
      if (!el || el === active && el.readyState >= 2 && !el.paused) continue;
      if (attachEq(el)) setEqGains(el, s.eqGains);
    }
    // Live-update gains on the currently playing chain (safe — no re-attach)
    if (active && active.readyState >= 2) setEqGains(active, s.eqGains);
  }
  if (s.keepAwake && usePlayer.getState().isPlaying) acquireWakeLock();
  else if (!s.keepAwake) releaseWakeLock();
}

function warnOnMobileData() {
  if (dataWarned || !useSettings.getState().dataWarn) return;
  const conn = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  if (conn && (conn.saveData || /2g|3g/.test(conn.effectiveType ?? ""))) {
    dataWarned = true;
    toast("Streaming on mobile data");
  }
}

function recordHistory(track: Track) {
  const post = (trackId: number) =>
    fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId }),
    })
      .then(() => import("./library").then((m) => m.useLibrary.getState().bump()))
      .catch(() => {});

  if (track.itunesId || track.audiusId || track.id < 0) {
    fetch("/api/sync-track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ track }),
    })
      .then((r) => r.json())
      .then((d: { track?: Track }) => {
        if (!d.track) return;
        usePlayer.getState().replaceTrack(track.id, d.track);
        post(d.track.id);
      })
      .catch(() => {});
    return;
  }
  post(track.id);
}

interface PlayerState {
  queue: Track[];
  index: number;
  isPlaying: boolean;
  started: boolean;
  isOpen: boolean;
  buffering: boolean;
  currentTime: number;
  duration: number;
  pendingSeek: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  sleepAt: number | null;
  sleepEndOfTrack: boolean;
  sleepLabel: string | null;

  current: () => Track | null;
  playQueue: (tracks: Track[], start?: number) => void;
  playTrack: (track: Track) => void;
  insertNext: (track: Track) => void;
  jumpTo: (index: number) => void;
  removeAt: (index: number) => void;
  moveInQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  replaceTrack: (oldId: number, nextTrack: Track) => void;
  toggle: () => void;
  next: (auto?: boolean) => void;
  prev: () => void;
  seek: (t: number) => void;
  nudge: (delta: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setOpen: (open: boolean) => void;
  setSleepTimer: (minutes: number | "track") => void;
  clearSleep: () => void;
  _sync: (patch: Partial<PlayerState>) => void;
  __recover: () => void;
}

function loadCurrent(get: () => PlayerState, autoplay: boolean) {
  const track = get().current();
  if (!track) return;
  const el = ensureAudio();
  if (el.dataset.trackId !== String(track.id)) {
    el.src = track.audioUrl;
    el.dataset.trackId = String(track.id);
  }
  el.volume = effectiveVolume();
  applyRate(el);
  maybeAttachEq(el);
  watch.lastTime = 0;
  watch.stuckTicks = 0;
  if (autoplay) {
    resumeEqContext();
    el.play().catch(() => {});
    if (useSettings.getState().keepAwake) acquireWakeLock();
  }
}

async function upgradeToFullLength(get: () => PlayerState) {
  const track = get().current();
  if (!track || track.source !== "itunes" || !track.itunesId) return;
  if (track.durationSec > 45) return;
  try {
    const q = `${track.title} ${track.artist}`;
    const res = await fetch(`/api/audius?q=${encodeURIComponent(q)}`);
    const d = (await res.json()) as { tracks?: Track[] };
    const match = d.tracks?.find((t) => t.audioUrl);
    if (!match) return;
    const el = ensureAudio();
    const pos = el.currentTime;
    const wasPlaying = get().isPlaying;
    get().replaceTrack(track.id, {
      ...track,
      audioUrl: match.audioUrl,
      audiusId: match.audiusId,
      durationSec: Math.max(match.durationSec, track.durationSec),
    });
    el.src = match.audioUrl;
    el.dataset.trackId = String(track.id);
    applyRate(el);
    if (wasPlaying) {
      try {
        el.currentTime = pos;
      } catch {
        /* noop */
      }
      el.play().catch(() => {});
    }
    toast("Playing full song");
  } catch {
    /* keep preview */
  }
}

function withFade(el: HTMLAudioElement, from: number, to: number, done?: () => void) {
  const uv = effectiveVolume();
  const start = performance.now();
  const D = 200;
  const step = () => {
    const t = Math.min(1, (performance.now() - start) / D);
    el.volume = uv * (from + (to - from) * t);
    if (t < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  index: 0,
  isPlaying: false,
  started: false,
  isOpen: false,
  buffering: false,
  currentTime: 0,
  duration: 0,
  pendingSeek: 0,
  volume: Number.parseFloat(ls("sonara:volume", "0.9")) || 0.9,
  shuffle: ls("sonara:shuffle", "false") === "true",
  repeat: (ls("sonara:repeat", "off") as RepeatMode) || "off",
  sleepAt: null,
  sleepEndOfTrack: false,
  sleepLabel: null,

  current: () => {
    const { queue, index } = get();
    return queue[index] ?? null;
  },

  playQueue: (tracks, start = 0) => {
    if (!tracks.length) return;
    cancelCrossfade();
    watch.retries.clear();
    set({ queue: tracks, index: start, isPlaying: true, started: true, currentTime: 0, pendingSeek: 0 });
    loadCurrent(get, true);
    recordHistory(tracks[start]);
    upgradeToFullLength(get);
    warnOnMobileData();
  },

  playTrack: (track) => {
    cancelCrossfade();
    watch.retries.clear();
    set({ queue: [track], index: 0, isPlaying: true, started: true, currentTime: 0, pendingSeek: 0 });
    loadCurrent(get, true);
    recordHistory(track);
    upgradeToFullLength(get);
    warnOnMobileData();
  },

  insertNext: (track) => {
    const { queue, index, started } = get();
    if (!started) {
      get().playTrack(track);
      return;
    }
    const next = [...queue];
    next.splice(index + 1, 0, track);
    set({ queue: next });
  },

  jumpTo: (i) => {
    const { queue } = get();
    if (i < 0 || i >= queue.length) return;
    cancelCrossfade();
    set({ index: i, isPlaying: true, currentTime: 0, pendingSeek: 0 });
    loadCurrent(get, true);
    const t = get().current();
    if (t) recordHistory(t);
    upgradeToFullLength(get);
  },

  removeAt: (i) => {
    const { queue, index } = get();
    if (i < 0 || i >= queue.length || queue.length === 1) return;
    const next = queue.filter((_, k) => k !== i);
    let ni = index;
    if (i < index) ni = index - 1;
    else if (i === index) ni = Math.min(index, next.length - 1);
    set({ queue: next, index: ni });
    if (i === index) loadCurrent(get, get().isPlaying);
  },

  moveInQueue: (from, to) => {
    const { queue, index } = get();
    if (from === to || from < 0 || to < 0 || from >= queue.length || to >= queue.length) return;
    const next = [...queue];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    let ni = index;
    if (from === index) ni = to;
    else if (from < index && to >= index) ni = index - 1;
    else if (from > index && to <= index) ni = index + 1;
    set({ queue: next, index: ni });
  },

  clearQueue: () => {
    const { queue, index } = get();
    const keep = queue[index];
    if (!keep) return;
    set({ queue: [keep], index: 0 });
    toast("Queue cleared");
  },

  replaceTrack: (oldId, nextTrack) => {
    if (active && active.dataset.trackId === String(oldId)) {
      active.dataset.trackId = String(nextTrack.id);
    }
    set({ queue: get().queue.map((t) => (t.id === oldId ? nextTrack : t)) });
  },

  toggle: () => {
    const { isPlaying, started, current } = get();
    const el = ensureAudio();
    if (!started) return;
    const fade = useSettings.getState().fadePlay && !xfadeRunning;
    if (isPlaying) {
      if (fade) withFade(el, 1, 0, () => el.pause());
      else el.pause();
      set({ isPlaying: false });
      releaseWakeLock();
    } else {
      cancelCrossfade();
      resumeEqContext();
      if (!el.src) loadCurrent(get, false);
      if (fade) el.volume = 0;
      el.play().catch(() => {});
      if (fade) withFade(el, 0, 1);
      set({ isPlaying: true, started: true });
      if (useSettings.getState().keepAwake) acquireWakeLock();
      const t = current();
      if (t) recordHistory(t);
    }
  },

  next: (auto = false) => {
    cancelCrossfade();
    const state = get();
    const { queue, index, repeat } = state;
    if (!queue.length) return;
    if (auto && repeat === "one") {
      get().seek(0);
      ensureAudio().play().catch(() => {});
      set({ isPlaying: true });
      return;
    }
    let ni = nextIndexFor(state);
    if (ni === null || ni === index) {
      if (!auto) ni = (index + 1) % queue.length;
      else {
        set({ isPlaying: false });
        return;
      }
    }
    set({ index: ni, isPlaying: true, currentTime: 0, pendingSeek: 0 });
    loadCurrent(get, true);
    const t = get().current();
    if (t) recordHistory(t);
    upgradeToFullLength(get);
  },

  prev: () => {
    cancelCrossfade();
    const { index, currentTime } = get();
    if (currentTime > 3 || index === 0) {
      get().seek(0);
      return;
    }
    set({ index: index - 1, isPlaying: true, currentTime: 0, pendingSeek: 0 });
    loadCurrent(get, true);
    const t = get().current();
    if (t) recordHistory(t);
  },

  seek: (t) => {
    const el = ensureAudio();
    cancelCrossfade();
    try {
      el.currentTime = t;
    } catch {
      /* noop */
    }
    set({ currentTime: t });
  },

  nudge: (delta) => {
    const el = ensureAudio();
    const d = el.duration || get().duration || 0;
    const target = Math.max(0, Math.min(d - 0.5, (el.currentTime || 0) + delta));
    get().seek(target);
  },

  setVolume: (v) => {
    const clamped = Math.min(1, Math.max(0, v));
    set({ volume: clamped });
    if (active && !xfadeRunning) active.volume = effectiveVolume();
    saveLs("sonara:volume", String(clamped));
  },

  toggleShuffle: () => {
    const s = !get().shuffle;
    set({ shuffle: s });
    saveLs("sonara:shuffle", String(s));
  },

  cycleRepeat: () => {
    const order: RepeatMode[] = ["off", "all", "one"];
    const next = order[(order.indexOf(get().repeat) + 1) % order.length];
    set({ repeat: next });
    saveLs("sonara:repeat", next);
  },

  setOpen: (open) => set({ isOpen: open }),

  setSleepTimer: (minutes) => {
    if (minutes === "track") {
      set({ sleepAt: null, sleepEndOfTrack: true, sleepLabel: "End of track" });
      toast("Sleep timer: stops at end of track");
      return;
    }
    set({
      sleepAt: Date.now() + minutes * 60000,
      sleepEndOfTrack: false,
      sleepLabel: `${minutes} min`,
    });
    toast(`Sleep timer set for ${minutes} min`);
  },

  clearSleep: () => set({ sleepAt: null, sleepEndOfTrack: false, sleepLabel: null }),

  _sync: (patch) => set(patch),

  __recover: () => softReload("error"),
}));
