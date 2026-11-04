import { fbImage } from "@/lib/db";

// Our copy of a synced Facebook post's image (Facebook's own links expire).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const img = await fbImage(id);
  if (!img) return new Response("Not found", { status: 404 });
  return new Response(img.bytes, {
    headers: { "Content-Type": img.type, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
