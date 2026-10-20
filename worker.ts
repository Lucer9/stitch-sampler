import Anthropic from '@anthropic-ai/sdk';
import { STITCHES } from './src/lib/stitches.ts';
import { SAMPLE } from './src/lib/design.ts';

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  DESIGN_LIMITER: { limit: (o: { key: string }) => Promise<{ success: boolean }> };
  ANTHROPIC_API_KEY?: string;
  CLAUDE_MODEL: string;
}

const pt = { type: 'array', items: { type: 'number' } };
const obj = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties, required, additionalProperties: false });

/** The design Claude returns: parts the site turns into a guided project. */
const SCHEMA = obj(
  {
    name: { type: 'string', description: 'Title, 1 to 4 words' },
    blurb: { type: 'string', description: 'One sentence describing the design' },
    note: { type: 'string', description: 'Anything changed from the request, and why; empty if nothing' },
    level: { type: 'integer', enum: [1, 2, 3] },
    parts: {
      type: 'array',
      items: obj(
        {
          stitch: { type: 'string', enum: STITCHES.map((s) => s.slug) },
          color: { type: 'string', description: 'Floss colour as #rrggbb' },
          colorName: { type: 'string' },
          color2: { type: 'string', description: 'Second colour as #rrggbb, only where the stitch uses one' },
          step: { type: 'string' },
          why: { type: 'string' },
          layer: { type: 'integer', enum: [1, 2, 3, 4] },
          paths: { type: 'array', items: { type: 'array', items: pt } },
          shapes: { type: 'array', items: { type: 'array', items: pt } },
          angle: { type: 'number' },
          angles: { type: 'array', items: { type: 'number' } },
          size: { type: 'number' },
          points: { type: 'array', items: pt },
          leaves: { type: 'array', items: obj({ base: pt, tip: pt, width: { type: 'number' } }, ['base', 'tip', 'width']) },
          flowers: { type: 'array', items: obj({ center: pt, petals: { type: 'integer' }, length: { type: 'number' } }, ['center', 'petals', 'length']) },
          loops: { type: 'array', items: obj({ from: pt, to: pt }, ['from', 'to']) },
          circles: { type: 'array', items: obj({ center: pt, r: { type: 'number' } }, ['center', 'r']) },
          bars: { type: 'array', items: obj({ from: pt, to: pt }, ['from', 'to']) },
        },
        ['stitch', 'color', 'colorName', 'step', 'why', 'layer'],
      ),
    },
  },
  ['name', 'blurb', 'note', 'level', 'parts'],
);

