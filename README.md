# Sampler

An animated field guide to 25 hand-embroidery stitches. Each stitch is drawn live on a canvas from a list of
needle moves: the needle comes up, goes down, wraps, weaves. Nothing on the page is a video or an image.

- **Home**: a wreath sampler that stitches itself with all 25 stitches (hover a motif to name it, click to open it),
  the stitches grouped by family, and a kit list.
- **Stitch pages** (`/stitches/<slug>/`): a hoop player with play/pause, move-by-move stepping, scrubbing and speed;
  **Flip to the back** shows what the thread does behind the fabric; **Side view** (knots only) is a cut through
  the fabric; **Try it yourself** asks you to tap the holes in order.

Stack: Astro 7 (static output), plain TypeScript, Canvas 2D. No runtime dependencies besides two self-hosted fonts
(Fraunces, Instrument Sans).

## Run

```sh
npm install
npx astro dev --port 4377 --host localhost   # http://localhost:4377
npm run build                                # static site in dist/
npm test                                     # engine self-check over all 25 stitches (node, no browser)
```

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
| `src/lib/swatch.ts` | Card thumbnails; hovering a card replays its stitch. |

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

Not deployed yet. The plan matches personal-site: Cloudflare Workers static assets (`astro.config.mjs` already
points `site` at `https://stitch-sampler.carlosaguirre.workers.dev`, which the OG tags use).
