import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { PICKS, sortedPicks } from "@/lib/picks";
import { ContactButton, LaunchBanner, Logo, NavLinks } from "./ui";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display" });
const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const DESCRIPTION =
  "Paste any GitHub link and get its setup manual: will it work on your device, what you need, and the exact steps for macOS, Windows or Linux.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "gitmanual: setup manuals for open source", template: "%s · gitmanual" },
  description: DESCRIPTION,
  applicationName: "gitmanual",
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "gitmanual", title: "gitmanual: setup manuals for open source", description: DESCRIPTION, url: "/" },
  twitter: { card: "summary_large_image", title: "gitmanual: setup manuals for open source", description: DESCRIPTION },
};

export const viewport: Viewport = { themeColor: "#f2f3f5" };

// gitmanual's own open-source repo, e.g. https://github.com/you/gitmanual. The menu's GitHub link appears once it's set.
const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL || null;
// Optional: the browser extension's store page, linked from the footer and the home page.
const EXTENSION_URL = process.env.NEXT_CHROME_EXTENSION_URL || null;
const PRO = process.env.PRO_ENABLED === "on" && Boolean(process.env.STRIPE_SECRET_KEY);
// Optional: a ShareText form for "Contact" in the footer (only https links are used).
// Optional: the Product Hunt launch page, shown in a strip above the menu while it's set (only producthunt.com links).
const LAUNCH_URL = /^https:\/\/(www\.)?producthunt\.com\/[^\s"]+$/.test(process.env.PRODUCT_HUNT_URL ?? "") ? process.env.PRODUCT_HUNT_URL! : null;
const CONTACT_FORM = /^https:\/\/[^\s"]+$/.test(process.env.CONTACT_FORM_URL ?? "") ? process.env.CONTACT_FORM_URL! : null;

async function repoStars(): Promise<number | null> {
  const m = REPO_URL?.match(/github\.com\/([\w.-]+\/[\w.-]+)/);
  if (!m) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${m[1]}`, {
      headers: { Accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
      next: { revalidate: 3600 },
    });
    return res.ok ? ((await res.json()).stargazers_count as number) : null;
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const finds = (await sortedPicks()).length ? PICKS.curator : null;
  const repo = REPO_URL?.replace(/\/$/, "") ?? null;
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        {LAUNCH_URL && <LaunchBanner url={LAUNCH_URL} />}
        <header className="nav">
          <div className="wrap nav-inner">
            <Link className="wordmark" href="/">
              <Logo />
              gitmanual
            </Link>
            <NavLinks repo={REPO_URL} stars={await repoStars()} finds={finds} />
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="footer">
          <div className="wrap footer-grid">
            <div className="footer-brand">
              <Link className="wordmark" href="/">
                <Logo />
                gitmanual
              </Link>
              <p>
                Setup manuals for open source. In any GitHub link, swap <s>hub</s> for <b>manual</b>.
              </p>
              {CONTACT_FORM && <ContactButton form={CONTACT_FORM} />}
            </div>
            <nav className="footer-col" aria-label="Use gitmanual">
              <h2>Use it</h2>
              <Link href="/">Look up a repo</Link>
              <Link href="/shelf">The shelf</Link>
              <Link href="/lists">Lists</Link>
              <Link href="/private">Private repos</Link>
              <Link href="/how-it-works">How it works</Link>
              <Link href="/developers">API &amp; MCP</Link>
              {PRO && <Link href="/pro">GitManual Pro</Link>}
              {finds && <Link href="/finds">{finds}</Link>}
              {EXTENSION_URL && (
                <a href={EXTENSION_URL} target="_blank" rel="noreferrer">
                  Chrome extension&nbsp;↗
                </a>
              )}
            </nav>
            {repo && (
              <nav className="footer-col" aria-label="Open source">
                <h2>Open source</h2>
                <a href={repo} target="_blank" rel="noreferrer">
                  GitHub&nbsp;↗
                </a>
                <a href={`${repo}/issues/new/choose`} target="_blank" rel="noreferrer">
                  Report a wrong setup&nbsp;↗
                </a>
                <a href={`${repo}/blob/main/docs/self-hosting.md`} target="_blank" rel="noreferrer">
                  Host your own&nbsp;↗
                </a>
                <a href={`${repo}#whats-in-every-manual`} target="_blank" rel="noreferrer">
                  Badge for your README&nbsp;↗
                </a>
              </nav>
            )}
          </div>
          <div className="wrap footer-base">
            <span>© {new Date().getFullYear()} gitmanual · MIT license</span>
            <nav className="footer-legal" aria-label="About this site">
              <Link href="/about">About</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/contact">Contact</Link>
            </nav>
            <span>Reads public data from GitHub. Always read commands before you run them.</span>
          </div>
        </footer>
        {/* Cookie-free page views, sent only from a Vercel deployment with Analytics turned on. */}
        <Analytics />
      </body>
    </html>
  );
}
