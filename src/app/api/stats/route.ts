import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { albums, likedSongs, playlists, recentPlays, tracks } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [t] = await db.select({ n: sql<number>`count(*)` }).from(tracks);
    const [a] = await db.select({ n: sql<number>`count(*)` }).from(albums);
    const [p] = await db.select({ n: sql<number>`count(*)` }).from(playlists);
    const [l] = await db.select({ n: sql<number>`count(*)` }).from(likedSongs);
    const [r] = await db.select({ n: sql<number>`count(*)` }).from(recentPlays);
    return NextResponse.json({
      tracks: Number(t.n),
      albums: Number(a.n),
      playlists: Number(p.n),
      liked: Number(l.n),
      plays: Number(r.n),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
