// Who runs this deployment, from its own settings, so a fork's pages describe the fork.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
export const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL?.replace(/\/$/, "") || null;
// "https://github.com/zainudinnoori/gitmanual" → "zainudinnoori"
export const OWNER = REPO_URL?.match(/github\.com\/([\w.-]+)/)?.[1] ?? null;
export const CONTACT_FORM = /^https:\/\/[^\s"]+$/.test(process.env.CONTACT_FORM_URL ?? "") ? process.env.CONTACT_FORM_URL! : null;
export const SITE_HOST = new URL(SITE_URL).host;
