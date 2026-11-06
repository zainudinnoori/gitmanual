import type { Metadata } from "next";
import Link from "next/link";
import { OWNER, REPO_URL } from "@/lib/site";
import { DocPage } from "../doc";

export const metadata: Metadata = {
  title: "About",
  description: "What gitmanual is, why it exists, how it works and who runs it.",
  alternates: { canonical: "/about" },
};

export default function About() {
  return (
    <DocPage eyebrow="About" title="Setup manuals for open source" lead="gitmanual turns a GitHub repository into the steps to get it running on your computer.">
      <h2>Why it exists</h2>
      <p>
        Plenty of great projects live on GitHub, and plenty of people give up on them at the first step: which runtime, which version, does
        it work on Windows, is there a ready-made download somewhere? READMEs are written for people who already know. gitmanual reads the
        repo for you and writes the manual a newcomer needs.
      </p>

      <h2>How it works</h2>
      <p>
        It reads a repo&apos;s own files (README, releases, package and Docker files, <code>.env</code> examples) and applies rules to
        them. No AI writes the manuals, and gitmanual never downloads the whole repo or runs its code. When the rules can&apos;t tell, the
        manual points to the maintainers&apos; own guide instead of guessing. <Link href="/how-it-works">How it works</Link> explains the
        verdicts and the limits.
      </p>
      <p>You can use it three ways:</p>
      <ul>
        <li>
          Change <code>github.com</code> to <code>gitmanual.com</code> in any repo link.
        </li>
        <li>The browser extension, which adds a &ldquo;Setup manual&rdquo; button to GitHub.</li>
        <li>
          From an AI assistant, through the MCP server at <code>gitmanual.com/mcp</code>.
        </li>
      </ul>

      <h2>Who runs it</h2>
      <p>
        gitmanual is an independent, open-source project
        {OWNER && REPO_URL && (
          <>
            {" "}
            by{" "}
            <a href={`https://github.com/${OWNER}`} target="_blank" rel="noreferrer">
              {OWNER}
            </a>{" "}
            on GitHub
          </>
        )}
        . It&apos;s free to use, with no accounts. It isn&apos;t affiliated with or endorsed by GitHub or by the projects it describes; each
        project and its name belong to its own authors.
      </p>
      {REPO_URL && (
        <p>
          The code is MIT-licensed:{" "}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            {REPO_URL.replace(/^https:\/\//, "")}
          </a>
          . Anyone can run their own copy.
        </p>
      )}

      <h2>Get in touch</h2>
      <p>
        Found a wrong step? That&apos;s the most useful thing you can tell us.{" "}
        {REPO_URL ? (
          <>
            <a href={`${REPO_URL}/issues/new/choose`} target="_blank" rel="noreferrer">
              Report it on GitHub
            </a>{" "}
            or use the <Link href="/contact">contact page</Link>.
          </>
        ) : (
          <>
            Use the <Link href="/contact">contact page</Link>.
          </>
        )}
      </p>
    </DocPage>
  );
}
