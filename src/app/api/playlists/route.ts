import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { playlists, playlistTracks, tracks } from "@/db/schema";

export const dynamic = "force-dynamic";

async function withStats() {
  const all = await db.select().from(playlists).orderBy(desc(playlists.createdAt));
  const result = [];
  for (const p of all) {
    const rows = await db
      .select({ coverUrl: tracks.coverUrl })
      .from(playlistTracks)
      .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
      .where(eq(playlistTracks.playlistId, p.id))
      .orderBy(playlistTracks.position)
      .limit(4);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(playlistTracks)
      .where(eq(playlistTracks.playlistId, p.id));
    result.push({
      ...p,
      trackCount: Number(count),
      covers: rows.map((r) => r.coverUrl),
    });
  }
  return result;
}

export async function GET() {
  try {
    return NextResponse.json({ playlists: await withStats() });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to load playlists" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: string };
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    const [created] = await db.insert(playlists).values({ name }).returning();
    return NextResponse.json({
      playlist: { ...created, trackCount: 0, covers: [] },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create playlist" }, { status: 500 });
  }
}
