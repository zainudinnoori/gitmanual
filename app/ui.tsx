"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
          <b>setup</b>.com/
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
        {going ? "Opening…" : "Get the setup"}
      </button>
      {error && (
        <p className="addr-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function Logo() {
  // A flat-pack box with a prompt on the side: open source, some assembly required.
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
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
