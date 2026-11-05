import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { PICKS, sortedPicks } from "@/lib/picks";
import { Logo, NavLinks } from "./ui";
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
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="nav">
          <div className="wrap nav-inner">
            <Link className="wordmark" href="/">
              <Logo />
              gitmanual
            </Link>
            <NavLinks repo={REPO_URL} stars={await repoStars()} finds={(await sortedPicks()).length ? PICKS.curator : null} />
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="footer">
          <div className="wrap footer-inner">
            <span>gitmanual · open source</span>
            <span>Reads public data from GitHub. Always read commands before you run them.</span>
          </div>
        </footer>
        {/* Cookie-free page views, sent only from a Vercel deployment with Analytics turned on. */}
        <Analytics />
      </body>
    </html>
  );
}
