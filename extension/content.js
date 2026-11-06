// Adds a "Setup manual" button next to the repo name on GitHub repo pages. It only reads the repo's name
// from the page (GitHub's own <meta> tag) and links to gitmanual: no requests, no data collected.
const SITE = "https://gitmanual.com";
const ID = "gitmanual-open";
const ICON =
  '<svg width="16" height="16" viewBox="0 0 26 26" fill="none" aria-hidden="true"><path d="M13 2l10 5v12l-10 5-10-5V7z" fill="#ff6b2c" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 7l10 5 10-5M13 12v12" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M6 13l2.4 1.8L6 17.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// GitHub sets this on every repo page, with the canonical owner/repo (whatever case the URL used).
function currentRepo() {
  const nwo = document.querySelector('meta[name="octolytics-dimension-repository_nwo"]')?.content;
  return nwo && /^[\w.-]+\/[\w.-]+$/.test(nwo) ? nwo : null;
}

function render() {
  const repo = currentRepo();
  const old = document.getElementById(ID);
  if (old && old.dataset.repo === repo && old.isConnected) return;
  old?.remove();
  if (!repo) return;

  const link = document.createElement("a");
  link.id = ID;
  link.dataset.repo = repo;
  link.href = `${SITE}/${repo}`;
  link.target = "_blank";
  link.rel = "noopener";
  link.className = "btn btn-sm";
  link.title = "Will it run on your device, and how to set it up: open the manual on gitmanual";
  link.innerHTML = `${ICON}<span>Setup manual</span>`;

  // On the repo's home page: in the row with the repo name, after the title block (inside it, it would wrap
  // under the name). Pages without that header (issues, folders…) get a small floating button.
  const title = document.getElementById("repo-title-component");
  const row = title?.parentElement?.parentElement;
  if (row && getComputedStyle(row).display.includes("flex")) title.parentElement.after(link);
  else if (title) title.after(link);
  else {
    link.classList.add("gitmanual-float");
    document.body.append(link);
  }
}

render();
// GitHub swaps pages without a full reload (Turbo and its React router), so render again after each one.
for (const event of ["turbo:load", "turbo:render", "soft-nav:end", "popstate"]) addEventListener(event, () => setTimeout(render, 50));
new MutationObserver(() => render()).observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ["content"] });
