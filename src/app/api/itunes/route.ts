import { NextResponse } from "next/server";
import { searchItunes } from "@/lib/itunes";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ tracks: [] });
  try {
    const tracks = await searchItunes(q, 25);
    return NextResponse.json({ tracks });
  } catch (err) {
    console.error("iTunes search failed", err);
    return NextResponse.json({ tracks: [], offline: true });
  }
}
