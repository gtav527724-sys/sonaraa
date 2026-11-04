"use client";

import { create } from "zustand";
import type { Track } from "./types";
import { vibrate } from "./utils";

interface LibraryState {
  likedIds: number[];
  likedItunesIds: number[];
  version: number;
  loaded: boolean;
  setLikedIds: (ids: number[], itunesIds?: number[]) => void;
  bump: () => void;
  toggleLike: (trackId: number) => Promise<void>;
  trackKey: (track: Track) => number;
  isLiked: (track: Track) => boolean;
  toggleLikeSmart: (track: Track) => Promise<boolean>;
}

export const useLibrary = create<LibraryState>((set, get) => ({
  likedIds: [],
  likedItunesIds: [],
  version: 0,
  loaded: false,

  setLikedIds: (ids, itunesIds = []) =>
    set({ likedIds: ids, likedItunesIds: itunesIds, loaded: true }),

  bump: () => set({ version: get().version + 1 }),

  /** Stable identity key for any track (local id, iTunes id, or Audius hash). */
  trackKey(track: Track): number {
    return track.itunesId ?? (track.id < 0 ? Math.abs(track.id) : track.id);
  },

  isLiked: (track) => {
    if (track.itunesId || track.audiusId || track.id < 0) {
      return get().likedItunesIds.includes(get().trackKey(track));
    }
    return get().likedIds.includes(track.id);
  },

  toggleLike: async (trackId) => {
    const liked = get().likedIds.includes(trackId);
    vibrate(12);
    set({
      likedIds: liked
        ? get().likedIds.filter((id) => id !== trackId)
        : [...get().likedIds, trackId],
      version: get().version + 1,
    });
    try {
      await fetch(liked ? `/api/liked?trackId=${trackId}` : "/api/liked", {
        method: liked ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: liked ? undefined : JSON.stringify({ trackId }),
      });
    } catch {
      set({
        likedIds: liked
          ? [...get().likedIds, trackId]
          : get().likedIds.filter((id) => id !== trackId),
      });
    }
  },

  /** Like/unlike for any track — internet tracks are synced to the DB first. */
  toggleLikeSmart: async (track) => {
    const isInternet = Boolean(track.itunesId || track.audiusId || track.id < 0);
    if (!isInternet) {
      const was = get().likedIds.includes(track.id);
      await get().toggleLike(track.id);
      return !was;
    }

    const key = get().trackKey(track);
    const was = get().likedItunesIds.includes(key);
    vibrate(12);
    // optimistic
    set({
      likedItunesIds: was
        ? get().likedItunesIds.filter((id) => id !== key)
        : [...get().likedItunesIds, key],
    });
    try {
      const res = await fetch("/api/sync-track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track }),
      });
      const data = (await res.json()) as { track?: Track };
      const realId = data.track?.id;
      if (!realId) throw new Error("sync failed");

      set({ version: get().version + 1 });

      await fetch(was ? `/api/liked?trackId=${realId}` : "/api/liked", {
        method: was ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: was ? undefined : JSON.stringify({ trackId: realId }),
      });

      // swap the temp negative id in the player queue for the real DB id
      const { usePlayer } = await import("./player");
      usePlayer.getState().replaceTrack(track.id, data.track!);
      return !was;
    } catch {
      set({
        likedItunesIds: was
          ? [...get().likedItunesIds.filter((id) => id !== key), key]
          : get().likedItunesIds.filter((id) => id !== key),
      });
      return was;
    }
  },
}));
