import type { Metadata } from "next";
import { headers } from "next/headers";
import { permanentRedirect } from "next/navigation";
import { cache } from "react";
import { getVotes } from "@/lib/db";
import { GitHubError } from "@/lib/github";
import { OS_LABEL, OS_LIST, type OS } from "@/lib/os";
import { PICKS, picksFor } from "@/lib/picks";
import { analyzeGate } from "@/lib/limit";
import { loadRepo } from "@/lib/pipeline";
import { ReportView, type ReportData, type Mode } from "../../report";

type Props = { params: Promise<{ owner: string; repo: string }>; searchParams: Promise<{ ref?: string; os?: string; mode?: string }> };

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

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { owner, repo } = await params;
  const { ref } = await searchParams;
  const r = await getRepo(owner, repo, ref);
  if ("error" in r) return { title: `${owner}/${repo}`, robots: { index: false } };
  const { meta } = r.data;
  const title = `How to set up ${meta.fullName.split("/")[1]} (${meta.fullName})`;
  const description = summary(r.data);
  return {
    title,
    description,
    alternates: { canonical: `/${meta.fullName}` },
    openGraph: { title, description, type: "article", url: `/${meta.fullName}` },
    twitter: { card: "summary_large_image", title, description },
    // Branch views (?ref=) are variants of the main page.
    robots: ref ? { index: false, follow: true } : undefined,
  };
}

// gitmanual.com/owner/repo mirrors github.com/owner/repo, so swapping "hub" for "manual" in a URL just works.
export default async function RepoPage({ params, searchParams }: Props) {
  const { owner, repo } = await params;
  const { ref, os, mode } = await searchParams;
  const r = await getRepo(owner, repo, ref);

  // One URL per repo: send renamed repos and other spellings (case, .git) to the canonical name.
  if ("data" in r && r.data.meta.fullName !== `${owner}/${repo}`) {
    const q = new URLSearchParams(Object.entries({ ref, os, mode }).filter((e): e is [string, string] => Boolean(e[1])));
    permanentRedirect(`/${r.data.meta.fullName}${q.size ? `?${q}` : ""}`);
  }

  const initialOs: OS = OS_LIST.includes(os as OS) ? (os as OS) : "mac";
  const initialMode = mode === "install" || mode === "source" ? (mode as Mode) : undefined;
  return (
    <>
      {"data" in r && <JsonLd data={r.data} os={initialOs} />}
      <ReportView
        key={`${owner}/${repo}/${ref ?? ""}`}
        owner={owner}
        repo={repo.replace(/\.git$/, "")}
        gitRef={ref}
        initial={"data" in r ? r.data : null}
        initialError={"error" in r ? r.error : null}
        initialOs={initialOs}
        initialMode={initialMode}
        picks={"data" in r ? await picksFor(r.data.meta.fullName) : []}
        curator={PICKS.curator}
        aiGuide={Boolean(process.env.ANTHROPIC_API_KEY)}
      />
    </>
  );
}

// Structured data: what the software is, the setup as a HowTo, and where the page sits on the site.
function JsonLd({ data, os }: { data: ReportData; os: OS }) {
  const { meta, analysis } = data;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = `${site}/${meta.fullName}`;
  const graph = [
    {
      "@type": "SoftwareSourceCode",
      name: meta.fullName.split("/")[1],
      description: meta.description ?? undefined,
      codeRepository: meta.htmlUrl,
      programmingLanguage: meta.language ?? undefined,
      license: meta.license && meta.license !== "NOASSERTION" ? `https://spdx.org/licenses/${meta.license}` : undefined,
    },
    {
      "@type": "HowTo",
      name: `How to set up ${meta.fullName} on ${OS_LABEL[os]}`,
      url,
      step: analysis.steps[os].map((s, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: s.title,
        text: [s.note, ...s.commands].filter(Boolean).join("\n") || s.title,
      })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "gitmanual", item: site },
        { "@type": "ListItem", position: 2, name: "The shelf", item: `${site}/shelf` },
        { "@type": "ListItem", position: 3, name: meta.fullName, item: url },
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
