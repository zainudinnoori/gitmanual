import type { Metadata } from "next";
import Script from "next/script";
import { CONTACT_FORM, REPO_URL } from "@/lib/site";
import { DocPage } from "../doc";

export const metadata: Metadata = {
  title: "Contact",
  description: "Questions, feedback, a wrong setup, or advertising on gitmanual.",
  alternates: { canonical: "/contact" },
};

export default function Contact() {
  return (
    <DocPage eyebrow="Contact" title="Get in touch" lead="Questions, feedback or advertising: send a message.">
      {CONTACT_FORM ? (
        // On this page the form is what you came for, so it loads right away (from sharetext.net; see the privacy policy).
        <div className="doc-form">
          <iframe src={CONTACT_FORM} title="Contact form" />
          {/* ShareText's script sizes the frame to the form, so it never scrolls inside or leaves a gap. */}
          <Script src={new URL("/forms-embed.js", CONTACT_FORM).href} strategy="afterInteractive" />
        </div>
      ) : (
        <p>There&apos;s no contact form on this copy of gitmanual.</p>
      )}

      {REPO_URL && (
        <>
          <h2>Found a wrong step?</h2>
          <p>
            A GitHub issue is the quickest way: anyone can see it, and the fix helps every repo like it.{" "}
            <a href={`${REPO_URL}/issues/new/choose`} target="_blank" rel="noreferrer">
              Report a wrong setup
            </a>
            .
          </p>
          <h2>Maintainers</h2>
          <p>If you maintain a project and want something on its manual changed or removed, send a message above or open an issue.</p>
        </>
      )}
    </DocPage>
  );
}
