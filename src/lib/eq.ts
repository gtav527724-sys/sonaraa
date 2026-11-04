"use client";

/** 5-band Web Audio equalizer + bass boost. */

export const EQ_BANDS = [60, 250, 1000, 4000, 12000];

export type EqPresetName =
  | "Flat"
  | "Bass Boost"
  | "Vocal"
  | "Treble"
  | "Rock"
  | "Electronic"
  | "Podcast";

export const EQ_PRESETS: Record<EqPresetName, number[]> = {
  Flat: [0, 0, 0, 0, 0],
  "Bass Boost": [9, 5, 0, -1, 1],
  Vocal: [-3, 0, 5, 4, 1],
  Treble: [-2, -1, 0, 5, 8],
  Rock: [5, 2, -1, 3, 5],
  Electronic: [7, 2, -2, 3, 6],
  Podcast: [-6, -2, 6, 5, 0],
};

interface Chain {
  ctx: AudioContext;
  filters: BiquadFilterNode[];
  preamp: GainNode;
}

const chains = new WeakMap<HTMLAudioElement, Chain>();
let sharedCtx: AudioContext | null = null;
let failed = false;

function getCtx(): AudioContext | null {
  if (failed) return null;
  try {
    if (!sharedCtx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      sharedCtx = new AC();
    }
    if (sharedCtx.state === "suspended") sharedCtx.resume().catch(() => {});
    return sharedCtx;
  } catch {
    failed = true;
    return null;
  }
}

/** Build (once) the filter chain for an element. Must be called BEFORE play. */
export function attachEq(el: HTMLAudioElement): boolean {
  if (chains.has(el)) return true;
  const ctx = getCtx();
  if (!ctx) return false;
  try {
    const src = ctx.createMediaElementSource(el);
    const preamp = ctx.createGain();
    preamp.gain.value = 1;
    const filters = EQ_BANDS.map((freq, i) => {
      const f = ctx.createBiquadFilter();
      f.type = i === 0 ? "lowshelf" : i === EQ_BANDS.length - 1 ? "highshelf" : "peaking";
      f.frequency.value = freq;
      f.Q.value = 1;
      f.gain.value = 0;
      return f;
    });
    let node: AudioNode = src;
    for (const f of filters) {
      node.connect(f);
      node = f;
    }
    node.connect(preamp);
    preamp.connect(ctx.destination);
    chains.set(el, { ctx, filters, preamp });
    return true;
  } catch {
    failed = true;
    return false;
  }
}

export function setEqGains(el: HTMLAudioElement, gains: number[]) {
  const chain = chains.get(el);
  if (!chain) return;
  chain.filters.forEach((f, i) => {
    const g = gains[i] ?? 0;
    try {
      f.gain.setTargetAtTime(g, chain.ctx.currentTime, 0.05);
    } catch {
      f.gain.value = g;
    }
  });
  const peak = Math.max(0, ...gains);
  const comp = peak > 0 ? 1 / (1 + peak / 22) : 1;
  try {
    chain.preamp.gain.setTargetAtTime(comp, chain.ctx.currentTime, 0.08);
  } catch {
    chain.preamp.gain.value = comp;
  }
}

export function resumeEqContext() {
  if (sharedCtx && sharedCtx.state === "suspended") sharedCtx.resume().catch(() => {});
}

export function eqUnavailable() {
  return failed;
}
