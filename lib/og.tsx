import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

// Satori reads TTF/OTF/WOFF but not the woff2 browsers get, so an old user agent asks for WOFF;
// `text=` makes Google Fonts return one small file with exactly the characters on the card.
async function font(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent(text)}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.30 (KHTML, like Gecko) Safari/534.30" },
        next: { revalidate: 60 * 60 * 24 * 7 },
      })
    ).text();
    const url = css.match(/src:\s*url\(([^)]+)\)\s*format\('(?:truetype|opentype|woff)'\)/)?.[1];
    return url ? await (await fetch(url, { next: { revalidate: 60 * 60 * 24 * 30 } })).arrayBuffer() : null;
  } catch {
    return null;
  }
}

const INK = "#15161a";
const WRENCH = "#ff6b2c";

function Box() {
  return (
    <div style={{ display: "flex", position: "relative", width: 230, height: 230 }}>
      <div style={{ position: "absolute", left: 30, top: 70, width: 170, height: 140, background: WRENCH, border: `5px solid ${INK}`, borderRadius: 18 }} />
      <div style={{ position: "absolute", left: 10, top: 40, width: 105, height: 46, background: "#ff8a55", border: `5px solid ${INK}`, borderRadius: 12, transform: "rotate(-12deg)" }} />
      <div style={{ position: "absolute", left: 118, top: 40, width: 105, height: 46, background: "#ff8a55", border: `5px solid ${INK}`, borderRadius: 12, transform: "rotate(12deg)" }} />
      <div style={{ position: "absolute", left: 62, top: 116, fontFamily: "Display", fontSize: 48, color: INK, display: "flex" }}>{">_"}</div>
    </div>
  );
}

