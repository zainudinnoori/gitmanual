import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SITE } from "@/lib/lookup";
import { githubApp } from "@/lib/session";
import { CodeBlock, CopyButton } from "../ui";
import { ENDPOINTS, ERRORS, MCP_TOOLS, type Endpoint } from "./endpoints";
import { KeyPanel } from "./key";
import { TryIt } from "./try";

export const metadata: Metadata = {
  title: "API and MCP server docs",
  description:
    "Use gitmanual from code and AI agents: setup manuals, search, lists and alternatives as JSON, Markdown or MCP tools. Free, with optional API keys and private repos.",
  alternates: { canonical: "/developers" },
};

// Keep in step with lib/limit.ts (apiAnon, apiKey) and lib/apikeys.ts.
const ACCESS = [
  ["Requests (any endpoint or MCP tool)", "60 an hour", "1,000 an hour"],
  ["…of which new repos (read from GitHub)", "10 a day", "200 an hour"],
  ["Private repos (with your GitHub token)", "No", "Yes"],
  ["See your usage", "No", "Yes"],
];

const NAV: { group: string; items: [id: string, label: string, method?: string][] }[] = [
  {
    group: "Getting started",
    items: [
      ["overview", "Overview"],
      ["quick-start", "Quick start"],
      ["key", "Your API key"],
      ["auth", "Authentication"],
      ["limits", "Limits"],
    ],
  },
  { group: "Endpoints", items: ENDPOINTS.map((e): [string, string, string] => [e.id, e.title, "GET"]) },
  {
    group: "Guides",
    items: [
      ["mcp", "MCP server"],
      ["private", "Private repos"],
      ["tools", "Postman and Swagger"],
      ["errors", "Errors"],
      ["data", "What a key stores"],
    ],
  },
];

