import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { playlists, playlistTracks, tracks } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const playlistId = Number(id);
    const [playlist] = await db
      .select()
      .from(playlists)
      .where(eq(playlists.id, playlistId))
      .limit(1);
    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }
    const rows = await db
      .select({ track: tracks })
      .from(playlistTracks)
      .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
      .where(eq(playlistTracks.playlistId, playlistId))
      .orderBy(asc(playlistTracks.position), asc(playlistTracks.id));
    return NextResponse.json({ playlist, tracks: rows.map((r) => r.track) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to load playlist" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await db.delete(playlists).where(eq(playlists.id, Number(id)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete playlist" }, { status: 500 });
  }
}
