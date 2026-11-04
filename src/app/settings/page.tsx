"use client";

import { motion } from "framer-motion";
import {
  Activity,
  AlarmClock,
  ChevronLeft,
  Database,
  Gauge,
  History,
  Info,
  Moon,
  Music2,
  Palette,
  Radio,
  SlidersHorizontal,
  SlidersVertical,
  BatteryCharging,
  PlayCircle,
  Smartphone,
  Sparkles,
  Timer,
  Trash2,
  Vibrate,
  Volume2,
  Wifi,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import SleepSheet from "@/components/SleepSheet";
import EqualizerSheet from "@/components/EqualizerSheet";
import { apiDelete, apiGet } from "@/lib/api";
import { useLibrary } from "@/lib/library";
import { ACCENTS, useSettings } from "@/lib/settings";
import { toast } from "@/lib/toast";
import { cn, vibrate } from "@/lib/utils";

/* ── building blocks ─────────────────────────────────────────────── */

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", damping: 24, stiffness: 240 }}
      className="mt-7"
    >
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-[color:var(--acc)]">{icon}</span>
        <h2 className="text-[11px] font-extrabold tracking-[0.24em] text-white/45">{title}</h2>
      </div>
      <div className="glass sheen overflow-hidden rounded-[24px]">{children}</div>
    </motion.section>
  );
}

function ToggleRow({
  icon,
  title,
  sub,
  value,
  onChange,
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => {
        vibrate(8);
        onChange(!value);
      }}
      className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition active:bg-white/[0.04]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/70">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-white/90">{title}</span>
        {sub && <span className="mt-0.5 block text-[11.5px] leading-snug text-white/40">{sub}</span>}
      </span>
      <span
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200",
          value ? "bg-[color:var(--acc)]" : "bg-white/[0.12]",
        )}
      >
        <motion.span
          animate={{ x: value ? 22 : 3, scale: value ? 1 : 0.86 }}
          transition={{ type: "spring", damping: 22, stiffness: 500 }}
          className={cn(
            "absolute top-[3px] h-[22px] w-[22px] rounded-full shadow-md",
            value ? "bg-black" : "bg-white/80",
          )}
        />
      </span>
    </button>
  );
}

function RowShell({ children }: { children: ReactNode }) {
  return <div className="px-4 py-3.5">{children}</div>;
}

function RowIcon({ icon, title, sub }: { icon: ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/70">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-white/90">{title}</span>
        {sub && <span className="mt-0.5 block text-[11.5px] text-white/40">{sub}</span>}
      </span>
    </div>
  );
}

const Divider = () => <div className="mx-4 h-px bg-white/[0.06]" />;

/* ── page ─────────────────────────────────────────────────────────── */

