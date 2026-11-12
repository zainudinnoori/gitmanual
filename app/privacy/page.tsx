import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_FORM, REPO_URL, SITE_HOST } from "@/lib/site";
import { DocPage } from "../doc";

const AI_GUIDES = Boolean(process.env.ANTHROPIC_API_KEY);
const CHAT = AI_GUIDES && process.env.CHAT_ENABLED === "on";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What gitmanual stores, what it doesn't, and which outside services are involved.",
  alternates: { canonical: "/privacy" },
};

// Keep this page true: update it whenever what the site stores or sends changes.
export default function Privacy() {
  return (
    <DocPage
      eyebrow="Privacy"
      title="Privacy policy"
      lead="Short version: no passwords or profiles, no tracking cookies from gitmanual, and nothing that identifies you is stored unless you sign in with GitHub. Some pages show one ad from Carbon."
      updated="11 November 2026"
    >
      <h2>What gitmanual stores</h2>
      <ul>
        <li>
          <strong>Manuals for the repos people look up.</strong> These are built from public GitHub data and kept so the next visitor gets
          them instantly.
        </li>
        <li>
          <strong>Counts.</strong> How often each repo&apos;s manual is opened, and &ldquo;Did you get it running?&rdquo; answers: the repo,
          the system (macOS, Windows or Linux) and yes or no. Nothing about who answered.
        </li>
        <li>
          <strong>Rate-limit counters.</strong> To stop abuse, the number of new repos, AI guides and votes requested in a short window is
          counted per visitor. A visitor is a scrambled code made from your IP address, the date and a secret; it changes every day, and the
          IP address itself is never stored. Each counter only counts within its window (at most a day), and expired ones are cleared out regularly.
        </li>
      </ul>

      <h2>Private repos</h2>
      <p>
        If you open one of your private repos, you give gitmanual read-only access to it, either by connecting the gitmanual GitHub App
        (you pick the repos on GitHub) or by pasting a token you created. gitmanual reads the repo&apos;s key files once to build your
        manual and sends it to your browser. The manual and the files are not saved, counted, listed or shown to search engines, and
        aren&apos;t sent to any AI service. Your token stays in your browser&apos;s local storage; a GitHub App connection is kept in an
        encrypted cookie that only gitmanual&apos;s servers can read. &ldquo;Disconnect&rdquo; on the manual removes both from this
        browser, and you can remove the app or delete the token on GitHub at any time.
      </p>

      <h2>API keys</h2>
      <p>
        If you make an API key on the <Link href="/developers">developers page</Link>, gitmanual stores your GitHub username and account
        number, when the key was made and last used, and how many requests it has made, so you (and we) can see its use and turn it off
        if it&apos;s misused. The key itself is stored only as a fingerprint (a hash). Signing in for a key gives gitmanual no access to
        your repos. Delete the key on that page any time, and its record goes with it.
      </p>

      <h2>Signing in with GitHub</h2>
      <p>
        Signing in is optional: it&apos;s needed only for chat, an API key or your private repos. When you sign in, gitmanual keeps your
        GitHub username and account number, when you first and last signed in or used chat, and how many times you&apos;ve signed in. For
        each chat answer it keeps the day, what it cost and which public repo it was about, but not your question or its answer, which are
        deleted after an hour. Nothing else: no email address, and signing in gives gitmanual no access to your repos. To have your record deleted,
        ask through the contact form.
      </p>

      <h2>What stays in your browser</h2>
      <p>
        gitmanual sets no cookies unless you connect GitHub for a private repo (above). After you answer &ldquo;Did you get it running?&rdquo;, your browser&apos;s local storage remembers your
        answer for that repo, so you aren&apos;t asked twice. It never leaves your device, and clearing your browser&apos;s site data removes
        it.
      </p>

      <h2>Outside services</h2>
      <ul>
        <li>
          <strong>Vercel</strong> hosts the site. Like any web host, it handles requests (including your IP address and browser type) and
          keeps short-lived logs for security and operations. Page views are counted with Vercel Web Analytics, which uses no cookies and
          reports only totals, such as how many people opened a page.
        </li>
        <li>
          <strong>Carbon</strong> (carbonads.net) shows one ad on manual pages of public repos, the shelf, the lists and the API
          page. Your browser loads it from Carbon, which receives your IP address and browser type, under Carbon&apos;s privacy policy.
          Manual pages of private repos never load it.
        </li>
        <li>
          <strong>Turso</strong> hosts the database that holds what&apos;s listed above.
        </li>
        <li>
          <strong>GitHub</strong>: gitmanual&apos;s servers read public repositories from GitHub, and private ones only with the
          access you give (above). Your browser doesn&apos;t contact GitHub
          unless you follow a link there.
        </li>
        <li>
          <strong>Facebook</strong>: on the Finds page, pressing play on a Reel loads Facebook&apos;s video player, which follows
          Facebook&apos;s own privacy policy. Until you press play, nothing on the page comes from Facebook.
        </li>
        {CONTACT_FORM && (
          <li>
            <strong>ShareText</strong>: the contact form is provided by sharetext.net. It loads only on the contact page or when you open the Contact dialog. What you write is sent
            to ShareText and to us, under ShareText&apos;s privacy policy.
          </li>
        )}
        <li>
          <strong>AI chats</strong>: the &ldquo;Ask Claude&rdquo; and &ldquo;Ask ChatGPT&rdquo; buttons open claude.ai or chatgpt.com in a
          new tab with a prompt about the repo already filled in. gitmanual sends nothing itself; what happens there is between you and that
          service, under its own privacy policy.
        </li>
        {AI_GUIDES && (
          <li>
            <strong>GitManual AI Agent</strong>: the optional &ldquo;Write my guide&rdquo; button sends the repo&apos;s public files to
            Anthropic, whose Claude models write the guide. Nothing about you is sent with them.
          </li>
        )}
        {CHAT && (
          <li>
            <strong>GitManual AI Agent</strong>: questions you ask in &ldquo;Ask about this repo&rdquo; are sent with the repo&apos;s public
            files to Anthropic, whose Claude models write the answers, under Anthropic&apos;s API terms. We keep the conversation for an hour
            so you can ask follow-ups; after that it&apos;s deleted as new chats start. Longer term we keep only what each answer cost and which
            public repo it was about, under your GitHub user id (see Signing in with GitHub above). Don&apos;t put passwords or keys in a question.
          </li>
        )}
      </ul>

      <h2>The browser extension, API and MCP server</h2>
      <p>
        The browser extension reads only the name of the GitHub repo you&apos;re viewing, and its buttons link to that repo&apos;s manual. Its
        side panel, once you open it and ask, sends the repo&apos;s name and your question to gitmanual.com under your GitHub sign-in, and
        they&apos;re handled exactly like chat on the site (above). The panel keeps your chat on your device for the same hour, and remembers
        the system you picked. The API and the MCP server work like the website: the same rate-limit counters, and nothing else about
        the caller.
      </p>

      <h2>What gitmanual doesn&apos;t do</h2>
      <p>No passwords or profiles (signing in with GitHub is optional), no ads beyond one Carbon ad on some pages, no tracking across sites, and no selling or sharing of personal data.</p>

      <h2>Your choices</h2>
      <p>
        You can use gitmanual without giving any personal information. If you send a message through the contact form, you can ask for it
        to be deleted the same way. The site isn&apos;t aimed at children.
      </p>

      <h2>Changes and questions</h2>
      <p>
        If what {SITE_HOST} stores or shares changes, this page changes first, with a new date at the top.{" "}
        {REPO_URL && (
          <>
            The code is public, so anyone can check it:{" "}
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              {REPO_URL.replace(/^https:\/\//, "")}
            </a>
            .{" "}
          </>
        )}
        Questions: <Link href="/contact">contact</Link>.
      </p>
    </DocPage>
  );
}
