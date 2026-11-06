// The toolbar button: on a GitHub repo it opens that repo's manual, anywhere else gitmanual's home page.
// It reads the tab's address only when clicked (the activeTab permission), and never anything else.
const NOT_OWNERS = /^(features|about|pricing|topics|collections|trending|sponsors|marketplace|orgs|settings|login|join|apps|enterprise|explore|notifications|new|search|codespaces|issues|pulls|users)$/i;

chrome.action.onClicked.addListener((tab) => {
  const m = tab.url?.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)/);
  const url = m && !NOT_OWNERS.test(m[1]) ? `https://gitmanual.com/${m[1]}/${m[2].replace(/\.git$/, "")}` : "https://gitmanual.com";
  chrome.tabs.create({ url, index: tab.index + 1 });
});
