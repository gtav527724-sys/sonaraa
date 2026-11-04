import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { albums, tracks } from "@/db/schema";
import type { Track } from "@/lib/types";

export const dynamic = "force-dynamic";

const WEB_ALBUM_SLUG = "web-streams";

/**
 * Persists an internet track into the local catalog (idempotent),
 * so likes / playlists / history can reference a real DB row.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { track?: Track };
    const t = body.track;
    if (!t || !t.title || !t.audioUrl) {
      return NextResponse.json({ error: "Invalid track" }, { status: 400 });
    }
    // Stable numeric key for any internet track. iTunes uses its real id;
    // Audius (string ids) uses the absolute value of its hashed negative id.
    const webKey = t.itunesId ?? (t.id < 0 ? Math.abs(t.id) : null);
    if (webKey == null) {
      return NextResponse.json({ error: "Not an internet track" }, { status: 400 });
    }

    const existing = await db
      .select()
      .from(tracks)
      .where(eq(tracks.itunesId, webKey))
      .limit(1);
    if (existing[0]) {
      return NextResponse.json({ track: existing[0] });
    }

    let [webAlbum] = await db
      .select()
      .from(albums)
      .where(eq(albums.slug, WEB_ALBUM_SLUG))
      .limit(1);
    if (!webAlbum) {
      [webAlbum] = await db
        .insert(albums)
        .values({
          slug: WEB_ALBUM_SLUG,
          title: "Web Streams",
          artist: "Various Artists",
          genre: "Online",
          coverUrl: "/icons/icon.png",
          year: new Date().getFullYear(),
          hue: 84,
        })
        .onConflictDoNothing({ target: albums.slug })
        .returning();
      if (!webAlbum) {
        [webAlbum] = await db
          .select()
          .from(albums)
          .where(eq(albums.slug, WEB_ALBUM_SLUG))
          .limit(1);
      }
    }

    const inserted = await db
      .insert(tracks)
      .values({
        title: t.title.slice(0, 300),
        artist: (t.artist || "Unknown artist").slice(0, 300),
        albumTitle: (t.albumTitle || "Single").slice(0, 300),
        albumSlug: WEB_ALBUM_SLUG,
        genre: (t.genre || "Music").slice(0, 120),
        durationSec: t.durationSec || 30,
        audioUrl: t.audioUrl,
        coverUrl: t.coverUrl || "/icons/icon.png",
        albumId: webAlbum.id,
        itunesId: webKey,
      })
      .onConflictDoNothing({ target: tracks.itunesId })
      .returning();

    const row =
      inserted[0] ??
      (await db.select().from(tracks).where(eq(tracks.itunesId, webKey)).limit(1))[0];

    return NextResponse.json({ track: row });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
