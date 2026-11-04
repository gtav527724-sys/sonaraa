import { asc, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { albums, recentPlays, tracks } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const allAlbums = await db.select().from(albums).orderBy(asc(albums.id));

    const quickPicks = await db
      .select()
      .from(tracks)
      .orderBy(sql`random()`)
      .limit(8);

    const recentRows = await db
      .select({ track: tracks })
      .from(recentPlays)
      .innerJoin(tracks, eq(recentPlays.trackId, tracks.id))
      .orderBy(desc(recentPlays.playedAt))
      .limit(24);

    const seen = new Set<number>();
    const recent = recentRows
      .map((r) => r.track)
      .filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
      .slice(0, 10);

    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000,
    );
    const featured = allAlbums[dayOfYear % Math.max(1, allAlbums.length)];

    const albumCounts = await db
      .select({ albumId: tracks.albumId, count: sql<number>`count(*)` })
      .from(tracks)
      .groupBy(tracks.albumId);

    const countMap = new Map(albumCounts.map((c) => [c.albumId, Number(c.count)]));
    const albumsWithCounts = allAlbums.map((a) => ({
      ...a,
      trackCount: countMap.get(a.id) ?? 0,
    }));

    return NextResponse.json({
      featured: { ...featured, trackCount: countMap.get(featured?.id) ?? 0 },
      albums: albumsWithCounts,
      quickPicks,
      recent,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to load home" }, { status: 500 });
  }
}
