import type { ReactNode } from "react";
import type { OS } from "@/lib/os";

// Small marks for the systems and for what a list is about. Decorative: the text next to them says the same thing.

export function OsIcon({ os, size = 16 }: { os: OS; size?: number }) {
  const props = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true, className: "os-icon" } as const;
  if (os === "mac")
    return (
      <svg {...props}>
        <path
          fill="currentColor"
          d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
        />
      </svg>
    );
  if (os === "windows")
    return (
      <svg {...props}>
        <path fill="currentColor" d="M2 2h9.5v9.5H2zM12.5 2H22v9.5h-9.5zM2 12.5h9.5V22H2zM12.5 12.5H22V22h-9.5z" />
      </svg>
    );
  // Linux: a simplified Tux.
  return (
    <svg {...props}>
      <ellipse cx="12" cy="13" rx="7" ry="9.5" fill="currentColor" />
      <ellipse cx="12" cy="15.5" rx="4.6" ry="6" fill="#fff" />
      <circle cx="10" cy="8" r="1.5" fill="#fff" />
      <circle cx="14" cy="8" r="1.5" fill="#fff" />
      <circle cx="10.3" cy="8.2" r=".7" fill="currentColor" />
      <circle cx="13.7" cy="8.2" r=".7" fill="currentColor" />
      <path d="M10.2 10.2h3.6L12 12.2z" fill="#f5a524" />
      <ellipse cx="8.2" cy="22" rx="2.6" ry="1.2" fill="#f5a524" />
      <ellipse cx="15.8" cy="22" rx="2.6" ry="1.2" fill="#f5a524" />
    </svg>
  );
}

// One line drawing per list theme (lib/lists.ts), in the site's outlined style.
const THEME_PATHS: Record<string, ReactNode> = {
  // a rack server
  "self-hosted-apps": (
    <>
      <rect x="3" y="3.5" width="18" height="7" rx="1.8" />
      <rect x="3" y="13.5" width="18" height="7" rx="1.8" />
      <path d="M7 7h.01M7 17h.01M11 7h6M11 17h6" />
    </>
  ),
  // sparkles
  "ai-tools": (
    <>
      <path d="M10 3.5l1.6 4.4 4.4 1.6-4.4 1.6L10 15.5l-1.6-4.4L4 9.5l4.4-1.6z" />
      <path d="M18 14l.8 2.2 2.2.8-2.2.8L18 20l-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  // a terminal prompt
  "command-line-tools": (
    <>
      <rect x="2.5" y="4" width="19" height="16" rx="2.5" />
      <path d="M6.5 9.5l3 2.5-3 2.5M12 15h5" />
    </>
  ),
  // a plug
  "mcp-servers": (
    <>
      <path d="M9 3v4M15 3v4" />
      <path d="M6 7h12v4a6 6 0 0 1-12 0z" />
      <path d="M12 17v4" />
    </>
  ),
  // a chip
  "local-llms": (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M10 10h4v4h-4zM9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5" />
    </>
  ),
  // code brackets with a spark
  "ai-coding-tools": (
    <>
      <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
      <path d="M12 8.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" />
    </>
  ),
  // a picture
  "image-generation": (
    <>
      <rect x="3" y="3.5" width="18" height="17" rx="2.5" />
      <circle cx="9" cy="9.5" r="1.8" />
      <path d="M21 16l-5-5-9 9.5" />
    </>
  ),
  // a microphone
  "speech-and-voice": (
    <>
      <rect x="9" y="2.5" width="6" height="12" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v4M8.5 21.5h7" />
    </>
  ),
  // a wrench
  "developer-tools": <path d="M14.7 6.3a4 4 0 0 0 5 5L21 10a5.5 5.5 0 0 1-7-7l-1.3 1.3a4 4 0 0 0 2 2zM13.5 8.5l-9.5 9.5a2 2 0 0 0 2.8 2.8l9.5-9.5" />,
  // a database cylinder
  databases: (
    <>
      <ellipse cx="12" cy="5.5" rx="8" ry="3" />
      <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  // a spider web
  "web-scraping-tools": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9M12 3c-2.5 2.5-3.8 5.5-3.8 9s1.3 6.5 3.8 9" />
    </>
  ),
  // a notebook
  "note-taking-apps": (
    <>
      <rect x="5" y="2.5" width="14" height="19" rx="2" />
      <path d="M9 7.5h6M9 11.5h6M9 15.5h3M3 7h2M3 12h2M3 17h2" />
    </>
  ),
  // a play button
  "video-and-audio-tools": (
    <>
      <rect x="2.5" y="4.5" width="19" height="15" rx="3" />
      <path d="M10 9l5 3-5 3z" />
    </>
  ),
  // a shield
  "privacy-and-security": (
    <>
      <path d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z" />
      <path d="M8.5 12l2.5 2.5 4.5-4.5" />
    </>
  ),
  // stacked pages
  "static-site-generators": (
    <>
      <path d="M12 3l9 4.5-9 4.5-9-4.5z" />
      <path d="M3 12l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5" />
    </>
  ),
  // a PC with a download arrow
  "apps-with-a-download": (
    <>
      <rect x="2.5" y="3.5" width="19" height="13" rx="2" />
      <path d="M8 20.5h8M12 16.5v4M12 6.5v6M9.5 10l2.5 2.5 2.5-2.5" />
    </>
  ),
};

export function ThemeIcon({ theme, size = 22 }: { theme: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {THEME_PATHS[theme]}
    </svg>
  );
}
