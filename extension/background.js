// The toolbar button. In Chrome and Edge it opens the side panel (sidepanel.html), which asks about the repo in
// the current tab and links to its manual. Where there's no side panel (Firefox has its own sidebar instead), it
// opens the repo's manual, or gitmanual's home page off GitHub, reading the tab's address only when clicked.
const SITE = "https://gitmanual.com";
const NOT_OWNERS = /^(features|about|pricing|topics|collections|trending|sponsors|marketplace|orgs|settings|login|join|apps|enterprise|explore|notifications|new|search|codespaces|issues|pulls|users)$/i;

chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.action.onClicked.addListener((tab) => {
  const m = tab.url?.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)/);
  const url = m && !NOT_OWNERS.test(m[1]) ? `${SITE}/${m[1]}/${m[2].replace(/\.git$/, "")}` : SITE;
  chrome.tabs.create({ url, index: tab.index + 1 });
});

// "Ask" on a GitHub page opens the side panel. Opened straight away, while the click still counts as the
// person's; if the browser won't (no side panel, or it refuses), the chat opens on the repo's page instead.
chrome.runtime.onMessage.addListener((m, sender) => {
  if (m?.type !== "gitmanual-open-chat" || !sender.tab || !/^[\w.-]+\/[\w.-]+$/.test(m.repo ?? "")) return;
  const onSite = () => chrome.tabs.create({ url: `${SITE}/${m.repo}#ask`, index: sender.tab.index + 1 });
  if (!chrome.sidePanel?.open) return onSite();
  chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(onSite);
});
