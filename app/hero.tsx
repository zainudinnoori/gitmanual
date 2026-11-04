"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { RepoCard } from "@/lib/db";
import { OS_LABEL, type OS } from "@/lib/os";
import { ShelfCard } from "./cards";
import { RepoForm, Wrenches, detectOS } from "./ui";

type Demo = {
  repo: string;
  parts: { name: string; kind: string }[];
  steps: number;
  level: number;
  time: string;
  fit: Record<OS, "yes" | "maybe" | "no">;
  fitNote?: string;
};

// Condensed from gitmanual's analysis of these repos, for the landing demo.
const DEMOS: Demo[] = [
  {
    repo: "BurntSushi/ripgrep",
    parts: [
      { name: "Homebrew", kind: "or winget / apt" },
      { name: "Rust 1.85", kind: "to build it" },
      { name: "cargo", kind: "package manager" },
    ],
    steps: 4,
    level: 1,
    time: "5 min",
    fit: { mac: "yes", windows: "yes", linux: "yes" },
  },
  {
    repo: "humblemuzzu/dumbtv",
    parts: [
      { name: "adb", kind: "Android platform-tools" },
      { name: "Fire TV", kind: "the device itself" },
      { name: "Wi-Fi", kind: "same network" },
    ],
    steps: 6,
    level: 2,
    time: "15 min",
    fit: { mac: "maybe", windows: "maybe", linux: "maybe" },
    fitNote: "depends on your TV",
  },
  {
    repo: "fastapi/fastapi",
    parts: [
      { name: "Python 3.11", kind: ".python-version" },
      { name: "uv", kind: "package manager" },
      { name: "pytest", kind: "for the tests" },
    ],
    steps: 5,
    level: 1,
    time: "5 min",
    fit: { mac: "yes", windows: "yes", linux: "yes" },
  },
  {
    repo: "mastodon/mastodon",
    parts: [
      { name: "Ruby 4.0", kind: ".ruby-version" },
      { name: "Node 26", kind: ".nvmrc" },
      { name: "Postgres", kind: "service" },
      { name: "Redis", kind: "service" },
    ],
    steps: 9,
    level: 3,
    time: "30+ min",
    fit: { mac: "yes", windows: "maybe", linux: "yes" },
    fitNote: "needs WSL on Windows",
  },
];

// Where each part hovers above the box, as [left, top] percentages, by part count.
const SPOTS: Record<number, [number, number][]> = {
  3: [[20, 46], [50, 10], [80, 46]],
  4: [[15, 54], [36, 12], [64, 12], [85, 54]],
};

