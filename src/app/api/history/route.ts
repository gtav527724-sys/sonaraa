import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { recentPlays, tracks } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db
      .select({ track: tracks })
      .from(recentPlays)
      .innerJoin(tracks, eq(recentPlays.trackId, tracks.id))
      .orderBy(desc(recentPlays.playedAt))
      .limit(30);
    const seen = new Set<number>();
    const deduped = rows
      .map((r) => r.track)
      .filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
      .slice(0, 12);
    return NextResponse.json({ tracks: deduped });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    if (searchParams.get("all")) {
      await db.delete(recentPlays);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to clear history" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { trackId?: number };
    if (!body.trackId) {
      return NextResponse.json({ error: "trackId required" }, { status: 400 });
    }
    await db.insert(recentPlays).values({ trackId: body.trackId });
    await db.execute(
      sql`DELETE FROM recent_plays WHERE id NOT IN (
        SELECT id FROM recent_plays ORDER BY played_at DESC LIMIT 60
      )`,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to record play" }, { status: 500 });
  }
}
