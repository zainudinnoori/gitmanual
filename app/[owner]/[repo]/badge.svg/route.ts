import { fitCheck } from "@/lib/fit";
import { GitHubError } from "@/lib/github";
import { OS_LIST } from "@/lib/os";
import { analyzeGate } from "@/lib/limit";
import { loadRepo } from "@/lib/pipeline";

const LABEL = { mac: "macOS", windows: "Windows", linux: "Linux" } as const;

// Verdana 11px advance widths (shields.io badges use the same font), close enough for textLength to settle the rest.
const NARROW = "fijlrt.,:;'!|()[] ";
const WIDE = "mwMW";
function textWidth(text: string): number {
  let w = 0;
  for (const c of text) w += NARROW.includes(c) ? 3.9 : WIDE.includes(c) ? 10 : /[A-Z]/.test(c) ? 7.6 : c === "·" ? 4.4 : 6.8;
  return Math.round(w);
}

function escape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// A shields-style README badge: [▣ setup manual | macOS · Windows · Linux], linking back to the manual.
function badge(label: string, message: string): string {
  const icon = 14 + 4; // the box logo plus a gap
  const lw = icon + textWidth(label) + 14;
  const mw = textWidth(message) + 16;
  const w = lw + mw;
  const text = (x: number, t: string, fill: string, len: number) =>
    `<text x="${x}" y="14" fill="${fill}" textLength="${len}" lengthAdjust="spacingAndGlyphs">${escape(t)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${escape(`${label}: ${message}`)}">
<title>${escape(`${label}: ${message}`)}</title>
<clipPath id="r"><rect width="${w}" height="20" rx="4"/></clipPath>
<g clip-path="url(#r)">
<rect width="${lw}" height="20" fill="#15161a"/>
<rect x="${lw}" width="${mw}" height="20" fill="#ff6b2c"/>
</g>
<g transform="translate(6 3) scale(0.54)" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round">
<path d="M13 2l10 5v12l-10 5-10-5V7z" fill="#ff6b2c"/><path d="M3 7l10 5 10-5M13 12v12"/>
</g>
<g font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
${text(icon + 7, label, "#fff", textWidth(label))}
${text(lw + 8, message, "#15161a", textWidth(message))}
</g>
</svg>`;
}

function svg(body: string, maxAge: number) {
  return new Response(body, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // GitHub's image proxy caches badges too; a day keeps them fresh enough without re-reading repos.
      "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge * 24}`,
    },
  });
}

// Systems the manual says "yes" or "maybe" for, without knowing the reader's chip.
export async function GET(req: Request, { params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await params;
  try {
    const { meta, analysis, install } = (await loadRepo({ owner, repo }, { gate: analyzeGate(req.headers) })).data;
    const systems = OS_LIST.filter((os) => fitCheck(analysis, install, os, null, meta.archived).status !== "no").map((os) => LABEL[os]);
    return svg(badge("setup manual", systems.length ? systems.join(" · ") : "read the manual"), 3600);
  } catch (e) {
    // Badges still render for missing repos, so a README never shows a broken image.
    return svg(badge("setup manual", e instanceof GitHubError && e.status === 404 ? "repo not found" : "unavailable"), 300);
  }
}
