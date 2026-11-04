export interface Track {
  id: number;
  title: string;
  artist: string;
  albumTitle: string;
  albumSlug: string;
  genre: string;
  durationSec: number;
  audioUrl: string;
  coverUrl: string;
  /** Set when the track came from the Apple Music preview catalog. */
  itunesId?: number | null;
  /** Audius track id (full-length open streams). */
  audiusId?: string | null;
  source?: "local" | "itunes" | "audius";
}

export interface Album {
  id: number;
  slug: string;
  title: string;
  artist: string;
  genre: string;
  coverUrl: string;
  year: number;
  hue: number;
  trackCount?: number;
}

export interface PlaylistSummary {
  id: number;
  name: string;
  createdAt: string;
  trackCount: number;
  covers: string[];
}

export interface HomeData {
  featured: Album;
  albums: Album[];
  quickPicks: Track[];
  recent: Track[];
}

export interface LibraryData {
  likedCount: number;
  likedCovers: string[];
  playlists: PlaylistSummary[];
  recent: Track[];
}
