// "Ask about this repo" in the browser's side panel: the site's chat (app/chat.tsx) for whichever GitHub repo is
// open in the current tab, on the same endpoint, limits and checks (gitmanual.com/api/chat). The repo's name comes
// from the content script on that tab; nothing is read from other sites. Answers are built as DOM nodes from text,
// never as HTML, so nothing an answer contains can run here.
const SITE = "https://gitmanual.com";
const DAILY = 10; // lib/budget.ts, user pool
const CONVERSATION_MS = 60 * 60 * 1000; // CHAT.conversationMs in lib/chat.ts
const OS_LABEL = { mac: "macOS", windows: "Windows", linux: "Linux" };

const $ = (id) => document.getElementById(id);
const log = $("log");
const foot = $("foot");

let status = null; // { enabled, signedIn, login, pro, proOffer, allowance }
let repo = null;
let busy = false;
let question = "";
let os = detectOS();
// One chat per repo, so switching tabs and back keeps each: { turns, conversation, ended }.
const chats = new Map();

function detectOS() {
  const p = navigator.userAgentData?.platform || navigator.platform || "";
  return /mac|iphone|ipad/i.test(p) ? "mac" : /win/i.test(p) ? "windows" : "linux";
}

// Builds an element: el("p", { className: "note" }, "text", child…). Text always goes in as text.
function el(tag, props = {}, ...kids) {
  const node = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) node.append(k);
  return node;
}

const chat = () => {
  if (!chats.has(repo)) chats.set(repo, { turns: [], conversation: null, ended: false });
  return chats.get(repo);
};

// ---- Which repo, and who's signed in

async function activeRepo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  try {
    const r = await chrome.tabs.sendMessage(tab.id, { type: "gitmanual-repo" });
    return typeof r?.repo === "string" ? r.repo : null;
  } catch {
    return null; // not a GitHub page, or it hasn't loaded yet
  }
}

async function refreshRepo() {
  const next = await activeRepo();
  if (next === repo) return;
  repo = next;
  if (repo && status?.signedIn) await restore(repo);
  question = "";
  render();
}

async function refreshStatus() {
  try {
    const r = await fetch(`${SITE}/api/chat`, { credentials: "include", cache: "no-store" });
    status = await r.json();
  } catch {
    status = { enabled: false, offline: true };
  }
  if (status.signedIn && repo) await restore(repo);
  render();
}

// After "Sign in", check back every few seconds until it's done (the sign-in happens in a tab of its own).
let polling = null;
function waitForSignIn() {
  clearInterval(polling);
  const until = Date.now() + 5 * 60 * 1000;
  polling = setInterval(async () => {
    await refreshStatus();
    if (status?.signedIn || Date.now() > until) clearInterval(polling);
  }, 3000);
}

// ---- Keeping a chat for the hour the server keeps it

const key = (r) => `chat:${r}`;

async function restore(r) {
  if (chats.get(r)?.turns.length) return;
  const saved = (await chrome.storage.local.get(key(r)))[key(r)];
  if (saved?.login === status.login && saved.conversation?.expiresAt > Date.now() && saved.turns?.length) {
    chats.set(r, { turns: saved.turns, conversation: saved.conversation, ended: false });
  } else if (saved) await chrome.storage.local.remove(key(r));
}

function save(r) {
  const c = chats.get(r);
  if (!status?.login || !c) return;
  if (c.conversation && c.turns.length && !c.ended) chrome.storage.local.set({ [key(r)]: { login: status.login, conversation: c.conversation, turns: c.turns } });
  else chrome.storage.local.remove(key(r));
}

// ---- Asking

async function ask() {
  const q = question.trim();
  if (busy || !repo) return;
  if (!status?.signedIn) return signIn();
  if (!q) return;
  const r = repo;
  const c = chat();
  busy = true;
  question = "";
  const answer = { role: "assistant", text: "", reading: [], notices: [], checked: false };
  c.turns.push({ role: "user", text: q }, answer);
  render();
  try {
    const res = await fetch(`${SITE}/api/chat`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      // One id per question, so a resend after a dropped connection isn't charged twice.
      body: JSON.stringify({ conversationId: c.conversation?.id, repo: r, os, question: q, requestId: crypto.randomUUID() }),
    });
    if (!res.ok || !res.body) {
      const j = await res.json().catch(() => ({}));
      if (j.signIn) status = { ...status, signedIn: false };
      if (j.ended) {
        c.ended = true;
        c.conversation = null;
      }
      answer.error = j.error || "Couldn't answer right now. Try again later.";
      answer.upgrade = Boolean(j.upgrade);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) handle(JSON.parse(line), c, answer);
      if (r === repo) scheduleRender();
    }
  } catch {
    answer.error ??= "The connection dropped before the answer finished.";
  } finally {
    answer.checked = true;
    busy = false;
    save(r);
    render();
  }
}

