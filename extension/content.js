// Adds "Setup manual" and "Ask" buttons next to the repo name on GitHub repo pages. It only reads the repo's name
// from the page (GitHub's own <meta> tag): "Setup manual" links to gitmanual, "Ask" opens the side panel
// (sidepanel.js), which asks this script for the name. No requests from here, no data collected.
const SITE = "https://gitmanual.com";
const ID = "gitmanual-open";
const ASK_ID = "gitmanual-ask";
// The Ask button's icon: the gitmanual box (as on Setup manual) with a sparkle on its corner, so it reads as
// gitmanual's and as AI at once. The sparkle's outline is the page's background, to keep it apart from the box.
const ASK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="16" viewBox="0 0 32 26" fill="none" aria-hidden="true"><path d="M13 2l10 5v12l-10 5-10-5V7z" fill="#ff6b2c" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 7l10 5 10-5M13 12v12" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M6 13l2.4 1.8L6 17.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path transform="translate(17 -0.5) scale(1.1)" d="M7.5 1l1.6 4.4L13.5 7l-4.4 1.6L7.5 13 5.9 8.6 1.5 7l4.4-1.6z" fill="currentColor" stroke-width="2.2" stroke-linejoin="round" paint-order="stroke" style="stroke: var(--bgColor-default, var(--color-canvas-default, #fff))"/></svg>';
const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 26 26" fill="none" aria-hidden="true"><path d="M13 2l10 5v12l-10 5-10-5V7z" fill="#ff6b2c" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 7l10 5 10-5M13 12v12" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M6 13l2.4 1.8L6 17.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// GitHub sets this on every repo page, with the canonical owner/repo (whatever case the URL used).
function currentRepo() {
  const nwo = document.querySelector('meta[name="octolytics-dimension-repository_nwo"]')?.content;
  return nwo && /^[\w.-]+\/[\w.-]+$/.test(nwo) ? nwo : null;
}

const svg = (markup) => new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;

let told = null;
function render() {
  const repo = currentRepo();
  // The side panel follows the repo in this tab; tell it when that changes (nobody listening is fine).
  if (repo !== told) {
    told = repo;
    chrome.runtime.sendMessage({ type: "gitmanual-repo-changed", repo }).catch(() => {});
  }
  const old = document.getElementById(ID);
  if (old && old.dataset.repo === repo && old.isConnected && document.getElementById(ASK_ID)?.isConnected) return;
  old?.remove();
  document.getElementById(ASK_ID)?.remove();
  if (!repo) return;

  const link = document.createElement("a");
  link.id = ID;
  link.dataset.repo = repo;
  link.href = `${SITE}/${repo}`;
  link.target = "_blank";
  link.rel = "noopener";
  link.className = "btn btn-sm";
  link.title = "Will it run on your device, and how to set it up: open the manual on gitmanual";
  // Built from a fixed string without innerHTML, so store reviewers (and anyone reading) can see nothing dynamic goes in as markup.
  link.append(svg(ICON), Object.assign(document.createElement("span"), { textContent: "Setup manual" }));

  const ask = document.createElement("button");
  ask.id = ASK_ID;
  ask.type = "button";
  ask.className = "btn btn-sm";
  ask.title = "Ask GitManual AI Agent how to set up this repo, in the side panel";
  ask.setAttribute("aria-label", "Ask GitManual AI Agent about this repo");
  ask.append(svg(ASK_ICON), Object.assign(document.createElement("span"), { textContent: "Ask AI" }));
  ask.addEventListener("click", () => chrome.runtime.sendMessage({ type: "gitmanual-open-chat", repo }));

  // On the repo's home page: in the row with the repo name, after the title block (inside it, it would wrap
  // under the name). Pages without that header (issues, folders…) get a small floating button.
  const title = document.getElementById("repo-title-component");
  const row = title?.parentElement?.parentElement;
  if (row && getComputedStyle(row).display.includes("flex")) title.parentElement.after(link, ask);
  else if (title) title.after(link, ask);
  else {
    link.classList.add("gitmanual-float");
    ask.classList.add("gitmanual-float", "gitmanual-float-ask");
    document.body.append(link, ask);
  }
}

// The side panel asks which repo this tab shows.
chrome.runtime.onMessage.addListener((m, _sender, reply) => {
  if (m?.type === "gitmanual-repo") reply({ repo: currentRepo() });
});

render();
// GitHub swaps pages without a full reload (Turbo and its React router), so render again after each one.
for (const event of ["turbo:load", "turbo:render", "soft-nav:end", "popstate"]) addEventListener(event, () => setTimeout(render, 50));
new MutationObserver(() => render()).observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ["content"] });
