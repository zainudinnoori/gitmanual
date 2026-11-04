# gitmanual design

**Idea:** every repo gets a flat-pack *assembly manual*. Playful, but every element carries real information: a verdict sticker, a parts list, numbered steps.

## Tokens (`app/globals.css`)

| Token | Value | Use |
|---|---|---|
| `--paper` | `#f2f3f5` | Page background (cool grey, not cream) |
| `--sheet` | `#ffffff` | Cards, panels |
| `--ink` | `#15161a` | Text, outlines, hard shadows, code blocks |
| `--pencil` | `#5f6470` | Secondary text |
| `--line` / `--line-strong` | `#dfe2e8` / `#c4c9d2` | Hairlines, dashed leader lines |
| `--wrench` / `--wrench-2` | `#ff6b2c` / `#e0561c` | The box, primary buttons, step numbers, "Best start" |
| `--yes` / `--maybe` / `--no` | `#2fd394` / `#ffc53d` / `#ff5a5f` | Verdicts only |
| `--sky` | `#a9d8ff` | Stack chips, hover on parts |

## Type

Four roles. Pick a role, never a one-off font or size.

| Role | Font | Used for |
|---|---|---|
| Display | Bricolage Grotesque 800 (700 for small titles) | Page, section and card titles; big numbers (step numbers, stars); stickers. Orange display text gets a 1.5px ink stroke |
| Interface | Geist 600: `font: var(--ui)` | Every control: menu, buttons, tabs, toggles, pickers, pagers, text links, expandable rows |
| Body | Geist 400 | Text and descriptions |
| Mono | Geist Mono | Only data: commands, paths, URLs, repo owners, counts, uppercase labels (eyebrows, field labels) |

Size scale (`--fs-*` in `app/globals.css`): label 11 · meta 12.5 · small 14 · body 15 · title 17 · lead 18 · h3 20 · h2 24, plus the `clamp()` display sizes for page titles.

The menu: every item is the same Interface style; the current page gets an ink outline (`aria-current="page"`).

## Rules

- **Ink outlines (1.5px) + hard offset shadows** (`3–6px 3–6px 0 var(--ink)`) for things you can act on or that matter most: the address bar, primary buttons, the verdict, the parts list, "Start here" options. Quiet panels use a 1px `--line` border with no shadow.
- **Numbers mean order.** Big numerals are only for real sequences (setup steps, the three manual parts).
- **Colour means status.** Green, amber and red are only for yes, maybe and no. Orange is the brand and the action colour.
- **Motion:** one moment per view (the box opening and parts popping out, the verdict stamp). `prefers-reduced-motion` turns all of it off.
- **Copy:** sentence case, plain verbs, from the user's side ("Get the setup", "Did you get it running?").