const FIT_TEXT = { yes: "Fits your", maybe: "Probably fits your", no: "Doesn't fit your" };
const ROTATE_MS = 4200;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function Landing({ recent, popular }: { recent: RepoCard[]; popular: RepoCard[] }) {
  const [idx, setIdx] = useState(0);
  const [os, setOs] = useState<OS>("mac");
  const [auto, setAuto] = useState(true);
  const hovering = useRef(false);
  const reduced = usePrefersReducedMotion();
  const demo = DEMOS[idx];

  useEffect(() => setOs(detectOS()), []);

  useEffect(() => {
    if (reduced || !auto) return;
    const t = setInterval(() => {
      if (!hovering.current) setIdx((i) => (i + 1) % DEMOS.length);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [reduced, auto]);

  const fit = demo.fit[os];

  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Setup manuals for open source</p>
            <h1 className="display">
              Open source.
              <br />
              <span className="assembly">Some assembly required.</span>
            </h1>
            <p className="lead">
              Paste any GitHub link. We&apos;ll check it works on your device, list the parts you need and write the steps for Mac, Windows or
              Linux.
            </p>
            <RepoForm />
            <p className="trick">
              Shortcut: in any GitHub URL, change <s>hub</s> to <b>manual</b>.
            </p>
          </div>

          <div
            className="manual"
            onMouseEnter={() => (hovering.current = true)}
            onMouseLeave={() => (hovering.current = false)}
          >
            <div className="manual-top">
              <span translate="no">{demo.repo}</span>
              <span>
                {demo.steps} steps · {demo.time} · <Wrenches n={demo.level} />
              </span>
            </div>

            <div className="explode" key={demo.repo}>
              <div className={`sticker sticker-${fit}`}>
                {FIT_TEXT[fit]} {OS_LABEL[os]} {fit === "yes" ? "✓" : "?"}
                {demo.fitNote && fit !== "yes" && <small>{demo.fitNote}</small>}
              </div>
              <ul className="parts-float">
                {demo.parts.map((p, i) => (
                  <li key={p.name} style={{ "--i": i, left: `${SPOTS[demo.parts.length][i][0]}%`, top: `${SPOTS[demo.parts.length][i][1]}%` } as CSSProperties}>
                    <span className="qty">1×</span>
                    <b>{p.name}</b>
                    <small>{p.kind}</small>
                  </li>
                ))}
              </ul>
              <Box />
            </div>

            <div className="manual-foot">
              <div className="picker" role="tablist" aria-label="Example repos">
                {DEMOS.map((d, i) => (
                  <button
                    key={d.repo}
                    role="tab"
                    aria-selected={i === idx}
                    className={i === idx ? "on" : ""}
                    onClick={() => {
                      setIdx(i);
                      setAuto(false);
                    }}
                  >
                    {d.repo.split("/")[1]}
                  </button>
                ))}
              </div>
              <Link className="open-link" href={`/${demo.repo}`}>
                Open the manual →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {recent.length > 0 && <Shelf recent={recent} popular={popular} />}

      <section className="band" aria-labelledby="inside-h">
        <div className="wrap">
          <h2 id="inside-h" className="display-md">
            Every manual comes in three parts
          </h2>
          <ol className="pages">
            <li className="page">
              <span className="page-n">1</span>
              <DeviceArt />
              <h3>Will it work on my device?</h3>
              <p>A yes, maybe or no for your system and chip, plus the supported-devices list from the README.</p>
            </li>
            <li className="page">
              <span className="page-n">2</span>
              <PartsArt />
              <h3>Parts list</h3>
              <p>Every runtime, tool, database and setting the project expects, read from its real files.</p>
            </li>
            <li className="page">
              <span className="page-n">3</span>
              <StepsArt />
              <h3>Assembly steps</h3>
              <p>Copy-paste commands written for your OS, with fixes for the errors people hit most.</p>
            </li>
          </ol>
        </div>
      </section>
    </>
  );
}

// An open flat-pack box in isometric view: rim corners L(40,70) B(160,30) R(280,70) F(160,110), 80px deep.
function Box() {
  const stroke = { stroke: "var(--ink)", strokeWidth: 2.5, strokeLinejoin: "round" as const };
  return (
    <svg className="box" viewBox="-10 -40 340 250" aria-hidden="true">
      <defs>
        <clipPath id="box-opening">
          <path d="M40 70 L160 30 L280 70 L160 110 Z" />
        </clipPath>
      </defs>
      <ellipse cx="160" cy="194" rx="132" ry="12" fill="var(--ink)" opacity=".08" />

      {/* back flaps stand up, leaning outward */}
      <path className="flap flap-back" d="M40 70 L160 30 L142 -22 L22 18 Z" fill="var(--wrench-2)" {...stroke} />
      <path className="flap flap-back" d="M160 30 L280 70 L298 18 L178 -22 Z" fill="var(--wrench)" {...stroke} />

      {/* inside: two back walls and the floor, seen through the opening */}
      <g clipPath="url(#box-opening)">
        <path d="M40 70 L160 30 L160 110 L40 150 Z" fill="#b8461a" />
        <path d="M160 30 L280 70 L280 150 L160 110 Z" fill="#cf5320" />
        <path d="M40 150 L160 110 L280 150 L160 190 Z" fill="#8f3512" />
      </g>
      <path d="M40 70 L160 30 L280 70 L160 110 Z" fill="none" {...stroke} />

      {/* front walls */}
      <path d="M40 70 L160 110 L160 190 L40 150 Z" fill="var(--wrench)" {...stroke} />
      <path d="M280 70 L160 110 L160 190 L280 150 Z" fill="var(--wrench-2)" {...stroke} />
      <path d="M62 112 l20 7 M62 124 l40 13 M62 136 l30 10" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M196 132 l14 -8 l-14 -8" fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M216 136 l24 -9" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />

      {/* front flaps fold open toward you */}
      <path className="flap flap-front" d="M40 70 L160 110 L136 136 L14 94 Z" fill="#ff8a55" {...stroke} />
      <path className="flap flap-front" d="M160 110 L280 70 L306 94 L184 136 Z" fill="#ff7a40" {...stroke} />
    </svg>
  );
}

function DeviceArt() {
  return (
    <svg className="art" viewBox="0 0 160 96" aria-hidden="true">
      <rect x="22" y="14" width="96" height="62" rx="6" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2.5" />
      <path d="M10 84 h120" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M36 32 h40 M36 44 h56 M36 56 h28" stroke="var(--line-strong)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="126" cy="26" r="18" fill="var(--yes)" stroke="var(--ink)" strokeWidth="2.5" />
      <path d="M118 26 l6 6 l10 -12" fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PartsArt() {
  return (
    <svg className="art" viewBox="0 0 160 96" aria-hidden="true">
      <rect x="14" y="16" width="40" height="40" rx="8" fill="var(--wrench)" stroke="var(--ink)" strokeWidth="2.5" />
      <circle cx="84" cy="36" r="20" fill="var(--sky)" stroke="var(--ink)" strokeWidth="2.5" />
      <path d="M118 56 l16 -40 l16 40 z" fill="var(--yes)" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />
      <text x="24" y="84" className="art-t">1×</text>
      <text x="74" y="84" className="art-t">1×</text>
      <text x="124" y="84" className="art-t">1×</text>
    </svg>
  );
}

function StepsArt() {
  return (
    <svg className="art" viewBox="0 0 160 96" aria-hidden="true">
      <rect x="14" y="12" width="132" height="72" rx="8" fill="var(--ink)" />
      <path d="M28 32 l8 6 l-8 6" fill="none" stroke="var(--wrench)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M44 44 h56" stroke="var(--paper)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M28 62 h20 M54 62 h40" stroke="#5b606b" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="128" cy="62" r="8" fill="var(--yes)" />
    </svg>
  );
}

function Shelf({ recent, popular }: { recent: RepoCard[]; popular: RepoCard[] }) {
  const [tab, setTab] = useState<"recent" | "popular">("recent");
  const list = tab === "recent" ? recent : popular;
  return (
    <section className="shelf" aria-labelledby="shelf-h">
      <div className="wrap">
        <div className="shelf-head">
          <div>
            <p className="eyebrow">From the shelf</p>
            <h2 id="shelf-h" className="display-md">
              {tab === "recent" ? "Recently set up here" : "Most looked-up repos"}
            </h2>
          </div>
          <div className="shelf-actions">
          <div className="picker" role="tablist" aria-label="Sort repos">
            <button role="tab" aria-selected={tab === "recent"} className={tab === "recent" ? "on" : ""} onClick={() => setTab("recent")}>
              recent
            </button>
            <button role="tab" aria-selected={tab === "popular"} className={tab === "popular" ? "on" : ""} onClick={() => setTab("popular")}>
              popular
            </button>
          </div>
          <Link className="open-link" href="/shelf">
            Browse the whole shelf →
          </Link>
          </div>
        </div>
        <ul className="shelf-grid">
          {list.map((r) => (
            <li key={r.fullName}>
              <ShelfCard repo={r} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
