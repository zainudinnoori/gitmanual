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
      <h1 className="display-md">Opening the box…</h1>
    </div>
  );
}
