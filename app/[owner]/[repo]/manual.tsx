import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { alternativesFor, getVotes, type Alternative } from "@/lib/db";
import { answered, asked, beforeYouStart } from "@/lib/facts";
import { facetsOf, hasDownload, topicsOf } from "@/lib/facets";
import { GitHubError } from "@/lib/github";
import { fitCheck, setupTime } from "@/lib/fit";
import { OS_LABEL, OS_LIST, OS_SLUG, osFromSlug, type OS } from "@/lib/os";
import { PICKS, picksFor } from "@/lib/picks";
import { analyzeGate } from "@/lib/limit";
import { loadRepo } from "@/lib/pipeline";
import { githubApp } from "@/lib/session";
import { ReportView, type ReportData, type Mode } from "../../report";

// Shared by the repo's manual (/owner/repo) and its per-system pages (/owner/repo/windows).
export type Props = {
  params: Promise<{ owner: string; repo: string; os?: string }>;
  searchParams: Promise<{ ref?: string; os?: string; mode?: string }>;
};

// The system a per-system page is for; null on the main manual. Anything else under /owner/repo/ isn't a page.
async function osPageOf(params: Props["params"]): Promise<OS | null> {
  const { os } = await params;
  if (os === undefined) return null;
  return osFromSlug(os) ?? notFound();
}

const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora|whatsapp|telegram/i;

// One load per request, shared by generateMetadata and the page.
const getRepo = cache(async (owner: string, repo: string, ref?: string): Promise<{ data: ReportData } | { error: string; status: number }> => {
  const h = await headers();
  const ua = h.get("user-agent") ?? "";
  try {
    const l = await loadRepo({ owner, repo: repo.replace(/\.git$/, ""), ref }, { view: !BOTS.test(ua), gate: analyzeGate(h) });
    return { data: { ...l.data, analyzedAt: l.analyzedAt, cached: l.cached, stale: l.stale, votes: await getVotes(l.key) } as ReportData };
  } catch (e) {
    return e instanceof GitHubError ? { error: e.message, status: e.status } : { error: "Failed to analyze repository.", status: 500 };
  }
});

// "<What it is>. Downloads for macOS and Windows. Needs Node.js and Docker. Step-by-step setup for macOS, Windows and Linux."
function summary(d: ReportData): string {
  const { meta, analysis: a, install } = d;
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0]);
  const sentences = [
    meta.description?.replace(/:[a-z0-9_+-]+:\s*/g, "").trim().replace(/[.!]?$/, "."),
    install.platforms.length ? `Downloads for ${list(install.platforms.map((p) => OS_LABEL[p]))}.` : null,
    a.runtimes.length ? `Needs ${list(a.runtimes.slice(0, 3).map((r) => r.name))}.` : null,
    "Step-by-step setup for macOS, Windows and Linux.",
  ].filter(Boolean);
  return sentences.join(" ").slice(0, 300);
}

// The search snippet, answer first: "Install ollama on macOS in about 5 min: a ready-made download, or 5 copy-paste
// Terminal steps. Open source (MIT)." When it doesn't run there, it says so and what the page explains instead.
function osSummary(d: ReportData, os: OS): string {
  const { meta, analysis: a, install } = d;
  const name = OS_LABEL[os];
  const app = meta.fullName.split("/")[1];
  const fit = fitCheck(a, install, os, null, meta.archived);
  const steps = a.steps[os].length;
  const shell = os === "windows" ? "PowerShell" : os === "mac" ? "Terminal" : "bash";
  const download = hasDownload(install, os);
  const how = [download ? "a ready-made download" : null, steps ? `${steps} copy-paste ${shell} ${steps === 1 ? "step" : "steps"}` : null]
    .filter(Boolean)
    .join(", or ");
  const time = setupTime(a.difficulty.score); // "about 5 min" or "30 min or more"
  const lead = {
    yes: `Install ${app} on ${name} ${time.startsWith("about") ? `in ${time}` : `(takes ${time})`}${how ? `: ${how}` : ""}.`,
    maybe: `${app} may work on ${name}${how ? `. Try it with ${how}` : ""}.`,
    no: `${app} doesn't run on ${name}. See why, and the systems it does run on.`,
  }[fit.status];
  const sentences = [
    lead,
    // With a download, the runtimes only matter for building from source.
    fit.status !== "no" && a.runtimes.length && !download ? `Needs ${a.runtimes.slice(0, 3).map((r) => r.name).join(", ")}.` : null,
    meta.license && !/^(NOASSERTION|other)$/i.test(meta.license) ? `Open source (${meta.license}).` : null,
  ].filter(Boolean);
  return sentences.join(" ").slice(0, 300);
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { owner, repo } = await params;
  const osPage = await osPageOf(params);
  const { ref, os: qOs } = await searchParams;
  const r = await getRepo(owner, repo, ref);
  if ("error" in r) return { title: `${owner}/${repo}`, robots: { index: false } };
  const { meta } = r.data;
  const name = meta.fullName.split("/")[1];
  const title = osPage ? `How to install ${name} on ${OS_LABEL[osPage]} (${meta.fullName})` : `How to set up ${name} (${meta.fullName})`;
  const description = osPage ? osSummary(r.data, osPage) : summary(r.data);
  // ?os=windows on the main manual is the same content as /owner/repo/windows, so that page is its canonical.
  const qOsValid = OS_LIST.includes(qOs as OS) ? (qOs as OS) : null;
  const canonical = `/${meta.fullName}${osPage || qOsValid ? `/${OS_SLUG[(osPage ?? qOsValid)!]}` : ""}`;
  return {
    title,
    description,
    alternates: { canonical },
    // Named here because the per-system pages have no image file of their own, and this openGraph would hide the repo's.
    openGraph: { title, description, type: "article", url: canonical, images: [{ url: `/${meta.fullName}/opengraph-image`, width: 1200, height: 630, alt: `Setup manual for ${meta.fullName}` }] },
    twitter: { card: "summary_large_image", title, description, images: [`/${meta.fullName}/opengraph-image`] },
    // Branch views (?ref=) are variants of the main page.
    robots: ref ? { index: false, follow: true } : undefined,
  };
}

