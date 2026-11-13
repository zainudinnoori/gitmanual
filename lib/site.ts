// Who runs this deployment, from its own settings, so a fork's pages describe the fork.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL?.replace(/\/$/, "") || null;
// "https://github.com/zainudinnoori/gitmanual" → "zainudinnoori"
export const OWNER = REPO_URL?.match(/github\.com\/([\w.-]+)/)?.[1] ?? null;
export const CONTACT_FORM = /^https:\/\/[^\s"]+$/.test(process.env.CONTACT_FORM_URL ?? "") ? process.env.CONTACT_FORM_URL! : null;
export const SITE_HOST = new URL(SITE_URL).host;

// A page on this site to return to (a path, never another site), for links that go somewhere and come back.
export const sitePath = (path: string | null | undefined) => (path && /^\/(?!\/)[^\s\\]*$/.test(path) ? path : null);

// "Get Pro" from a page: /pro remembers it and, once the person has Pro, takes them back there.
export const proUrl = (back?: string | null) => (sitePath(back) ? `/pro?back=${encodeURIComponent(back!)}` : "/pro");

// Set for Pro accounts so the browser hides ads (lib/adfree.ts writes it, app/carbon.tsx and the layout read it).
export const AD_FREE_COOKIE = "gm_noads";
