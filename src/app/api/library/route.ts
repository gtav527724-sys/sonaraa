import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { likedSongs, recentPlays, tracks } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const likedRows = await db
      .select({ track: tracks })
      .from(likedSongs)
      .innerJoin(tracks, eq(likedSongs.trackId, tracks.id))
      .orderBy(desc(likedSongs.createdAt));

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

    return NextResponse.json({
      likedCount: likedRows.length,
      likedCovers: likedRows.slice(0, 4).map((r) => r.track.coverUrl),
      liked: likedRows.map((r) => r.track),
      recent,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to load library" }, { status: 500 });
  }
}
