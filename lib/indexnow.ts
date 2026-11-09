import { after } from "next/server";
import { OS_LIST, OS_SLUG } from "./os";
import { SITE_HOST, SITE_URL } from "./site";

// IndexNow: tells Bing (which shares it with Yandex, Naver, Seznam and others) about a new manual right away, instead
// of waiting for a crawl. Bing also feeds ChatGPT search, Copilot and DuckDuckGo. Only on a live https site with
// INDEXNOW_KEY set; the key itself is served at /indexnow-key.txt to prove the site is ours.
export const INDEXNOW_KEY = /^[A-Za-z0-9-]{8,128}$/.test(process.env.INDEXNOW_KEY ?? "") ? process.env.INDEXNOW_KEY! : null;

// A repo's manual and its three per-system pages.
export function announceRepo(fullName: string) {
  if (!INDEXNOW_KEY || !SITE_URL.startsWith("https://")) return;
  const home = `${SITE_URL}/${fullName}`;
  const send = () =>
    fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: SITE_HOST,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/indexnow-key.txt`,
        urlList: [home, ...OS_LIST.map((os) => `${home}/${OS_SLUG[os]}`)],
      }),
    }).catch(() => {});
  // After the response, so the visitor doesn't wait; outside a request (scripts) it just goes now.
  try {
    after(send);
  } catch {
    void send();
  }
}
