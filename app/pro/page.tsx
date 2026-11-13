import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { POOLS } from "@/lib/budget";
import { CHAT } from "@/lib/chat";
import { CONTACT_FORM } from "@/lib/site";
import { planPrices, PRO_ENABLED } from "@/lib/stripe";
import { Plans } from "./plans";

export const metadata: Metadata = {
  title: "GitManual Pro",
  description: "Unlimited questions to GitManual AI Agent about any public GitHub repo, on the site and in the browser extension.",
  alternates: { canonical: "/pro" },
};

export const revalidate = 600;

// What the three sketched pages stand for.
const PAGES = ["The repo at a glance", "The recommended install, start to finish", "Every other way, with what each needs"];

// The Pro page: what's free, what Pro adds, and the button to subscribe (app/pro/plans.tsx). 404 until PRO_ENABLED=on.
export default async function ProPage() {
  if (!PRO_ENABLED()) notFound();
  const prices = await planPrices();
  return (
    <article className="wrap pro">
      <header className="pro-head">
        <p className="eyebrow">GitManual Pro</p>
        <h1 className="display-md">Ask as much as the setup needs.</h1>
        <p className="lead">
          The free plan gives you {POOLS.user.answersPerDay} answers a day from GitManual AI Agent. Pro takes the daily limit away, on
          gitmanual.com and in the browser extension.
        </p>
      </header>

      <Plans prices={prices && { month: prices.month.amount, year: prices.year.amount, currency: prices.month.currency }} free={POOLS.user.answersPerDay}
        contact={Boolean(CONTACT_FORM)}
      />

      <section className="pro-preview" aria-labelledby="pro-preview">
        <div className="pro-preview-text">
          <p className="eyebrow">In Pro</p>
          <h2 id="pro-preview">See what you get</h2>
          <p>Any repo&apos;s manual as one file for your system, made from the repo&apos;s own files. Print it, share it, keep it. Also as Markdown.</p>
          <ol>
            {PAGES.map((p, i) => (
              <li key={p}>
                <span>{i + 1}</span>
                {p}
              </li>
            ))}
          </ol>
        </div>
        {/* A sketch of the pages, not the pages themselves: the shape of each one, drawn in the PDF's look. */}
        <div className="pro-preview-pages" aria-hidden="true">
          <div className="pro-page pro-page-1">
            <div className="sk-brand">
              <i className="sk-logo" />
              <i className="sk-line sk-w30" />
            </div>
            <i className="sk-title" />
            <i className="sk-line sk-w90" />
            <i className="sk-line sk-w60" />
            <div className="sk-chips">
              <i className="sk-chip sk-dark" />
              <i className="sk-chip" />
              <i className="sk-chip" />
            </div>
            <div className="sk-facts">
              {Array.from({ length: 8 }, (_, k) => (
                <i key={k} />
              ))}
            </div>
            <div className="sk-systems">
              <i className="sk-on" />
              <i />
              <i />
            </div>
            <i className="sk-line sk-w80" />
            <i className="sk-line sk-w70" />
            <div className="sk-foot">
              <i className="sk-qr" />
              <i className="sk-line sk-w50" />
            </div>
          </div>
          <div className="pro-page pro-page-2">
            <i className="sk-head" />
            <i className="sk-tag sk-orange" />
            <i className="sk-code sk-tall" />
            <i className="sk-sub" />
            <i className="sk-code" />
            <i className="sk-sub" />
            <i className="sk-code" />
            <i className="sk-sub" />
            <i className="sk-code" />
          </div>
          <div className="pro-page pro-page-3">
            <i className="sk-head" />
            <i className="sk-tag sk-blue" />
            <i className="sk-code" />
            <i className="sk-tag sk-yellow" />
            <i className="sk-code" />
            <i className="sk-head sk-small" />
            <i className="sk-code" />
            <i className="sk-code" />
          </div>
        </div>
      </section>

      <section className="pro-faq" aria-labelledby="pro-faq">
        <h2 id="pro-faq">Questions</h2>
        <dl>
          <dt>Is it really unlimited?</dt>
          <dd>
            For anyone asking by hand, yes. There&apos;s a fair-use ceiling of {POOLS.pro.answersPerDay} answers a day to stop scripts, and
            each chat still runs for an hour or {CHAT.answersPerConversation} questions before you start a fresh one.
          </dd>
          <dt>Who am I paying?</dt>
          <dd>
            Payments are handled by Stripe&apos;s Link, which acts as the seller: it works out and pays any sales tax or VAT, sends your
            receipts, and your statement shows <code>LINK.COM*</code>. gitmanual never sees your card.
          </dd>
          <dt>How do I cancel?</dt>
          <dd>
            Any time, from &ldquo;Manage subscription&rdquo; on this page or at app.link.com. Pro stays on until the end of the period
            you&apos;ve paid for, and then you&apos;re back on the free plan.
          </dd>
          <dt>Refunds?</dt>
          <dd>
            If Pro isn&apos;t working for you, <Link href="/contact">get in touch</Link> within 14 days of paying and we&apos;ll refund
            you.
          </dd>
          <dt>What does gitmanual keep?</dt>
          <dd>
            Your GitHub username and account number, and whether your subscription is active and until when. See the{" "}
            <Link href="/privacy">privacy policy</Link>.
          </dd>
        </dl>
      </section>
    </article>
  );
}