const SYSTEM = `You design small hand-embroidery patterns. Sampler, an animated embroidery site, turns each design into a guided project: it traces your pattern in blue pen on linen, then stitches it part by part, in the order you give, each part on top of the ones before. Aim for something a stitcher would be proud to frame, not a clip-art icon.

Coordinates are fabric units, about a millimetre each. The hoop is a circle of radius 30 centred on (0, 0); keep everything within 24 of the centre. x grows to the right and y grows downwards, so negative y is the top.

Never draw people, faces, hands, bodies or any human figure. If asked for one, design a related object, plant or animal instead and say so in note.

How an embroiderer builds a design:
1. Break the subject into the sections you would stitch separately (a banana: body, the shadowed underside, the tip, the stem; a bird: body, wing, breast, head, beak, tail, eye). Never one flat blob.
2. Shade with colour. Use two or three tones of each main colour: a lighter section where the light falls (top left) and a darker one in shadow (bottom right), or long-and-short-stitch with color as the light tone and color2 as the dark. That is what makes things look round.
3. Stitch direction follows the form: across narrow sections, angled to follow curves. Give each shape its own angle in angles where sections curve. Satin stitches longer than 10 units snag; use long-and-short-stitch for bigger areas.
4. Outline on top where it helps: stem-stitch, back-stitch or split-stitch in a darker shade after the fill, so the edge stays crisp. An outline stitched before its fill disappears under it.
5. Details last: eyes, veins, seeds and speckles, highlights in a pale tone, tiny knots.
6. Add one or two small companion elements that belong to the subject so it reads as a design: a leaf or twig it grows on, a blossom, a sprig, a few sparkles beside it. Attach them or tuck them close; no lone floating lines, and nothing that turns the layout into a face. Keep them small and never covering the subject.
   Outline lines over fills are worked in fewer strands, so one outline round the subject is enough; keep inner detail lines short.
7. The main subject about 30 to 40 units across; the whole design within 24 of the centre. 6 to 10 parts. 4 to 7 floss colours that look good together on natural linen, as hex with plain colour names.

Layers: give every part a layer and list parts in stitching order. 1 = behind everything (ground, stems and twigs that things sit on), 2 = main fills, 3 = shading, highlights and outlines over fills, 4 = knots and small details on top. Parts with the same layer are stitched in the order listed.

The stitches available, and what each is good for:
${STITCHES.map((s) => `  ${s.slug}: ${s.use} Good for ${s.good.map(([t]) => t.toLowerCase()).join(', ')}.`).join('\n')}

Geometry: give each part only the field its stitch uses. Points are [x, y].
- paths, a list of polylines with 2 to 40 points each (they are smoothed; close an outline by repeating the first point): running-stitch, back-stitch, split-stitch, stem-stitch, whipped-running-stitch (color2 is the whipping colour), chain-stitch, coral-stitch, couching (color2 is the tacking colour), blanket-stitch (legs fall on the left of the direction of travel), feather-stitch and herringbone-stitch (best kept straight), cretan-stitch (a band 4 wide along the path), fly-stitch (a fern of stacked Vs along the path).
- shapes, a list of polygons with 3 to 40 points that do not cross themselves, plus angle (degrees; 0 is left to right, 90 top to bottom) or angles (one per shape): satin-stitch, long-and-short-stitch (color is the near-edge shade, color2 the second shade), seed-stitch (scattered inside).
- leaves, each {base, tip, width}: fishbone-stitch or satin-stitch leaves.
- points, at least 3 apart: french-knot, colonial-knot, four-legged-knot, cross-stitch (one cross per point; size is the cross size, default 2.4).
- flowers, each {center, petals 4 to 8, length 2 to 6}: lazy-daisy (petals round a centre) or pistil-stitch (rays round a centre).
- loops, each {from, to} 2 to 7 apart: single lazy-daisy loops for leaves and buds.
- circles, each {center, r between 2.5 and 7}: woven-wheel.
- bars, each {from, to} 2 to 6 apart: bullion-knot.

step is one short instruction to the stitcher for that part. why is one short reason the stitch suits the part. Leave note empty unless you changed something.

A worked example, for "a lemon":
${JSON.stringify(SAMPLE)}`;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function design(req: Request, env: Env) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'The design helper is not set up here.' }, 503);
  const ip = req.headers.get('cf-connecting-ip') ?? 'local';
  if (!(await env.DESIGN_LIMITER.limit({ key: ip })).success) return json({ error: 'Too many designs at once. Try again in a minute.' }, 429);
  const body = (await req.json().catch(() => null)) as { prompt?: unknown; image?: { type?: unknown; data?: unknown } } | null;
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 600) : '';
  const image = body?.image;
  const kind = typeof image?.type === 'string' && ['image/jpeg', 'image/png', 'image/webp'].includes(image.type) ? (image.type as 'image/jpeg' | 'image/png' | 'image/webp') : null;
  const data = kind && typeof image?.data === 'string' && image.data.length < 2_000_000 ? image.data : null;
  if (!prompt && !data) return json({ error: 'Describe a shape or add a photo.' }, 400);

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (kind && data) content.push({ type: 'image', source: { type: 'base64', media_type: kind, data } });
  content.push({ type: 'text', text: prompt || 'Turn this photo into a simple embroidery design.' });

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  try {
    const res = await client.beta.messages
      .stream({
        model: env.CLAUDE_MODEL,
        max_tokens: 32000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content }],
      } as Anthropic.Beta.MessageCreateParamsStreaming)
      .finalMessage();
    if (res.stop_reason === 'refusal') return json({ error: 'That one can’t be designed here. Try a plant, an animal or an object.' }, 422);
    if (res.stop_reason === 'max_tokens') return json({ error: 'That design came out too big. Try something simpler.' }, 422);
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    return json({ design: JSON.parse(text) });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'The designer is busy. Try again in a minute.' }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: 'The designer could not answer. Try again.', detail: `${e.status}` }, 502);
    return json({ error: 'The design came back malformed. Try again.' }, 502);
  }
}

export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);
    if (url.pathname === '/api/design') return req.method === 'POST' ? design(req, env) : json({ error: 'POST only' }, 405);
    return env.ASSETS.fetch(req);
  },
};