// The manual page itself; on a per-system page (osPage) it opens on that system rather than the visitor's.
export async function RepoManual({ params, searchParams }: Props) {
  const { owner, repo } = await params;
  const osPage = await osPageOf(params);
  const { ref, os, mode } = await searchParams;
  const r = await getRepo(owner, repo, ref);

  // One URL per repo: send renamed repos and other spellings (case, .git) to the canonical name.
  if ("data" in r && r.data.meta.fullName !== `${owner}/${repo}`) {
    const q = new URLSearchParams(Object.entries({ ref, os, mode }).filter((e): e is [string, string] => Boolean(e[1])));
    permanentRedirect(`/${r.data.meta.fullName}${osPage ? `/${OS_SLUG[osPage]}` : ""}${q.size ? `?${q}` : ""}`);
  }

  const initialOs: OS = osPage ?? (OS_LIST.includes(os as OS) ? (os as OS) : "mac");
  const initialMode = mode === "install" || mode === "source" ? (mode as Mode) : undefined;
  return (
    <>
      {"data" in r && <JsonLd data={r.data} os={initialOs} osPage={osPage} />}
      <ReportView
        key={`${owner}/${repo}/${ref ?? ""}`}
        owner={owner}
        repo={repo.replace(/\.git$/, "")}
        gitRef={ref}
        initial={"data" in r ? r.data : null}
        initialError={"error" in r ? r.error : null}
        initialStatus={"error" in r ? r.status : null}
        githubApp={Boolean(githubApp())}
        initialOs={initialOs}
        osPage={osPage}
        initialMode={initialMode}
        picks={"data" in r ? await picksFor(r.data.meta.fullName) : []}
        curator={PICKS.curator}
        aiGuide={Boolean(process.env.ANTHROPIC_API_KEY)}
        alternatives={"data" in r ? await alternatives(r.data) : {}}
      />
    </>
  );
}

// For each system this repo doesn't clearly run on, a few similar repos (by shared topics) that do.
async function alternatives(d: ReportData): Promise<Partial<Record<OS, Alternative[]>>> {
  const topics = topicsOf(facetsOf(d));
  const missing = OS_LIST.filter((os) => fitCheck(d.analysis, d.install, os, null, d.meta.archived).status !== "yes");
  const found = await Promise.all(missing.map((os) => alternativesFor(d.meta.fullName.toLowerCase(), os, topics)));
  return Object.fromEntries(missing.map((os, i) => [os, found[i]]).filter(([, alts]) => alts.length));
}

// Structured data: what the software is, the setup as a HowTo, and where the page sits on the site.
function JsonLd({ data, os, osPage }: { data: ReportData; os: OS; osPage: OS | null }) {
  const { meta, analysis } = data;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const home = `${site}/${meta.fullName}`;
  const url = osPage ? `${home}/${OS_SLUG[osPage]}` : home;
  const name = meta.fullName.split("/")[1];
  const graph = [
    // This page, and how fresh it is: the setup was last read from the repo at analyzedAt.
    {
      "@type": "WebPage",
      "@id": url,
      url,
      dateModified: new Date(data.analyzedAt).toISOString(),
      about: { "@id": `${home}#software` },
      isPartOf: { "@type": "WebSite", "@id": `${site}/#website`, name: "gitmanual", url: `${site}/` },
    },
    {
      "@type": "SoftwareSourceCode",
      "@id": `${home}#software`,
      name,
      description: meta.description ?? undefined,
      codeRepository: meta.htmlUrl,
      programmingLanguage: meta.language ?? undefined,
      license: meta.license && meta.license !== "NOASSERTION" ? `https://spdx.org/licenses/${meta.license}` : undefined,
      keywords: meta.topics.length ? meta.topics.join(", ") : undefined,
      // Not SoftwareApplication: Google would then expect ratings and flag every manual in Search Console without them.
      dateModified: meta.pushedAt,
    },
    {
      "@type": "HowTo",
      name: `How to install ${meta.fullName} on ${OS_LABEL[os]}`,
      url,
      step: analysis.steps[os].map((s, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: s.title,
        text: [s.note, ...s.commands].filter(Boolean).join("\n") || s.title,
      })),
    },
    // The questions people search after a project's name, answered from the same facts as the page.
    {
      "@type": "FAQPage",
      mainEntity: beforeYouStart(data).map((f) => ({
        "@type": "Question",
        name: asked(f, meta.fullName),
        acceptedAnswer: { "@type": "Answer", text: answered(f) },
      })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "gitmanual", item: site },
        { "@type": "ListItem", position: 2, name: "The shelf", item: `${site}/shelf` },
        { "@type": "ListItem", position: 3, name: meta.fullName, item: home },
        ...(osPage ? [{ "@type": "ListItem", position: 4, name: OS_LABEL[osPage], item: url }] : []),
      ],
    },
  ];
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe in a script tag once "<" is escaped.
      dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c") }}
    />
  );
}
