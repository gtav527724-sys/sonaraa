import {
  bigint,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const albums = pgTable("albums", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  genre: text("genre").notNull(),
  coverUrl: text("cover_url").notNull(),
  year: integer("year").notNull(),
  hue: integer("hue").notNull().default(84),
});

export const tracks = pgTable(
  "tracks",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    artist: text("artist").notNull(),
    albumTitle: text("album_title").notNull(),
    albumSlug: text("album_slug").notNull(),
    genre: text("genre").notNull(),
    durationSec: integer("duration_sec").notNull().default(360),
    audioUrl: text("audio_url").notNull(),
    coverUrl: text("cover_url").notNull(),
    albumId: integer("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    itunesId: bigint("itunes_id", { mode: "number" }).unique(),
  },
  (t) => [index("tracks_album_idx").on(t.albumId)],
);

export const likedSongs = pgTable(
  "liked_songs",
  {
    id: serial("id").primaryKey(),
    trackId: integer("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("liked_songs_track_unique").on(t.trackId)],
);

export const playlists = pgTable("playlists", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const playlistTracks = pgTable(
  "playlist_tracks",
  {
    id: serial("id").primaryKey(),
    playlistId: integer("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    trackId: integer("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("playlist_track_unique").on(t.playlistId, t.trackId),
    index("playlist_tracks_playlist_idx").on(t.playlistId),
  ],
);

export const recentPlays = pgTable(
  "recent_plays",
  {
    id: serial("id").primaryKey(),
    trackId: integer("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    playedAt: timestamp("played_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("recent_plays_time_idx").on(t.playedAt)],
);

export const recentSearches = pgTable(
  "recent_searches",
  {
    id: serial("id").primaryKey(),
    query: text("query").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("recent_searches_query_unique").on(t.query)],
);
