"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import { compactCount } from "@/lib/format";
import { parseRepoUrl } from "@/lib/github";
import type { Arch } from "@/lib/install";
import type { OS } from "@/lib/os";

export function detectOS(): OS {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const p = `${nav.userAgentData?.platform ?? ""} ${navigator.platform} ${navigator.userAgent}`.toLowerCase();
  if (/mac|iphone|ipad/.test(p)) return "mac";
  if (/win/.test(p)) return "windows";
  return "linux";
}

// Chromium exposes the CPU architecture; other browsers don't, so this may stay null.
export async function detectArch(): Promise<Arch | null> {
  const nav = navigator as Navigator & {
    userAgentData?: { getHighEntropyValues?: (h: string[]) => Promise<{ architecture?: string; bitness?: string }> };
  };
  try {
    const v = await nav.userAgentData?.getHighEntropyValues?.(["architecture", "bitness"]);
    if (v?.architecture === "arm") return "arm64";
    if (v?.architecture === "x86") return v.bitness === "32" ? "x86" : "x64";
  } catch {}
  return null;
}

export function repoPath(input: string): string | null {
  const ref = parseRepoUrl(input);
  if (!ref) return null;
  return `/${ref.owner}/${ref.repo}${ref.ref ? `?ref=${encodeURIComponent(ref.ref)}` : ""}`;
}

