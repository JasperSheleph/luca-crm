import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getCurrentUser } from "@/lib/queries/users";

/** Long enough to open a PDF or scroll a gallery, short enough to be useless if leaked. */
const TTL_SECONDS = 300;

const BUCKETS = new Set(["quotes", "visit-photos"]);

/**
 * Hand back a short-lived signed URL for one stored file.
 *
 * Both buckets are private, and the tables store the storage PATH rather than
 * a URL — a public bucket would let anyone holding the anon key (which ships in
 * the browser bundle by design) enumerate photographs of customers' homes.
 *
 * This runs as the signed-in user, so the storage policies decide: a rep gets a
 * URL only for a deal they own, and everyone else gets a 403 from Supabase
 * rather than from a check written here.
 *
 * GET /api/files?bucket=visit-photos&path=<deal-id>/<file>
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const bucket = searchParams.get("bucket") ?? "";
  const path = searchParams.get("path") ?? "";

  if (!BUCKETS.has(bucket)) return NextResponse.json({ error: "Unknown bucket" }, { status: 400 });
  // The policies key off the first path segment being a deal id. Anything
  // trying to climb out of that prefix is refused here rather than relied on
  // being refused later.
  if (!path || path.includes("..")) return NextResponse.json({ error: "Bad path" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, TTL_SECONDS);
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(
    { url: data.signedUrl },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
