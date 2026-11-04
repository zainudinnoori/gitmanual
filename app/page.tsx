import { redirect } from "next/navigation";
import { listRepos } from "@/lib/db";
import { parseRepoUrl } from "@/lib/github";
import { Landing } from "./hero";

export default async function Home({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  // Old links used /?url=…; send them to the repo's own page.
  const { url } = await searchParams;
  const ref = url ? parseRepoUrl(url) : null;
  if (ref) redirect(`/${ref.owner}/${ref.repo}${ref.ref ? `?ref=${encodeURIComponent(ref.ref)}` : ""}`);
  const [recent, popular] = await Promise.all([listRepos("recent"), listRepos("popular")]);
  return <Landing recent={recent} popular={popular} />;
}
