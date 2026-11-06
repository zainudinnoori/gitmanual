import type { ReactNode } from "react";

// The layout for plain text pages (About, Privacy, Terms, Contact): a narrow column that's easy to read.
export function DocPage({ eyebrow, title, lead, updated, children }: { eyebrow: string; title: string; lead?: ReactNode; updated?: string; children: ReactNode }) {
  return (
    <article className="wrap doc">
      <header className="doc-head">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display-md">{title}</h1>
        {lead && <p className="lead">{lead}</p>}
        {updated && <p className="doc-updated">Last updated {updated}</p>}
      </header>
      <div className="doc-body">{children}</div>
    </article>
  );
}