function handle(e, c, a) {
  if (e.type === "start") {
    if (c.conversation?.id !== e.conversationId) c.conversation = { id: e.conversationId, commit: e.commit, expiresAt: Date.now() + CONVERSATION_MS };
  } else if (e.type === "text") a.text += e.text;
  else if (e.type === "reading") a.reading.push(e.path);
  else if (e.type === "notice") a.notices.push(e.message);
  else if (e.type === "checks") Object.assign(a, { citations: e.citations, risks: e.risks ?? [], checked: true });
  else if (e.type === "error") a.error = e.message;
  else if (e.type === "allowance") status = { ...status, pro: Boolean(e.pro), allowance: { used: e.used, limit: e.limit } };
}

// GitManual Pro opens on the site, in a new tab.
const proLink = (text) =>
  el("a", { href: `${SITE}/pro${repo ? `?back=${encodeURIComponent(`/${repo}#ask`)}` : ""}`, target: "_blank", rel: "noopener" }, text);

function signIn() {
  chrome.tabs.create({ url: `${SITE}/api/github/connect?signin=1&back=${encodeURIComponent(repo ? `/${repo}` : "/")}` });
  waitForSignIn();
}

// ---- Drawing

let frame = 0;
function scheduleRender() {
  if (!frame) frame = requestAnimationFrame(() => ((frame = 0), renderLog()));
}

function render() {
  $("repo").textContent = repo ?? "No repo open";
  $("repo").title = repo ?? "";
  $("os").value = os;
  // Answers left today, shared with the site: the server counts them per GitHub account.
  const left = status?.signedIn && status.allowance ? status.allowance.limit - status.allowance.used : null;
  const pro = Boolean(status?.signedIn && status.pro);
  $("left").hidden = left === null && !pro;
  $("left").textContent = pro ? "Pro" : left === null ? "" : `${left}/${status.allowance.limit} left today`;
  $("left").title = pro
    ? "GitManual Pro: unlimited answers"
    : "Answers left today, on gitmanual.com and here together. They come back at midnight UTC.";
  $("left").classList.toggle("low", !pro && left !== null && left <= 3);
  $("left").classList.toggle("pro", pro);
  $("new-chat").hidden = !(repo && status?.signedIn && chat().turns.length);
  $("new-chat").disabled = busy;
  renderLog();
  renderFoot();
}

function renderLog() {
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  log.replaceChildren();
  if (!status) return log.append(el("p", { className: "note" }, el("span", { className: "spinner" })));
  if (!status.enabled)
    return log.append(
      el("p", { className: "note" }, status.offline ? "Can't reach gitmanual.com right now. Check your connection and reopen the panel." : "Chat isn't available right now."),
    );
  if (!repo) return log.append(el("div", { className: "empty" }, el("p", { className: "empty-title" }, "Open a GitHub repo to ask about it."), el("p", { className: "note" }, "Go to any public repository on github.com and this panel follows along.")));

  const c = chat();
  if (!c.turns.length) log.append(emptyState());
  else log.append(el("p", { className: "note" }, `Answered from ${repo}'s own files, for ${OS_LABEL[os]}. Answers can be wrong: read commands before you run them.`));
  for (const t of c.turns) log.append(t.role === "user" ? el("p", { className: "q" }, t.text) : answerView(t, c));
  if (atBottom || busy) log.scrollTop = log.scrollHeight;
}

function emptyState() {
  const examples = [`How do I install it on ${OS_LABEL[os]}?`, "What do I need installed first?", "It says a port is already in use. What now?", "How do I update to a new version?"];
  const how = [
    "GitManual AI Agent reads the repo's own files, at today's commit",
    "Every fact names the file it came from",
    "Risky commands are flagged before you copy them",
  ];
  return el(
    "div",
    { className: "empty" },
    el("p", { className: "empty-title" }, "Stuck setting up ", el("strong", {}, repo), "? Ask."),
    el("ul", { className: "how" }, how.map((h, i) => el("li", {}, el("span", { ariaHidden: "true" }, `0${i + 1}`), h))),
    el("p", { className: "try" }, "Try one"),
    el(
      "div",
      { className: "examples" },
      examples.map((q) =>
        el("button", {
          type: "button",
          className: "example",
          textContent: q,
          onclick: () => {
            question = q;
            const box = foot.querySelector("textarea");
            // Through the input event, so the Ask button enables as if it had been typed.
            if (box) (box.value = q), box.dispatchEvent(new Event("input")), box.focus();
          },
        }),
      ),
    ),
  );
}

