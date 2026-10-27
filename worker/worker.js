// Fridge API — a tiny Cloudflare Worker that sits between the Fridge web app and the Claude API.
//
// Why it exists: the browser must never hold your Anthropic API key. The key lives here as an
// encrypted Worker secret. The app proves it is yours with a passcode (also a Worker secret).
//
// Routes (all require the x-fridge-key header to equal the PASSCODE secret):
//   GET  /data  -> the saved fridge state (JSON)
//   PUT  /data  -> replace the saved fridge state
//   POST /ai    -> { prompt, images: [base64 jpeg, ...] } -> { text }
//
// Guard rails: only your GitHub Pages origin is allowed, request sizes are capped, the model and
// max_tokens are fixed here (the app cannot change them), and AI calls stop at MAX_CALLS_PER_MONTH.

const MAX_DATA_BYTES = 900_000;       // KV value limit is 25 MB; this keeps sync snappy
const MAX_PROMPT_CHARS = 20_000;
const MAX_IMAGES = 3;
const MAX_IMAGE_B64 = 4_000_000;      // ~3 MB per image after the app shrinks it

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
    const originOk = allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': originOk ? origin : allowed[0] || 'null',
      'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, x-fridge-key',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' } });

    if (req.method === 'OPTIONS') return new Response(null, { status: originOk ? 204 : 403, headers: cors });
    if (!originOk) return json({ code: 'origin' }, 403);
    if (!env.PASSCODE || !(await same(req.headers.get('x-fridge-key') || '', env.PASSCODE))) return json({ code: 'not_granted' }, 401);

    const { pathname } = new URL(req.url);

    if (pathname === '/data') {
      if (req.method === 'GET') {
        const v = await env.FRIDGE.get('state');
        return json(v ? JSON.parse(v) : {});
      }
      if (req.method === 'PUT') {
        const body = await req.text();
        if (body.length > MAX_DATA_BYTES) return json({ code: 'too_large' }, 413);
        let parsed;
        try { parsed = JSON.parse(body); } catch { return json({ code: 'bad_json' }, 400); }
        if (!parsed || !Array.isArray(parsed.items)) return json({ code: 'bad_shape' }, 400);
        await env.FRIDGE.put('state', JSON.stringify(parsed));
        return json({ ok: true });
      }
    }

    if (pathname === '/ai' && req.method === 'POST') {
      if (!env.ANTHROPIC_API_KEY) return json({ code: 'not_configured' }, 503);
      let input;
      try { input = await req.json(); } catch { return json({ code: 'bad_json' }, 400); }
      const prompt = String(input.prompt || '').slice(0, MAX_PROMPT_CHARS);
      const images = (Array.isArray(input.images) ? input.images : []).slice(0, MAX_IMAGES).filter(i => typeof i === 'string' && i.length <= MAX_IMAGE_B64);
      if (!prompt) return json({ code: 'bad_request' }, 400);

      // Monthly budget: one small KV write per AI call (KV free tier allows 1,000 writes/day).
      const month = new Date().toISOString().slice(0, 7);
      const limit = Number(env.MAX_CALLS_PER_MONTH || 300);
      const used = Number(await env.FRIDGE.get('calls:' + month)) || 0;
      if (used >= limit) return json({ code: 'budget' }, 429);
      await env.FRIDGE.put('calls:' + month, String(used + 1), { expirationTtl: 60 * 60 * 24 * 40 });

      const content = images.map(data => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }));
      content.push({ type: 'text', text: prompt });

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: env.MODEL || 'claude-haiku-5-5', max_tokens: 4096, messages: [{ role: 'user', content }] }),
      });
      const out = await r.json().catch(() => ({}));
      if (r.status === 429) return json({ code: 'rate_limited' }, 429);
      if (!r.ok) return json({ code: 'upstream_error', status: r.status }, 502);
      const text = (out.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      return json({ text });
    }

    return json({ code: 'not_found' }, 404);
  },
};

// Constant-time comparison so the passcode can't be guessed from response timing.
async function same(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
