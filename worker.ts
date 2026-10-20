import Anthropic from '@anthropic-ai/sdk';
import { STITCHES } from './src/lib/stitches.ts';

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
          paths: { type: 'array', items: { type: 'array', items: pt } },
          shapes: { type: 'array', items: { type: 'array', items: pt } },
          angle: { type: 'number' },
          size: { type: 'number' },
          points: { type: 'array', items: pt },
          leaves: { type: 'array', items: obj({ base: pt, tip: pt, width: { type: 'number' } }, ['base', 'tip', 'width']) },
          flowers: { type: 'array', items: obj({ center: pt, petals: { type: 'integer' }, length: { type: 'number' } }, ['center', 'petals', 'length']) },
          loops: { type: 'array', items: obj({ from: pt, to: pt }, ['from', 'to']) },
          circles: { type: 'array', items: obj({ center: pt, r: { type: 'number' } }, ['center', 'r']) },
          bars: { type: 'array', items: obj({ from: pt, to: pt }, ['from', 'to']) },
        },
        ['stitch', 'color', 'colorName', 'step', 'why'],
      ),
    },
  },
  ['name', 'blurb', 'note', 'level', 'parts'],
);

const SYSTEM = `You design small hand-embroidery patterns for beginners. Sampler, an animated embroidery site, turns each design into a guided project: it traces your pattern in blue pen on linen, then stitches it part by part.

Coordinates are fabric units, about a millimetre each. The hoop is a circle of radius 30 centred on (0, 0); keep everything within 24 of the centre. x grows to the right and y grows downwards, so negative y is the top.

Design rules:
- Keep it simple and recognisable: 3 to 7 parts, about 40 by 40 units overall, clean shapes rather than fine detail.
- Never draw people, faces, hands, bodies or any human figure. If asked for one, design a related object, plant or animal instead and say so in note.
- Choose stitches the way an embroiderer would. The stitches available, and what each is good for:
${STITCHES.map((s) => `  ${s.slug}: ${s.use} Good for ${s.good.map(([t]) => t.toLowerCase()).join(', ')}.`).join('\n')}
- Order parts the way you would stitch them: stems and outlines, then fills, then knots and details on top.
- Each part is one stitch in one colour. Use real floss colours as hex with a plain colour name.

Geometry: give each part only the field its stitch uses. Points are [x, y].
- paths, a list of polylines with 2 to 12 points each (they are smoothed): running-stitch, back-stitch, split-stitch, stem-stitch, whipped-running-stitch (color2 is the whipping colour), chain-stitch, coral-stitch, couching (color2 is the tacking colour), blanket-stitch (legs fall on the left of the direction of travel), feather-stitch and herringbone-stitch (best kept straight), cretan-stitch (a band 4 wide along the path), fly-stitch (a fern of stacked Vs along the path).
- shapes, a list of polygons with 3 to 40 points that do not cross themselves: satin-stitch (angle is the stitch direction in degrees, 0 left to right, 90 top to bottom; keep stitches under 14 long), long-and-short-stitch (angle; color is the shade at the near edge, color2 the second shade), seed-stitch (scattered inside).
- leaves, each {base, tip, width}: fishbone-stitch or satin-stitch leaves.
- points, at least 3 apart: french-knot, colonial-knot, four-legged-knot, cross-stitch (one cross per point; size is the cross size, default 2.4).
- flowers, each {center, petals 4 to 8, length 2 to 6}: lazy-daisy (petals round a centre) or pistil-stitch (rays round a centre).
- loops, each {from, to} 2 to 7 apart: single lazy-daisy loops for leaves and buds.
- circles, each {center, r between 2.5 and 7}: woven-wheel.
- bars, each {from, to} 2 to 6 apart: bullion-knot.

step is one short instruction to the stitcher for that part. why is one short reason the stitch suits the part. Leave note empty unless you changed something.`;

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
    const res = await client.beta.messages.create({
      model: env.CLAUDE_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
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
