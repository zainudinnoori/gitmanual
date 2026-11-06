import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How it works",
  description: "How gitmanual turns a GitHub repo into setup steps: what it reads, how it checks your device, and where it can be wrong.",
  alternates: { canonical: "/how-it-works" },
};

const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL || null;

// The pipeline really runs in this order, so the numbers mean something.
const PIPELINE = [
  { title: "Read", text: "Only the setup files: README, guides, package and Docker files." },
  { title: "Work out", text: "The stack, versions, databases and settings it needs." },
  { title: "Check", text: "Whether it fits your system and chip." },
  { title: "Write", text: "The maintainers' options first, then steps for your OS." },
];

const VERDICTS = [
  { tone: "yes", mark: "✓", label: "Yes", text: "There's a download, an install command or a Docker route for you." },
  { tone: "maybe", mark: "?", label: "Maybe", text: "It needs something extra, like WSL, a TV or an Apple Silicon Mac." },
  { tone: "no", mark: "✕", label: "No", text: "The project says it doesn't support your system. We quote it." },
];

const FAQ = [
  {
    q: "Can I trust the commands?",
    a: (
      <>
        Every command comes from the repo&apos;s own files or a well-known installer like Homebrew, winget or nvm. README commands are shown
        exactly as written, and scripts that pipe into your shell get a warning. Still, read a command before you run it.
      </>
    ),
  },
  {
    q: "Does gitmanual run the code?",
    a: <>No. It never downloads the whole repo and never runs anything. It reads a handful of files from GitHub, the way you would.</>,
  },
  {
    q: "Where can it be wrong?",
    a: (
      <ul>
        <li>It only knows what the repo says. An out-of-date README means out-of-date steps.</li>
        <li>Apps inside a subfolder of a big repo are listed, not fully set up.</li>
        <li>When the real guide lives on the project&apos;s website, we link to it rather than guess.</li>
        <li>A manual can be up to 12 hours old. &ldquo;Re-read the repo&rdquo; refreshes it.</li>
      </ul>
    ),
  },
  {
    q: "Is the AI guide accurate?",
    a: <>It&apos;s written by Claude from the same files, and it can make mistakes. Use it when you&apos;re stuck, and check it against the README.</>,
  },
  {
    q: "Can my AI assistant use it?",
    a: (
      <>
        Yes. Add <code>https://gitmanual.com/mcp</code> as an MCP server in Claude, Cursor or any MCP client, then ask how to set up a
        repo. The same facts are at <code>/api/v1/manual?repo=owner/repo</code> as JSON, and <code>/llms.txt</code> describes it all.
      </>
    ),
  },
  {
    q: "What do you store?",
    a: (
      <>
        Each repo&apos;s manual (public GitHub data), how often it&apos;s looked up, and &ldquo;did it work&rdquo; answers with the system
        they were for. No accounts, no cookies, and nothing else about you. To stop abuse, a counter per visitor (a scrambled code that changes daily, never your IP address) limits how many new repos and AI guides can be requested in a row. Page views are counted anonymously with Vercel Analytics. Pressing play on a Reel loads Facebook&apos;s video player, which follows
        Facebook&apos;s own privacy rules; until then, nothing on the page comes from Facebook. The same goes for the contact form: it loads from sharetext.net only when you open it.
      </>
    ),
  },
];

export default function HowItWorks() {
  return (
    <div className="wrap how">
      <header className="how-head">
        <p className="eyebrow">How it works</p>
        <h1 className="display-md">Paste a link. Get a manual.</h1>
        <p className="lead">gitmanual reads a repo&apos;s setup files and writes the steps for your system. It never runs the code.</p>
      </header>

      <ol className="how-flow" aria-label="What happens when you paste a link">
        {PIPELINE.map((p, i) => (
          <li key={p.title}>
            <span className="how-n" aria-hidden="true">
              {i + 1}
            </span>
            <h2>{p.title}</h2>
            <p>{p.text}</p>
          </li>
        ))}
      </ol>

      <section className="how-section" aria-labelledby="verdict-h">
        <h2 id="verdict-h" className="how-h2">
          Will it work on my device?
        </h2>
        <ul className="how-verdicts">
          {VERDICTS.map((v) => (
            <li key={v.tone} className={`how-verdict fit-${v.tone}`}>
              <span className="fit-stamp" aria-hidden="true">
                {v.mark}
              </span>
              <p>
                <b>{v.label}.</b> {v.text}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="how-section" aria-labelledby="faq-h">
        <h2 id="faq-h" className="how-h2">
          Good to know
        </h2>
        <div className="how-faq">
          {FAQ.map((f, i) => (
            <details key={f.q} open={i === 0}>
              <summary>{f.q}</summary>
              <div className="how-a">{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      <section className="how-cta">
        <h2 className="how-h2">Found a wrong step?</h2>
        <p>Tell us the repo and what actually worked. The rules get better one repo at a time.</p>
        <div className="how-cta-btns">
          {REPO_URL && (
            <a className="btn btn-go" href={`${REPO_URL.replace(/\/$/, "")}/issues/new`} target="_blank" rel="noreferrer">
              Report a wrong setup
            </a>
          )}
          <Link className={`btn${REPO_URL ? "" : " btn-go"}`} href="/">
            Look up a repo
          </Link>
        </div>
      </section>
    </div>
  );
}
