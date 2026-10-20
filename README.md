# Sampler

An animated field guide to 25 hand-embroidery stitches. Each stitch is drawn live on a canvas from a list of
needle moves: the needle comes up, goes down, wraps, weaves. Nothing on the page is a video or an image.

- **Home**: a wreath sampler that stitches itself with all 25 stitches (hover a motif to name it, click to open it),
  the stitches grouped by family, and a kit list.
- **Stitch pages** (`/stitches/<slug>/`): a hoop player with play/pause, move-by-move stepping, scrubbing and speed;
  **Flip to the back** shows what the thread does behind the fabric; **Side view** (knots only) is a cut through
  the fabric; **Try it yourself** asks you to tap the holes in order. Below the guide, what the stitch is good for.
- **Guided projects** (`/projects/<slug>/`): a design traced on the linen in water-soluble-pen blue, then stitched
  one part (one stitch, one floss) at a time.
- **Make your own** (`/make/`): describe a shape or upload a photo; Claude returns a design in the same parts format
  and the page plays it as a guided project, with why each stitch was picked.

Stack: Astro 7 (static output), plain TypeScript, Canvas 2D, two self-hosted fonts (Fraunces, Instrument Sans). A
Cloudflare Worker (`worker.ts`) serves `dist/` and the one API route, `/api/design`, which calls Claude Sonnet 5.5
with the official SDK and structured outputs.

## Run

```sh
npm install
npx astro dev --port 4377 --host localhost   # http://localhost:4377, /api proxied to :4378
npm run serve                                # build + the Worker on http://localhost:4378 (site and /api)
npm run build                                # static site in dist/
npm test                                     # engine and design-translator self-checks (node, no browser)
```

The design helper needs a Claude key in `.dev.vars` (git-ignored): `ANTHROPIC_API_KEY=sk-ant-...`, the same key the
fundamento and manejasinbroncas Workers use; restart `npm run serve` after changing it. Without it `/api/design`
answers 503 and the rest of the site works.

## How it works

| File | Job |
| --- | --- |
| `src/lib/geom.ts` | Vectors, splines, arc-length slicing, seeded RNG. |
| `src/lib/engine.ts` | Compiles a list of `Op`s (`up`, `down`, `knot`, `bullion`, `coral`, `tie`, `surface`) into timed events. `frameAt(program, t)` returns every thread piece and the needle at time `t`, so any moment can be scrubbed to. |
| `src/lib/render.ts` | `Scene`: procedural linen weave, twisted floss, knots, coils, the steel needle, the wooden hoop, front and back views, hole labels. |
| `src/lib/side.ts` | The knot cross-section, built from each event's `sec` descriptor. |
| `src/lib/stitches.ts` | Reusable builders (`running`, `chain`, `wheel`, ...) and the 25 stitch definitions: copy, steps, tip, zoom and demo layout. |
| `src/lib/player.ts` | The stitch-page player, flip, side view and practice mode. |
| `src/lib/hero.ts` | The home-page wreath: motifs built from the same builders, four needles at once, finished motifs baked to an offscreen layer. |
| `src/lib/swatch.ts` | Card thumbnails; hovering a card replays its stitch or project. |
| `src/lib/examples.ts` | A stitched picture for each of a stitch's three uses (`good`), in the same order; shown on the stitch page. |
| `src/lib/menu.ts` | The header's Stitches menu: opens on hover, previews one repeat of the hovered stitch. |
| `src/lib/projects.ts` | Guided projects as parts (stitch, floss, step, builder, pattern outline) and `lesson()`, which turns any project into what the player teaches. |
| `src/lib/design.ts` | `fromAI()`: validates a design from Claude, clamps it into the hoop, and builds the project. |
| `worker.ts` | Serves `dist/`; `/api/design` sends the prompt and optional photo to Claude with the design schema, rate-limited per visitor. |

Coordinates are fabric units (roughly millimetres at 1:1); a stitch page zooms by giving the stitch a smaller hoop
radius `R`. Captions are tied to ops with `cap` (a number, or an array that steps through a knot's phases).

### Adding a stitch

1. Write a builder in `stitches.ts` that pushes ops (reuse the existing ones where you can).
2. Add an entry to `STITCHES` with copy, `steps`, `tip`, `watch` and a `demo()` that sets `cap` on the ops where
   each step starts.
3. `npm test` checks the timeline (no NaNs, every caption reachable, needle gone at the end).
4. Look at it: the scratch page in `.dev/lab.astro` (git-excluded) renders every finished stitch, or a time
   sequence with `?s=<slug>&ts=0.1,0.2,...`, once copied into `src/pages/`. Don't commit it.

## Deploy

Not deployed yet. `wrangler.jsonc` is ready: `npm run build && npx wrangler deploy`, after
`npx wrangler secret put ANTHROPIC_API_KEY` for the design helper. `astro.config.mjs` points `site` at
`https://stitch-sampler.carlosaguirre.workers.dev`, which the OG tags use. The design route allows 5 requests a minute
per visitor (`DESIGN_LIMITER`).
