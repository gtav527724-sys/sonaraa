import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { recentSearches } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(recentSearches)
      .orderBy(desc(recentSearches.createdAt))
      .limit(8);
    return NextResponse.json({ searches: rows.map((r) => r.query) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to load searches" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { query?: string };
    const query = body.query?.trim();
    if (!query) {
      return NextResponse.json({ error: "query required" }, { status: 400 });
    }
    await db
      .insert(recentSearches)
      .values({ query })
      .onConflictDoUpdate({
        target: recentSearches.query,
        set: { createdAt: sql`now()` },
      });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to save search" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query");
    if (searchParams.get("all")) {
      await db.delete(recentSearches);
    } else if (query) {
      await db.delete(recentSearches).where(eq(recentSearches.query, query));
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to clear searches" }, { status: 500 });
  }
}
