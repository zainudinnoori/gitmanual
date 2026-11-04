import type { Metadata } from "next";
import { ReportView } from "../../report";

type Props = { params: Promise<{ owner: string; repo: string }>; searchParams: Promise<{ ref?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { owner, repo } = await params;
  return { title: `How to set up ${owner}/${repo} · gitsetup` };
}

// gitsetup.com/owner/repo mirrors github.com/owner/repo, so swapping "hub" for "setup" in a URL just works.
export default async function RepoPage({ params, searchParams }: Props) {
  const { owner, repo } = await params;
  const { ref } = await searchParams;
  return <ReportView key={`${owner}/${repo}/${ref ?? ""}`} owner={owner} repo={repo.replace(/\.git$/, "")} gitRef={ref} />;
}