export default function SettingsPage() {
  const router = useRouter();
  const s = useSettings();
  const bump = useLibrary((st) => st.bump);
  const version = useLibrary((st) => st.version);

  const [sleepOpen, setSleepOpen] = useState(false);
  const [eqOpen, setEqOpen] = useState(false);
  const [storage, setStorage] = useState<{ used: string; quota: string } | null>(null);
  const [stats, setStats] = useState<{ tracks: number; albums: number; playlists: number; liked: number; plays: number } | null>(null);
  const [onCell, setOnCell] = useState(false);

  useEffect(() => {
    apiGet<typeof stats & object>("/api/stats").then(setStats).catch(() => {});
  }, [version]);

  useEffect(() => {
    const nav = navigator as Navigator & {
      storage?: { estimate?: () => Promise<{ usage?: number; quota?: number }> };
      connection?: { effectiveType?: string; saveData?: boolean };
    };
    nav.storage?.estimate?.().then((e) => {
      const fmt = (b?: number) => (b ? `${(b / 1048576).toFixed(1)} MB` : "—");
      setStorage({ used: fmt(e.usage), quota: fmt(e.quota) });
    });
    const c = nav.connection;
    setOnCell(Boolean(c && (c.saveData || /2g|3g|4g/.test(c.effectiveType ?? ""))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sleepLabel = usePlayerSleepLabel();

  return (
    <div className="px-5 pb-44 pt-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="glass-soft flex h-10 w-10 items-center justify-center rounded-full text-white/85"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="font-display text-[22px] font-bold tracking-tight">Settings</h1>
          <p className="text-[11.5px] text-white/40">Everything is saved on this device</p>
        </div>
      </div>

      {/* ── PLAYBACK ── */}
      <Section icon={<SlidersHorizontal className="h-4 w-4" />} title="PLAYBACK">
        <RowShell>
          <RowIcon
            icon={<Zap className="h-[18px] w-[18px]" />}
            title="Crossfade"
            sub={s.crossfadeSec === 0 ? "Off — songs switch instantly" : `${s.crossfadeSec}s smooth blend between songs`}
          />
          <input
            type="range"
            min={0}
            max={12}
            step={1}
            value={s.crossfadeSec}
            aria-label="Crossfade seconds"
            onChange={(e) => s.patch({ crossfadeSec: Number(e.target.value) })}
            className="slider mt-3 w-full"
            style={{ "--pct": `${(s.crossfadeSec / 12) * 100}%` } as React.CSSProperties}
          />
          <div className="mt-0.5 flex justify-between text-[10px] font-semibold text-white/30">
            <span>OFF</span>
            <span>12s</span>
          </div>
        </RowShell>
        <Divider />
        <ToggleRow
          icon={<Music2 className="h-[18px] w-[18px]" />}
          title="Gapless playback"
          sub="Preloads the next song so transitions are seamless"
          value={s.gapless}
          onChange={(v) => s.patch({ gapless: v })}
        />
        <Divider />
        <ToggleRow
          icon={<Volume2 className="h-[18px] w-[18px]" />}
          title="Smooth play / pause"
          sub="Short volume fade when you press play or pause"
          value={s.fadePlay}
          onChange={(v) => s.patch({ fadePlay: v })}
        />
        <Divider />
        <ToggleRow
          icon={<Sparkles className="h-[18px] w-[18px]" />}
          title="Autoplay similar music"
          sub="When your queue ends, keep going with songs in the same genre"
          value={s.autoplaySimilar}
          onChange={(v) => s.patch({ autoplaySimilar: v })}
        />
        <Divider />
        <ToggleRow
          icon={<PlayCircle className="h-[18px] w-[18px]" />}
          title="Resume where you left off"
          sub="App dobara kholne par wahi gaana usi jagah se"
          value={s.resumePlayback}
          onChange={(v) => s.patch({ resumePlayback: v })}
        />
        <Divider />
        <ToggleRow
          icon={<BatteryCharging className="h-[18px] w-[18px]" />}
          title="Keep playing in background"
          sub="Screen band hone par bhi music chalta rahe (wake lock)"
          value={s.keepAwake}
          onChange={(v) => s.patch({ keepAwake: v })}
        />
        <Divider />
        <button
          onClick={() => setSleepOpen(true)}
          className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition active:bg-white/[0.04]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/70">
            <AlarmClock className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-white/90">Sleep timer</span>
            <span className="mt-0.5 block text-[11.5px] text-white/40">Tap to set — pauses music automatically</span>
          </span>
          <span className={cn("text-[12px] font-bold", sleepLabel ? "text-[color:var(--acc)]" : "text-white/35")}>
            {sleepLabel ?? "Off"}
          </span>
        </button>
      </Section>

      {/* ── SOUND ── */}
      <Section icon={<Gauge className="h-4 w-4" />} title="SOUND">
        <RowShell>
          <RowIcon
            icon={<Timer className="h-[18px] w-[18px]" />}
            title="Playback speed"
            sub="Works on every song, instantly"
          />
          <div className="mt-3 flex gap-2">
            {[0.75, 1, 1.25, 1.5, 2].map((sp) => (
              <button
                key={sp}
                onClick={() => {
                  vibrate(8);
                  s.patch({ speed: sp });
                }}
                className={cn(
                  "flex-1 rounded-full py-2 text-[12px] font-bold transition active:scale-95",
                  s.speed === sp
                    ? "bg-[color:var(--acc)] text-black"
                    : "bg-white/[0.07] text-white/60",
                )}
              >
                {sp}×
              </button>
            ))}
          </div>
        </RowShell>
        <Divider />
        <button
          onClick={() => setEqOpen(true)}
          className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition active:bg-white/[0.04]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/70">
            <SlidersVertical className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-white/90">Equalizer & Bass Boost</span>
            <span className="mt-0.5 block text-[11.5px] text-white/40">
              5-band real-time audio — 7 presets
            </span>
          </span>
          <span className={cn("text-[12px] font-bold", s.eqEnabled ? "text-[color:var(--acc)]" : "text-white/35")}>
            {s.eqEnabled ? s.eqPreset : "Off"}
          </span>
        </button>
        <Divider />
        <ToggleRow
          icon={<Activity className="h-[18px] w-[18px]" />}
          title="Normalize volume"
          sub="Balances loudness between different songs and sources"
          value={s.normalize}
          onChange={(v) => s.patch({ normalize: v })}
        />
        <Divider />
        <ToggleRow
          icon={<Wifi className="h-[18px] w-[18px]" />}
          title="Mobile data warning"
          sub={onCell ? "You're on mobile data — you'll get a heads-up before streaming" : "Warns before streaming without Wi-Fi"}
          value={s.dataWarn}
          onChange={(v) => s.patch({ dataWarn: v })}
        />
      </Section>

      {/* ── APPEARANCE ── */}
      <Section icon={<Palette className="h-4 w-4" />} title="LOOK & FEEL">
        <RowShell>
          <RowIcon
            icon={<Palette className="h-[18px] w-[18px]" />}
            title="Accent color"
            sub="Recolors the whole app instantly"
          />
          <div className="mt-3.5 flex justify-between px-1">
            {ACCENTS.map((a) => (
              <motion.button
                key={a.value}
                whileTap={{ scale: 0.85 }}
                onClick={() => {
                  vibrate(10);
                  s.patch({ accent: a.value });
                }}
                aria-label={a.name}
                className="relative h-10 w-10 rounded-full"
                style={{ background: a.value }}
              >
                {s.accent === a.value && (
                  <motion.span
                    layoutId="accent-ring"
                    className="absolute -inset-1.5 rounded-full border-2"
                    style={{ borderColor: a.value }}
                    transition={{ type: "spring", damping: 22, stiffness: 400 }}
                  />
                )}
                {s.accent === a.value && <Sparkles className="mx-auto h-4 w-4 text-black/70" strokeWidth={2.6} />}
              </motion.button>
            ))}
          </div>
        </RowShell>
        <Divider />
        <ToggleRow
          icon={<Moon className="h-[18px] w-[18px]" />}
          title="AMOLED pure black"
          sub="True #000000 background — saves battery on OLED screens"
          value={s.amoled}
          onChange={(v) => s.patch({ amoled: v })}
        />
        <Divider />
        <ToggleRow
          icon={<Sparkles className="h-[18px] w-[18px]" />}
          title="Reduce motion"
          sub="Calms ambient animations and marquees"
          value={s.reduceMotion}
          onChange={(v) => s.patch({ reduceMotion: v })}
        />
        <Divider />
        <ToggleRow
          icon={<Gauge className="h-[18px] w-[18px]" />}
          title="Performance mode"
          sub="Turns off heavy blur effects — smoothest on budget phones"
          value={s.perfMode}
          onChange={(v) => s.patch({ perfMode: v })}
        />
        <Divider />
        <ToggleRow
          icon={<Vibrate className="h-[18px] w-[18px]" />}
          title="Haptic feedback"
          sub="Vibration taps on buttons and gestures"
          value={s.haptics}
          onChange={(v) => s.patch({ haptics: v })}
        />
      </Section>

      {/* ── STORAGE & DATA ── */}
      <Section icon={<Database className="h-4 w-4" />} title="STORAGE & DATA">
        <div className="px-4 py-3.5">
          <RowIcon
            icon={<Smartphone className="h-[18px] w-[18px]" />}
            title="Device storage used"
            sub={storage ? `${storage.used} used of ${storage.quota} available` : "Calculating…"}
          />
        </div>
        <Divider />
        <button
          onClick={() => {
            vibrate(8);
            apiDelete("/api/history?all=1")
              .then(() => {
                bump();
                toast("Play history cleared");
              })
              .catch(() => toast("Couldn't clear history"));
          }}
          className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition active:bg-white/[0.04]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/70">
            <History className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-white/90">Clear play history</span>
            <span className="mt-0.5 block text-[11.5px] text-white/40">
              {stats ? `${stats.plays} entries recorded` : "Resets “Jump back in”"}
            </span>
          </span>
          <Trash2 className="h-4 w-4 text-white/30" />
        </button>
        <Divider />
        <button
          onClick={() => {
            vibrate(8);
            apiDelete("/api/searches?all=1")
              .then(() => toast("Search history cleared"))
              .catch(() => toast("Couldn't clear searches"));
          }}
          className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition active:bg-white/[0.04]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/70">
            <Trash2 className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-white/90">Clear search history</span>
            <span className="mt-0.5 block text-[11.5px] text-white/40">Removes recent searches</span>
          </span>
        </button>
      </Section>

      {/* ── ABOUT ── */}
      <Section icon={<Info className="h-4 w-4" />} title="ABOUT">
        <div className="px-4 py-4">
          <div className="flex items-center gap-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon.png" alt="SONARA" className="h-12 w-12 rounded-2xl border border-white/10" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-[15px] font-bold">SONARA</p>
              <p className="text-[11.5px] text-white/40">Version 1.0 · built for Android</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat label="Songs" value={stats?.tracks} />
            <Stat label="Albums" value={stats?.albums} />
            <Stat label="Liked" value={stats?.liked} />
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-[11px] leading-relaxed text-white/35">
            <Radio className="h-3.5 w-3.5 shrink-0" />
            Full songs stream free from the open Audius network · popular charts via Apple Music
          </p>
        </div>
      </Section>

      <SleepSheet open={sleepOpen} onClose={() => setSleepOpen(false)} />
      <EqualizerSheet open={eqOpen} onClose={() => setEqOpen(false)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="glass-soft rounded-2xl px-2 py-3 text-center">
      <p className="font-display text-[18px] font-bold text-[color:var(--acc)]">{value ?? "—"}</p>
      <p className="mt-0.5 text-[10px] font-semibold tracking-wider text-white/40">{label}</p>
    </div>
  );
}

function usePlayerSleepLabel() {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    const read = async () => {
      const { usePlayer } = await import("@/lib/player");
      const compute = () => {
        const st = usePlayer.getState();
        if (st.sleepEndOfTrack) return "End of track";
        if (st.sleepAt) {
          const mins = Math.max(1, Math.ceil((st.sleepAt - Date.now()) / 60000));
          return `${mins} min`;
        }
        return null;
      };
      if (mounted) setLabel(compute());
      const unsub = usePlayer.subscribe(() => mounted && setLabel(compute()));
      const i = setInterval(() => mounted && setLabel(compute()), 15000);
      return () => {
        unsub();
        clearInterval(i);
      };
    };
    let cleanup: (() => void) | undefined;
    read().then((c) => (cleanup = c));
    return () => {
      mounted = false;
      cleanup?.();
    };
  }, []);
  return label;
}
