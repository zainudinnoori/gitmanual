"use client";

import { useEffect, useState } from "react";
import { CopyButton } from "../ui";
import { exampleUrl, type Param } from "./endpoints";

// An endpoint's right-hand column on /developers: the request in curl, JavaScript or Python (the choice is shared by
// every endpoint and remembered), its parameters to edit, "Send request" to run it live from this browser, and the
// answer: the example until it's run, then the real one with its status and time.

const LANGS = ["curl", "JavaScript", "Python"] as const;
type Lang = (typeof LANGS)[number];
const LANG_KEY = "gitmanual-docs-lang";
const LANG_EVENT = "gitmanual-docs-lang";

function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>("curl");
  useEffect(() => {
    const read = () => {
      const saved = localStorage.getItem(LANG_KEY) as Lang | null;
      if (saved && LANGS.includes(saved)) setLang(saved);
    };
    read();
    window.addEventListener(LANG_EVENT, read);
    return () => window.removeEventListener(LANG_EVENT, read);
  }, []);
  const choose = (l: Lang) => {
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {}
    window.dispatchEvent(new Event(LANG_EVENT));
  };
  return [lang, choose];
}

function snippet(lang: Lang, url: string): string {
  const key = "gm_your_key";
  if (lang === "JavaScript")
    return `const res = await fetch("${url}", {
  headers: { Authorization: "Bearer ${key}" }, // optional
});
const data = await res.json();`;
  if (lang === "Python") {
    const [base, query] = url.split("?");
    const params = query ? [...new URLSearchParams(query)].map(([k, v]) => `"${k}": "${v}"`).join(", ") : "";
    return `import requests

res = requests.get(
    "${base}",${params ? `\n    params={${params}},` : ""}
    headers={"Authorization": "Bearer ${key}"},  # optional
)
data = res.json()`;
  }
  return `curl "${url}" \\\n  -H "Authorization: Bearer ${key}"  # optional`;
}

type Live = { status: number; ms: number; body: string; error?: boolean };

export function TryIt({ site, path, params, example, response }: { site: string; path: string; params: Param[]; example: Record<string, string>; response: string }) {
  const [lang, setLang] = useLang();
  const [values, setValues] = useState(example);
  const [live, setLive] = useState<Live | null>(null);
  const [busy, setBusy] = useState(false);
  const url = exampleUrl(site, { path, params }, values);
  const code = snippet(lang, url);
  const missing = params.filter((p) => p.required && !values[p.name]?.trim()).map((p) => p.name);

  async function send() {
    setBusy(true);
    const started = performance.now();
    try {
      // Same-site path, so it works on preview deploys and locally too.
      const res = await fetch(url.replace(site, ""), { cache: "no-store" });
      const text = await res.text();
      let body = text;
      try {
        body = JSON.stringify(JSON.parse(text), null, 2);
      } catch {}
      setLive({ status: res.status, ms: Math.round(performance.now() - started), body: body.length > 20000 ? `${body.slice(0, 20000)}\n…` : body });
    } catch {
      setLive({ status: 0, ms: 0, body: "The request didn't go through. Check your connection and try again.", error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tryit">
      <div className="try-box">
        <div className="try-bar">
          <div className="try-tabs" role="tablist" aria-label="Language">
            {LANGS.map((l) => (
              <button key={l} role="tab" aria-selected={lang === l} className={lang === l ? "on" : undefined} onClick={() => setLang(l)}>
                {l}
              </button>
            ))}
          </div>
          <CopyButton text={code} label="Copy" className="try-copy" />
        </div>
        <pre translate="no">{code}</pre>
      </div>

      <form
        className="try-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!missing.length) send();
        }}
      >
        {params.length > 0 && (
          <div className="try-fields">
            {params.map((p) => (
              <label key={p.name}>
                <span>
                  {p.name}
                  {p.required && <b aria-hidden="true">*</b>}
                </span>
                <input
                  value={values[p.name] ?? ""}
                  placeholder={p.type}
                  spellCheck={false}
                  autoComplete="off"
                  required={p.required}
                  onChange={(e) => setValues((v) => ({ ...v, [p.name]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        )}
        <div className="try-send">
          <button className="btn btn-go btn-sm" disabled={busy || missing.length > 0}>
            {busy ? "Sending…" : "Send request"}
          </button>
          <span className="try-note">Runs live, without a key (counts toward 60 an hour).</span>
        </div>
      </form>

      <div className="try-box">
        <div className="try-bar">
          <span className="try-status">
            {live ? (
              <>
                <i className={live.status >= 200 && live.status < 300 ? "ok" : "bad"} />
                {live.error ? "No answer" : `${live.status} · ${live.ms} ms`}
              </>
            ) : (
              "Example response"
            )}
          </span>
          {live && (
            <button className="link try-reset" onClick={() => setLive(null)}>
              Show example
            </button>
          )}
        </div>
        <pre translate="no" className="try-response">
          {live ? live.body : response}
        </pre>
      </div>
    </div>
  );
}
