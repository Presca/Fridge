# Fridge

A cute, phone-first ingredient log and recipe helper. Log what you bought, tap what you want to cook
with, and get a quick recipe that uses up what's about to spoil.

- **Fridge**: tap ingredients to pick them; hold any tile to edit amounts (iOS-style wobble). Items at
  zero move to **Finished**. **Use soon** appears only when something is close to spoiling.
- **Scan**: photo of your shopping, or type/dictate a list. You review every item before it's added.
- **Cook**: pick ingredients, tap **Cook**, then choose your craving (or Surprise me), people eating and
  time you have. You get three quick recipe ideas built from what's actually in the fridge, plus any
  saved recipes that fit. "Cook this" deducts the amounts. Short on something? It offers swaps from the
  same food group.
- **Recipes**: save generated recipes, or paste a recipe, link or Instagram caption.

## What runs where

| Piece | Hosted on | Cost |
| --- | --- | --- |
| The app (`index.html` and friends) | GitHub Pages | Free |
| Sync + AI proxy (`worker/`) | Cloudflare Workers + KV | Free tier |
| AI (photo scan, recipes) | Claude API | Pay per use, see below |

Without the Worker the app still works fully offline on one phone (manual logging only).

## Security model

**Nothing in this repository is secret, and nothing here can access your GitHub account.**

- The repo is static files only: no GitHub Actions, no tokens, no deploy keys.
- Your **Anthropic API key** and the app **passcode** exist only as encrypted Cloudflare Worker
  secrets (`wrangler secret put`). They are never committed and never sent to the browser.
- Each phone types the passcode once in **Settings**; it is stored in that phone's browser only.
- The Worker only accepts requests from `https://presca.github.io`, compares the passcode in constant
  time, fixes the model and output length server-side, caps request sizes, and stops after
  `MAX_CALLS_PER_MONTH` AI calls.
- The page sets a Content Security Policy so it can only talk to itself, Google Fonts and
  `*.workers.dev`.

Good habits that matter more than anything in this repo:
1. Turn on two-factor authentication for GitHub and Cloudflare.
2. Set a **monthly spend limit** in the Anthropic Console (Settings → Limits).
3. Use a long random passcode (`openssl rand -base64 18`) and share it only with your household.
4. If a phone is lost: `npx wrangler secret put PASSCODE` with a new value; old phones are locked out.
5. If the API key leaks: revoke it in the Anthropic Console and set a new one with `wrangler secret put`.

## Setup (about 15 minutes, once)

### 1. Turn on GitHub Pages
Repo → **Settings → Pages** → Source: *Deploy from a branch* → Branch `main`, folder `/ (root)` → Save.
Your app will be at `https://presca.github.io/fridge/`. It works offline already.

### 2. Deploy the Worker (for sync and AI)
You need a free Cloudflare account and Node.js.

```bash
cd worker
npx wrangler login
npx wrangler kv namespace create FRIDGE      # copy the id into wrangler.toml
npx wrangler secret put PASSCODE              # paste a long random passcode
npx wrangler secret put ANTHROPIC_API_KEY     # optional: skip to run sync only, no AI
npx wrangler deploy                           # prints https://fridge-api.<you>.workers.dev
```

### 3. Point the app at it
Put the Worker URL in `config.js`:

```js
window.FRIDGE_CONFIG = { workerUrl: 'https://fridge-api.<you>.workers.dev' };
```

Commit and push. Pages redeploys in about a minute.

### 4. On each phone
Open `https://presca.github.io/fridge/` in Safari → Recipes tab → **Settings** → enter the passcode →
**Save and connect**. Then Share → **Add to Home Screen**. The mint fridge icon is the app icon.

## AI cost

Uses Claude Haiku 5.5 (`claude-haiku-5-5`), the cheapest current model with vision. A grocery photo
plus its answer is a few thousand tokens, so a scan or a recipe costs a fraction of a cent. The Claude
API has no free tier: you prepay credits in the Anthropic Console. The Worker's monthly call cap and
the Console spend limit together keep a bad day bounded.

For better recipes, set `MODEL = "claude-sonnet-5-5"` in `worker/wrangler.toml` and redeploy (roughly
20x the per-token price; still cents per week for a household).

## Limits worth knowing

- Photo counts and weights are estimates. Always glance at the review list before adding.
- Shelf life is a typical estimate unless you enter an expiry date.
- Sync is last-write-wins. If two phones edit within the same second, one edit can be lost.
- Instagram has no import API: copy the caption and paste it into **Recipes → +**.
- If you move the Worker to a custom domain, add that domain to `connect-src` in the
  Content Security Policy at the top of `index.html`.
