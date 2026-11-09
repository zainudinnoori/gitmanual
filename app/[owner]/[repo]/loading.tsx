// Shown while the server reads a repo it hasn't seen in the last 12 hours.
export default function Loading() {
  return (
    <div className="wrap report-state" aria-busy="true">
      <div className="unbox" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className="eyebrow">Reading the repo</p>
      {/* Not an h1: this is sent first, and crawlers that read the raw page would take it for the page's headline. */}
      <p className="display-md">Opening the box…</p>
    </div>
  );
}