function answerView(a, c) {
  const box = el("div", { className: "a" });
  for (const p of a.reading) box.append(el("p", { className: "reading" }, "Read ", el("code", {}, p)));
  if (!a.text && !a.error && !a.checked) box.append(el("p", { className: "reading" }, el("span", { className: "spinner" }), "Reading the repo…"));
  if (a.text) box.append(markdown(a.text, a));
  for (const n of a.notices) box.append(el("p", { className: "notice" }, n));
  if (a.error) box.append(el("p", { className: "error" }, a.error, ...(a.upgrade ? [" ", proLink("Get Pro for unlimited answers"), "."] : [])));
  if (a.citations) {
    const note = citationNote(a.citations, c);
    if (note) box.append(note);
  }
  return box;
}

// Markdown to DOM: paragraphs, headings, lists, fenced code, `code`, **bold** and http(s) links. Enough for the
// answers' "short, skimmable" Markdown; anything else shows as its text.
function markdown(text, a) {
  const out = el("div", { className: "prose" });
  const lines = text.split("\n");
  let para = [];
  let list = null;
  let block = 0;
  const flush = () => {
    if (para.length) out.append(el("p", {}, inline(para.join(" "))));
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^(\s*)(```|~~~)/);
    if (fence) {
      flush();
      const body = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(fence[2]); i++) body.push(lines[i].startsWith(fence[1]) ? lines[i].slice(fence[1].length) : lines[i]);
      const closed = i < lines.length;
      // Indented under a list item, it belongs to that step; otherwise it ends the list.
      if (!fence[1]) list = null;
      (list?.lastElementChild ?? out).append(codeView(body.join("\n"), a.risks?.[block], a.checked && closed));
      block++;
      continue;
    }
    const item = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (item) {
      flush();
      const tag = /\d/.test(item[1]) ? "ol" : "ul";
      if (!list || list.tagName.toLowerCase() !== tag) out.append((list = el(tag)));
      list.append(el("li", {}, inline(item[2])));
      continue;
    }
    if (!line.trim()) {
      flush();
      if (!/^\s*([-*+]|\d+[.)])\s|^\s+\S/.test(lines[i + 1] ?? "")) list = null;
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      flush();
      list = null;
      out.append(el("p", { className: "h" }, inline(heading[1])));
      continue;
    }
    if (list && /^\s+\S/.test(line)) {
      list.lastElementChild.append(" ", ...inline(line.trim()));
      continue;
    }
    list = null;
    para.push(line.trim());
  }
  flush();
  return out;
}

function inline(text) {
  const parts = [];
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)<>]+[^\s)<>.,;:!?'"])/g;
  let at = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > at) parts.push(text.slice(at, m.index));
    if (m[1]) parts.push(el("code", {}, m[1]));
    else if (m[2]) parts.push(el("strong", {}, m[2]));
    else parts.push(el("a", { href: m[4] ?? m[5], target: "_blank", rel: "noreferrer" }, m[3] ?? m[5]));
    at = m.index + m[0].length;
  }
  parts.push(text.slice(at));
  return parts;
}

// A command. Its warning and copy button come once the whole answer has arrived and been checked, so nothing
// half-written can be copied.
function codeView(code, risks = [], ready) {
  const box = el("div", { className: `code${risks.length ? " risky" : ""}` });
  const warning = risks.length ? el("p", { className: "risk" }, el("span", {}, el("strong", {}, "Check before running: "), risks.map((r) => r.label).join(" · "))) : null;
  if (warning) box.append(warning);
  const inner = el("div", { className: "code-box" }, el("pre", { translate: false }, code));
  if (ready) {
    const label = risks.length ? "Copy anyway" : "Copy";
    const copy = el("button", { type: "button", className: "copy", textContent: label });
    copy.onclick = async () => {
      await navigator.clipboard.writeText(code);
      copy.textContent = "Copied";
      copy.classList.add("done");
      setTimeout(() => ((copy.textContent = label), copy.classList.remove("done")), 1500);
    };
    // "Copy anyway" sits in the warning bar, so it's read with the warning and never covers the command.
    (warning ?? inner).append(copy);
  }
  box.append(inner);
  return box;
}

function citationNote({ notRead = [], missing = [] }, c) {
  if (!notRead.length && !missing.length) return null;
  const commit = c.conversation?.commit ?? "HEAD";
  const join = (items) => items.flatMap((x, i) => (i ? [", ", x] : [x]));
  const box = el("div", { className: "cite" });
  if (missing.length)
    box.append(
      el(
        "p",
        {},
        el("strong", {}, "Not found in this repo: "),
        join(missing.map((p) => el("code", {}, p))),
        `. Fine if the answer has you create ${missing.length === 1 ? "it" : "them"}; otherwise treat that part with care.`,
      ),
    );
  if (notRead.length)
    box.append(
      el(
        "p",
        {},
        "Mentioned but not read by the agent: ",
        join(notRead.map((p) => el("a", { href: `https://github.com/${repo}/blob/${commit}/${p}`, target: "_blank", rel: "noreferrer" }, el("code", {}, p)))),
        `. Open ${notRead.length === 1 ? "it" : "them"} to check.`,
      ),
    );
  return box;
}

