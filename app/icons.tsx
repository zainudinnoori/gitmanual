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
