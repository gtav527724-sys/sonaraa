"use client";

import { useEffect } from "react";
import { ensureAudio, usePlayer } from "@/lib/player";

export default function PlayerRuntime() {
  const current = usePlayer((s) => s.queue[s.index] ?? null);
  const currentId = current?.id;

  // Warm the audio engine once so listeners exist before any playback.
  useEffect(() => {
    ensureAudio().volume = usePlayer.getState().volume;
  }, []);

  // Android lock-screen / notification controls
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler("play", () => {
        if (!usePlayer.getState().isPlaying) usePlayer.getState().toggle();
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        if (usePlayer.getState().isPlaying) usePlayer.getState().toggle();
      });
      navigator.mediaSession.setActionHandler("nexttrack", () =>
        usePlayer.getState().next(false),
      );
      navigator.mediaSession.setActionHandler("previoustrack", () =>
        usePlayer.getState().prev(),
      );
    } catch {
      /* unsupported */
    }
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!currentId || !current) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: current.albumTitle,
        artwork: [
          {
            src: new URL(current.coverUrl, window.location.origin).href,
            sizes: "1024x1024",
            type: "image/jpeg",
          },
        ],
      });
    } catch {
      /* unsupported */
    }
  }, [currentId, current]);

  return null;
}