// The shared card: an eyebrow, a big title, a line of text, and chips along the bottom.
export async function ogImage(o: { eyebrow: string; owner?: string; title: string; text?: string | null; chips?: string[] }) {
  const text = (o.text ?? "").length > 90 ? `${o.text!.slice(0, o.text!.lastIndexOf(" ", 88))}…` : (o.text ?? "");
  const [display, body] = await Promise.all([
    font("Bricolage Grotesque", 800, `gitmanual${o.title}>_`),
    font("Geist", 500, `${o.eyebrow.toUpperCase()}${o.owner ?? ""}/${text}${(o.chips ?? []).join("")}`),
  ]);
  const fonts = [
    ...(display ? [{ name: "Display", data: display, weight: 800 as const }] : []),
    ...(body ? [{ name: "Body", data: body, weight: 500 as const }] : []),
  ];
  const long = o.title.length > 18;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", background: "#f2f3f5", padding: 48,
          backgroundImage: "radial-gradient(#dfe2e8 2px, transparent 2px)", backgroundSize: "32px 32px",
        }}
      >
        <div
          style={{
            display: "flex", flex: 1, background: "#ffffff", border: `5px solid ${INK}`, borderRadius: 36,
            boxShadow: `14px 14px 0 ${INK}`, padding: "48px 56px", justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, paddingRight: 24 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: "Display", fontSize: 34, color: INK }}>
                <div style={{ width: 34, height: 34, background: WRENCH, border: `4px solid ${INK}`, borderRadius: 8 }} />
                gitmanual
                <span style={{ fontFamily: "Body", fontSize: 22, color: "#5f6470", marginLeft: 10, letterSpacing: 3, textTransform: "uppercase" }}>
                  {o.eyebrow}
                </span>
              </div>
              {o.owner && <div style={{ display: "flex", fontFamily: "Body", fontSize: 34, color: "#5f6470", marginTop: 34 }}>{`${o.owner}/`}</div>}
              <div
                style={{
                  fontFamily: "Display", fontSize: long ? 76 : 104, lineHeight: 1, color: INK, letterSpacing: -3,
                  marginTop: o.owner ? 4 : 40, display: "flex",
                }}
              >
                {o.title}
              </div>
              {o.text && (
                <div style={{ fontFamily: "Body", fontSize: 28, lineHeight: 1.35, color: "#5f6470", marginTop: 20, maxWidth: 720, display: "flex" }}>
                  {text}
                </div>
              )}
            </div>
            {o.chips && (
              <div style={{ display: "flex", gap: 14 }}>
                {o.chips.map((c) => (
                  <div
                    key={c}
                    style={{ display: "flex", alignItems: "center", flexShrink: 0, whiteSpace: "nowrap", lineHeight: 1, fontFamily: "Body", fontSize: 26, color: INK, border: `3px solid ${INK}`, borderRadius: 999, padding: "12px 22px", background: "#a9d8ff" }}
                  >
                    {c}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <Box />
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: fonts.length ? fonts : undefined },
  );
}

export const POSTER_SIZE = { width: 1080, height: 1080 };

type Mark = "yes" | "maybe" | "no";
const MARK_BG: Record<Mark, string> = { yes: "#2fd394", maybe: "#ffc53d", no: "#ff5a5f" };

function MarkIcon({ mark }: { mark: Mark }) {
  const d = mark === "yes" ? "M7 13l4 4 8-9" : mark === "no" ? "M8 8l9 9M17 8l-9 9" : "M9.5 9a3 3 0 1 1 4.2 2.7c-.9.5-1.2 1-1.2 2.1M12.5 17.5v.5";
  return (
    <svg width="38" height="38" viewBox="0 0 25 25">
      <circle cx="12.5" cy="12.5" r="11" fill={MARK_BG[mark]} stroke={INK} strokeWidth="2.2" />
      <path d={d} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// A square poster for social posts: the repo, whether it fits each system, how hard it is, and where to find the manual.
export async function posterImage(o: {
  owner: string;
  name: string;
  description: string | null;
  stars: string;
  difficulty: string;
  time: string;
  fit: { label: string; mark: Mark }[];
  url: string;
}) {
  const desc = (o.description ?? "").length > 120 ? `${o.description!.slice(0, o.description!.lastIndexOf(" ", 117))}…` : (o.description ?? "");
  const [display, body] = await Promise.all([
    font("Bricolage Grotesque", 800, `gitmanual${o.name}${o.difficulty}${o.fit.map((f) => f.label).join("")}Will it run on yours?>_`),
    font("Geist", 500, `SETUP MANUAL${o.owner}/${desc}${o.stars} stars${o.time}${o.url}Difficulty·${o.difficulty}`),
  ]);
  const fonts = [
    ...(display ? [{ name: "Display", data: display, weight: 800 as const }] : []),
    ...(body ? [{ name: "Body", data: body, weight: 500 as const }] : []),
  ];
  const size = o.name.length <= 9 ? 150 : o.name.length <= 14 ? 112 : o.name.length <= 20 ? 84 : 64;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", background: "#f2f3f5", padding: 56,
          backgroundImage: "radial-gradient(#dfe2e8 2.5px, transparent 2.5px)", backgroundSize: "36px 36px",
        }}
      >
        <div
          style={{
            display: "flex", flexDirection: "column", flex: 1, background: "#ffffff", border: `6px solid ${INK}`, borderRadius: 44,
            boxShadow: `18px 18px 0 ${INK}`, padding: "52px 60px 48px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: "Display", fontSize: 40, color: INK }}>
              <div style={{ width: 38, height: 38, background: WRENCH, border: `5px solid ${INK}`, borderRadius: 9 }} />
              gitmanual
            </div>
            <div style={{ display: "flex", fontFamily: "Body", fontSize: 24, color: "#5f6470", letterSpacing: 4 }}>SETUP MANUAL</div>
          </div>

          <div style={{ display: "flex", fontFamily: "Body", fontSize: 38, color: "#5f6470", marginTop: 56 }}>{`${o.owner}/`}</div>
          <div style={{ display: "flex", fontFamily: "Display", fontSize: size, lineHeight: 0.95, letterSpacing: -4, color: INK, marginTop: 6 }}>
            {o.name}
          </div>
          {desc && (
            <div style={{ display: "flex", fontFamily: "Body", fontSize: 32, lineHeight: 1.35, color: "#5f6470", marginTop: 26, maxWidth: 860 }}>
              {desc}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
            <div style={{ display: "flex", fontFamily: "Display", fontSize: 30, color: INK }}>Will it run on yours?</div>
            <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
              {o.fit.map((f) => (
                <div
                  key={f.label}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, border: `4px solid ${INK}`, borderRadius: 999, padding: "10px 24px 10px 12px",
                    background: "#ffffff", fontFamily: "Display", fontSize: 30, color: INK,
                  }}
                >
                  <MarkIcon mark={f.mark} />
                  {f.label}
                </div>
              ))}
            </div>
            <div
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 34, paddingTop: 26,
                borderTop: "4px dashed #c4c9d2",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", fontFamily: "Body", fontSize: 28, color: INK }}>{`${o.stars} stars · Difficulty ${o.difficulty} · ${o.time}`}</div>
                <div style={{ display: "flex", fontFamily: "Body", fontSize: 30, color: "#e0561c" }}>{o.url}</div>
              </div>
              <div style={{ display: "flex", transform: "scale(0.62)", transformOrigin: "bottom right", marginBottom: -40, marginRight: -40 }}>
                <Box />
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...POSTER_SIZE, fonts: fonts.length ? fonts : undefined },
  );
}
