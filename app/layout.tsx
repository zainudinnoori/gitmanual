import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { Logo } from "./ui";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display" });
const sans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "gitsetup — setup manuals for open source",
  description: "Paste a GitHub URL: see if it works on your device, what you need, and the step-by-step setup for macOS, Windows and Linux.",
};

export const viewport: Viewport = { themeColor: "#f2f3f5" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
              gitsetup
            </Link>
            <nav className="nav-links" aria-label="Examples">
              <Link href="/BurntSushi/ripgrep">ripgrep</Link>
              <Link href="/ollama/ollama">ollama</Link>
              <Link href="/fastapi/fastapi">fastapi</Link>
              <span className="proto">Prototype</span>
            </nav>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="footer">
          <div className="wrap footer-inner">
            <span>gitsetup · prototype</span>
            <span>Reads public data from GitHub. Always read commands before you run them.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
