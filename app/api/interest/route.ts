import { NextResponse } from "next/server";
import { countInterest } from "@/lib/db";
import { firstTime, limit, LimitError, visitor } from "@/lib/limit";

// Demand tests: buttons for features that aren't built yet ("Download PDF", the Team plan's waitlist) say so and are
// counted here, once per visitor, repo (if any) and day. Only the feature, the day and the repo are kept, never who
// pressed it.
//   POST /api/interest {"feature": "pdf", "repo": "owner/name"}
//   POST /api/interest {"feature": "team"}
const FEATURES: Record<string, { repo: boolean }> = { pdf: { repo: true }, team: { repo: false } };
const NO_REPO = "-";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { feature?: string; repo?: string };
  const feature = body.feature ?? "";
  const rule = Object.hasOwn(FEATURES, feature) ? FEATURES[feature] : null;
  const repo = rule?.repo ? (body.repo ?? "") : NO_REPO;
  if (!rule || (rule.repo && !/^[\w.-]{1,100}\/[\w.-]{1,100}$/.test(repo))) return NextResponse.json({ error: "Unknown feature or repo." }, { status: 400 });
  const who = visitor(req.headers);
  try {
    await limit("interest", who);
  } catch (e) {
    if (e instanceof LimitError) return NextResponse.json({ ok: true }); // already counted plenty; nothing to tell them
    throw e;
  }
  if (await firstTime(`interest:${feature}:${repo.toLowerCase()}`, who)) await countInterest(feature, repo);
  return NextResponse.json({ ok: true });
}