export function RepoForm({ initial = "", size = "lg", autoFocus }: { initial?: string; size?: "lg" | "sm"; autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [going, setGoing] = useState(false);

  return (
    <form
      className={`addr addr-${size}`}
      onSubmit={(e) => {
        e.preventDefault();
        const path = repoPath(value);
        if (!path) {
          setError(value.trim() ? "That doesn't look like a GitHub repo. Try owner/repo." : "Paste a GitHub link first, for example github.com/BurntSushi/ripgrep.");
          return;
        }
        setError(null);
        setGoing(true);
        router.push(path);
      }}
    >
      <label className="addr-bar">
        <span className="addr-host" aria-hidden="true">
          git<s>hub</s>
          <b>manual</b>.com/
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="owner/repo"
          name="repo"
          aria-label="GitHub repository link"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
        />
      </label>
      <button className="btn btn-go" disabled={going}>
        {going ? <span className="spinner" /> : null}
        {going ? "Opening…" : "Get the manual"}
      </button>
      {error && (
        <p className="addr-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function Logo({ size = 26 }: { size?: number }) {
  // A flat-pack box with a prompt on the side: open source, some assembly required.
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path d="M13 2l10 5v12l-10 5-10-5V7z" fill="var(--wrench)" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3 7l10 5 10-5M13 12v12" stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M6 13l2.4 1.8L6 17.6" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CopyButton({ text, className = "copy", label = "Copy" }: { text: string; className?: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`${className}${done ? " done" : ""}`}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      <span aria-live="polite">{done ? "Copied ✓" : label}</span>
    </button>
  );
}

export function CodeBlock({ text }: { text: string }) {
  return (
    <div className="code">
      <pre translate="no">{text}</pre>
      <CopyButton text={text} label="Copy" />
    </div>
  );
}

export function Wrenches({ n, of = 3 }: { n: number; of?: number }) {
  return (
    <span className="wrenches" aria-hidden="true">
      {Array.from({ length: of }, (_, i) => (
        <svg key={i} width="16" height="16" viewBox="0 0 24 24" className={i < n ? "on" : ""}>
          <path
            d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3.6 17.1a1.4 1.4 0 0 0 2 2l5.7-5.7a4 4 0 0 0 5.1-5.4l-2.4 2.4-2-.5-.5-2z"
            fill="currentColor"
            stroke="var(--ink)"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </span>
  );
}

const NAV = [
  ["/shelf", "The shelf"],
  ["/private", "Private repos", "Private"], // the short label is for phones
  ["/developers", "API & MCP", "API"],
  ["/how-it-works", "How it works"],
] as const;

// Every menu item looks the same; the current page is outlined. The product's pages come first; the curator's
// Finds (posts from the Facebook Page, so a Facebook mark) sit with the GitHub link after a divider, as the people
// behind it rather than part of the tool.
// The GitHub link only shows once the project's own repo is set (NEXT_PUBLIC_REPO_URL).
export function NavLinks({ repo, stars, finds }: { repo: string | null; stars: number | null; finds: string | null }) {
  const path = usePathname();
  return (
    <>
      {path !== "/" && <NavSearch />}
      <nav className="nav-links" aria-label="Site">
        {NAV.map(([href, label, short]: readonly [string, string, string?]) => (
          <Link key={href} href={href} aria-current={path === href ? "page" : undefined} aria-label={short ? label : undefined}>
            {short ? (
              <>
                <span className="nav-full">{label}</span>
                <span className="nav-short">{short}</span>
              </>
            ) : (
              label
            )}
          </Link>
        ))}
        {finds && (
          <Link className="nav-finds" href="/finds" aria-current={path === "/finds" ? "page" : undefined} aria-label={finds} title={finds}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"
              />
            </svg>
          </Link>
        )}
        {repo && (
          <a
            className="nav-gh"
            href={repo}
            target="_blank"
            rel="noreferrer"
            aria-label={stars !== null ? `Star gitmanual on GitHub (${stars} stars)` : "gitmanual on GitHub"}
          >
            <span className="nav-gh-label">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                fill="currentColor"
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"
              />
            </svg>
            Star
            </span>
            {stars !== null && (
              <span className="nav-stars num">
                <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
                  <path fill="currentColor" d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
                </svg>
                {compactCount(stars)}
              </span>
            )}
          </a>
        )}
      </nav>
    </>
  );
}

// A compact address bar for inner pages, so a new repo can be looked up from anywhere. "/" focuses it.
function NavSearch() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      className={`nav-search${bad ? " bad" : ""}`}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const path = repoPath(value);
        if (!path) return setBad(true);
        setValue("");
        input.current?.blur();
        router.push(path);
      }}
    >
      <input
        ref={input}
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setBad(false);
        }}
        placeholder="Look up a repo: owner/repo"
        aria-label="Look up a GitHub repo"
        aria-invalid={bad || undefined}
        autoComplete="off"
        spellCheck={false}
      />
      <kbd aria-hidden="true">/</kbd>
    </form>
  );
}

// "Contact": our own dialog around the site owner's ShareText form (CONTACT_FORM_URL).
// The form stays in its iframe, so what people type never touches this page. Nothing loads from
// sharetext.net until the dialog opens; their small script then sizes the frame to the form.
export const OPEN_CONTACT = "gitmanual:contact";

export function ContactButton({ form }: { form: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(false);

  const open = useCallback(() => {
    setOpened(true);
    dialog.current?.showModal();
    if (!document.querySelector("script[data-sharetext-resize]")) {
      const script = document.createElement("script");
      script.src = new URL("/forms-embed.js", form).href;
      script.async = true;
      script.dataset.sharetextResize = "";
      document.head.append(script);
    }
  }, [form]);

  // Other parts of the page (the "Advertise here" link in the ad box) open this same form.
  useEffect(() => {
    window.addEventListener(OPEN_CONTACT, open);
    return () => window.removeEventListener(OPEN_CONTACT, open);
  }, [open]);

  return (
    <>
      <button type="button" className="btn btn-sm contact-open" onClick={open} aria-haspopup="dialog">
        Contact
      </button>
      <dialog
        ref={dialog}
        className="contact"
        aria-labelledby="contact-h"
        // A click on the backdrop (the dialog itself, outside its box) closes it.
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      >
        <div className="contact-box">
          <div className="contact-head">
            <div>
              <h2 id="contact-h">Contact</h2>
              <p>Questions, feedback or advertising.</p>
            </div>
            <button type="button" className="contact-close" onClick={() => dialog.current?.close()} aria-label="Close">
              ×
            </button>
          </div>
          {opened && <iframe src={form} title="Contact form" className="contact-frame" />}
        </div>
      </dialog>
    </>
  );
}

// A one-line "live on Product Hunt" strip above the menu while PRODUCT_HUNT_URL is set. Closing it hides it for this
// launch on this browser (a new launch link shows it again).
export function LaunchBanner({ url }: { url: string }) {
  const key = `gitmanual-launch-closed:${url}`;
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(key)) setClosed(true);
    } catch {}
  }, [key]);
  if (closed) return null;
  return (
    <div className="launch" role="region" aria-label="Product Hunt launch">
      <a href={url} target="_blank" rel="noreferrer">
        <b>We&apos;re live on Product Hunt today.</b> Come say hi and tell us what you think&nbsp;→
      </a>
      <button
        className="launch-x"
        aria-label="Close"
        onClick={() => {
          setClosed(true);
          try {
            localStorage.setItem(key, "1");
          } catch {}
        }}
      >
        ×
      </button>
    </div>
  );
}
