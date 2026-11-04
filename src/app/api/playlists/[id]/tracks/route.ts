import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { playlistTracks } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const playlistId = Number(id);
    const body = (await req.json()) as { trackId?: number };
    if (!body.trackId) {
      return NextResponse.json({ error: "trackId required" }, { status: 400 });
    }
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(position), 0)` })
      .from(playlistTracks)
      .where(eq(playlistTracks.playlistId, playlistId));
    await db
      .insert(playlistTracks)
      .values({ playlistId, trackId: body.trackId, position: Number(max) + 1 })
      .onConflictDoNothing();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to add track" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const playlistId = Number(id);
    const { searchParams } = new URL(req.url);
    const trackId = Number(searchParams.get("trackId"));
    if (!trackId) {
      return NextResponse.json({ error: "trackId required" }, { status: 400 });
    }
    await db
      .delete(playlistTracks)
      .where(
        and(
          eq(playlistTracks.playlistId, playlistId),
          eq(playlistTracks.trackId, trackId),
        ),
      );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to remove track" }, { status: 500 });
  }
}