function Table({ head, rows, codeFirst }: { head: string[]; rows: (string | ReactNode)[][]; codeFirst?: boolean }) {
  return (
    <div className="doc-table-wrap">
      <table className="doc-table">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th scope="col" key={i}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([first, ...rest], i) => (
            <tr key={i}>
              <th scope="row">{codeFirst ? <code>{first}</code> : first}</th>
              {rest.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EndpointCard({ e }: { e: Endpoint }) {
  return (
    <section className="endpoint" id={e.id} aria-labelledby={`${e.id}-h`}>
      <div className="endpoint-text">
        <div className="endpoint-head">
          <span className="method">GET</span>
          <code className="endpoint-path">{e.path}</code>
        </div>
        <h3 id={`${e.id}-h`}>{e.title}</h3>
        <p>{e.summary}</p>
        <p className="endpoint-limit">{e.limit}</p>
        {e.params.length > 0 && (
          <>
            <h4>Parameters</h4>
            <Table
              head={["Name", "About"]}
              rows={e.params.map((p) => [
                <span key="n" className="param">
                  <code>{p.name}</code>
                  <span className="param-type">{p.type}</span>
                  {p.required && <span className="required">Required</span>}
                </span>,
                p.about,
              ])}
            />
          </>
        )}
        <h4>Response fields</h4>
        <Table
          head={["Field", "About"]}
          rows={e.fields.map(([name, type, about]) => [
            <span key="n" className="param">
              <code>{name}</code>
              <span className="param-type">{type}</span>
            </span>,
            about,
          ])}
        />
      </div>
      <div className="endpoint-code">
        <TryIt site={SITE} path={e.path} params={e.params} example={e.example} response={e.response} />
      </div>
    </section>
  );
}

export default function Developers() {
  const mcp = `{
  "mcpServers": {
    "gitmanual": {
      "url": "${SITE}/mcp",
      "headers": { "Authorization": "Bearer gm_your_key" }
    }
  }
}`;
  return (
    <div className="wrap api-docs">
      <nav className="api-nav" aria-label="On this page">
        {NAV.map(({ group, items }) => (
          <div key={group} className="api-nav-group">
            <p className="api-nav-h">{group}</p>
            <ol>
              {items.map(([id, label, method]) => (
                <li key={id}>
                  <a href={`#${id}`}>
                    {method && <span className="method method-sm">{method}</span>}
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </nav>

      <article className="api-main">
        <header className="doc-head" id="overview">
          <p className="eyebrow">API and MCP</p>
          <h1 className="display-md">gitmanual for code and AI agents</h1>
          <p className="lead">
            The same setup manuals as the website, plus search, lists and alternatives, as JSON, Markdown or MCP tools. It works without a
            key; a free key raises the limits and opens private repos.
          </p>
          <dl className="api-facts">
            <div>
              <dt>Base URL</dt>
              <dd>
                <code>{SITE}/api/v1</code>
              </dd>
            </div>
            <div>
              <dt>MCP</dt>
              <dd>
                <code>{SITE}/mcp</code>
              </dd>
            </div>
            <div>
              <dt>Format</dt>
              <dd>JSON (manuals also as Markdown)</dd>
            </div>
            <div>
              <dt>Cost</dt>
              <dd>Free</dd>
            </div>
          </dl>
        </header>

        <section id="quick-start" className="api-section">
          <h2>Quick start</h2>
          <ol className="api-steps">
            <li>
              <b>Try it, no key needed.</b>
              <CodeBlock text={`curl "${SITE}/api/v1/manual?repo=ollama/ollama&os=mac&format=md"`} />
            </li>
            <li>
              <b>Get a free key</b> below, for higher limits and private repos, and send it as a header:
              <CodeBlock text={`curl -H "Authorization: Bearer gm_your_key" \\\n  "${SITE}/api/v1/search?q=self-hosted&os=linux"`} />
            </li>
            <li>
              <b>Or add it to your AI agent</b> as an MCP server (Claude, Cursor, VS Code and others):
              <CodeBlock text={mcp} />
            </li>
          </ol>
        </section>

        <section id="key" className="api-section">
          <h2>Your API key</h2>
          <KeyPanel appAvailable={Boolean(githubApp())} />
        </section>

        <section id="auth" className="api-section">
          <h2>Authentication</h2>
          <p>Both headers are optional. Without them you get everything public, at the lower limit.</p>
          <Table
            head={["Header", "Value", "What for"]}
            codeFirst
            rows={[
              ["Authorization", <code key="v">Bearer gm_…</code>, "Your gitmanual API key: higher limits, private repos and usage."],
              ["X-GitHub-Token", <code key="v">github_pat_…</code>, "Private repos only: your own read-only GitHub token. Needs an API key too."],
            ]}
          />
          <p>Keep your key out of web pages and public code: anyone with it can use your limits. If it leaks, replace it above.</p>
        </section>

        <section id="limits" className="api-section">
          <h2>Limits</h2>
          <Table head={["", "No key", "Free key"]} rows={ACCESS} />
          <p>
            A new repo is one gitmanual hasn&apos;t read from GitHub before; it counts toward both limits. Over a limit, you get{" "}
            <code>429</code> with a <code>Retry-After</code> header in seconds. Need more? <Link href="/contact">Get in touch</Link>.
          </p>
        </section>

        <section className="api-section" aria-labelledby="endpoints-h">
          <h2 id="endpoints-h">Endpoints</h2>
          <p>
            All are <code>GET</code>, answer JSON and allow requests from any website (CORS). Pick your language once and every example
            follows; <b>Send request</b> runs it live.
          </p>
          {ENDPOINTS.map((e) => (
            <EndpointCard key={e.id} e={e} />
          ))}
        </section>

        <section id="mcp" className="api-section">
          <h2>MCP server</h2>
          <p>
            Add <code>{SITE}/mcp</code> (Streamable HTTP) to any MCP client. The tools match the endpoints and answer in Markdown that agents
            read well. Headers are the same as the API&apos;s and optional.
          </p>
          <Table head={["Tool", "Inputs", "What it does"]} codeFirst rows={MCP_TOOLS} />
          <CodeBlock text={mcp} />
        </section>

        <section id="tools" className="api-section">
          <h2>Postman, Swagger and code generators</h2>
          <p>
            The whole API is described in one <a href="/api/v1/openapi.json">OpenAPI file</a>, so you can explore it in your own tools or
            generate a client in any language.
          </p>
          <div className="api-tools">
            <div className="api-tool">
              <b>Postman</b>
              <span>
                <b>Import</b> → <b>Link</b>, and paste the OpenAPI link.
              </span>
              <CopyButton text={`${SITE}/api/v1/openapi.json`} label="Copy the OpenAPI link" className="btn btn-sm" />
            </div>
            <div className="api-tool">
              <b>Swagger</b>
              <span>Every endpoint with a form to try it.</span>
              <a className="btn btn-sm" href={`https://editor.swagger.io/?url=${encodeURIComponent(`${SITE}/api/v1/openapi.json`)}`} target="_blank" rel="noreferrer">
                Open in Swagger Editor ↗
              </a>
            </div>
            <div className="api-tool">
              <b>OpenAPI file</b>
              <span>For code generators and AI agents.</span>
              <a className="btn btn-sm" href="/api/v1/openapi.json" target="_blank" rel="noreferrer">
                openapi.json ↗
              </a>
            </div>
          </div>
        </section>

        <section id="private" className="api-section">
          <h2>Private repos</h2>
          <ol className="api-steps">
            <li>
              Make a{" "}
              <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
                fine-grained GitHub token
              </a>{" "}
              with <b>Contents: Read-only</b>, for just the repos you want.
            </li>
            <li>
              Send it as <code>X-GitHub-Token</code>, together with your API key:
              <CodeBlock
                text={`curl -H "Authorization: Bearer gm_your_key" \\\n  -H "X-GitHub-Token: github_pat_…" \\\n  "${SITE}/api/v1/manual?repo=your-org/internal-app&format=md"`}
              />
            </li>
          </ol>
          <p>
            Public repos ignore the token. A private repo is read for that request only: the answer says <code>&quot;private&quot;: true</code>
            , and it&apos;s never saved, cached or sent to an AI service. On the website, use <Link href="/private">Private repos</Link>{" "}
            instead.
          </p>
        </section>

        <section id="errors" className="api-section">
          <h2>Errors</h2>
          <p>
            Errors are JSON with a message you can show people: <code>{`{ "error": "That API key isn't valid. …" }`}</code>
          </p>
          <Table head={["Status", "Name", "When"]} rows={ERRORS} />
        </section>

        <section id="data" className="api-section">
          <h2>What a key stores</h2>
          <p>
            Your GitHub username and account number, when the key was made and last used, and how many requests it has made. The key itself
            is stored only as a fingerprint (a SHA-256 hash), so it&apos;s shown to you once. Signing in gives gitmanual no access to your
            repos. Delete the key above any time; see the <Link href="/privacy">privacy policy</Link>.
          </p>
        </section>
      </article>
    </div>
  );
}