function renderFoot() {
  const box = foot.querySelector("textarea");
  const focused = document.activeElement === box;
  foot.replaceChildren();
  if (!status?.enabled || !repo) return foot.append(links());
  const c = chat();
  const left = status.allowance ? status.allowance.limit - status.allowance.used : null;

  if (status.signedIn && c.ended) foot.append(el("p", { className: "note" }, "This chat has ended. Start a new one to keep asking."));
  else if (status.signedIn && left === 0)
    foot.append(
      el(
        "p",
        { className: "note" },
        status.pro
          ? "You've reached today's fair-use limit. It resets at midnight UTC."
          : "You've used today's answers. They come back at midnight UTC; the manual still works.",
        ...(!status.pro && status.proOffer ? [" ", proLink("Get Pro"), " for unlimited answers."] : []),
      ),
    );
  else {
    const textarea = el("textarea", {
      value: question,
      maxLength: 2000,
      rows: 3,
      disabled: busy,
      placeholder: c.turns.length ? "Ask a follow-up…" : `Ask about setting it up on ${OS_LABEL[os]}…`,
      ariaLabel: "Your question",
      oninput: (e) => {
        question = e.target.value;
        send.disabled = busy || (status.signedIn && !question.trim());
      },
      onkeydown: (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          ask();
        }
      },
    });
    const send = el("button", { type: "submit", className: "btn btn-sm btn-go", disabled: busy || (status.signedIn && !question.trim()) }, busy ? el("span", { className: "spinner" }) : status.signedIn ? "Ask" : [githubIcon(), "Sign in to ask"]);
    const form = el(
      "form",
      {
        className: "form",
        onsubmit: (e) => {
          e.preventDefault();
          ask();
        },
      },
      textarea,
      el("div", { className: "form-bar" }, el("span", { className: "hint" }, "Enter to send"), send),
    );
    foot.append(form);
    if (focused || (!busy && status.signedIn)) textarea.focus({ preventScroll: true });
  }
  if (!status.signedIn) foot.append(el("p", { className: "left" }, `Free with GitHub sign-in · ${DAILY} answers a day · we see your username, not your repos`));
  foot.append(links());
}

// GitHub's mark, drawn as nodes rather than parsed markup.
function githubIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute("d", "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z");
  svg.append(path);
  return svg;
}

function links() {
  return el(
    "p",
    { className: "links" },
    repo ? el("a", { href: `${SITE}/${repo}`, target: "_blank", rel: "noopener" }, "Open the setup manual ↗") : el("span"),
    el("a", { href: `${SITE}/privacy`, target: "_blank", rel: "noopener" }, "Privacy"),
  );
}

// ---- Wiring

$("os").addEventListener("change", (e) => {
  os = e.target.value;
  chrome.storage.local.set({ os });
  render();
});
$("new-chat").addEventListener("click", () => {
  chats.set(repo, { turns: [], conversation: null, ended: false });
  save(repo);
  render();
});

// The panel follows the tab: switching tabs, a page finishing loading, or GitHub's in-page navigation (the
// content script says when the repo changes).
// Answers asked on the site count too, so the count is checked again on the way back to the panel.
chrome.tabs.onActivated.addListener(() => (refreshRepo(), busy || refreshStatus()));
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && !busy && refreshStatus());
chrome.tabs.onUpdated.addListener((_id, change, tab) => tab.active && change.status === "complete" && refreshRepo());
chrome.runtime.onMessage.addListener((m, sender) => {
  if (m?.type === "gitmanual-repo-changed" && sender.tab?.active) refreshRepo();
});
// Coming back to the panel (after signing in in a tab, say) checks again.
addEventListener("focus", refreshStatus);

(async () => {
  const saved = await chrome.storage.local.get("os");
  if (saved.os in OS_LABEL) os = saved.os;
  repo = await activeRepo();
  render();
  await refreshStatus();
})();
