import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { likedSongs, tracks } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (searchParams.get("ids")) {
      const rows = await db
        .select({ trackId: likedSongs.trackId, itunesId: tracks.itunesId })
        .from(likedSongs)
        .innerJoin(tracks, eq(likedSongs.trackId, tracks.id));
      return NextResponse.json({
        ids: rows.map((r) => r.trackId),
        itunesIds: rows.map((r) => r.itunesId).filter((x): x is number => x != null),
      });
    }
    const rows = await db
      .select({ track: tracks })
      .from(likedSongs)
      .innerJoin(tracks, eq(likedSongs.trackId, tracks.id))
      .orderBy(desc(likedSongs.createdAt));
    return NextResponse.json({ tracks: rows.map((r) => r.track) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to load liked songs" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { trackId?: number };
    if (!body.trackId) {
      return NextResponse.json({ error: "trackId required" }, { status: 400 });
    }
    await db
      .insert(likedSongs)
      .values({ trackId: body.trackId })
      .onConflictDoNothing();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to like track" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const trackId = Number(searchParams.get("trackId"));
    if (!trackId) {
      return NextResponse.json({ error: "trackId required" }, { status: 400 });
    }
    await db.delete(likedSongs).where(eq(likedSongs.trackId, trackId));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to unlike track" }, { status: 500 });
  }
}
