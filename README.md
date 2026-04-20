# thebarcrawlers-api

API server for thebarcrawlers.com. Built to serve the strategy generator tool
from Readdy now, and host the full site on Railway later — without rewriting anything.

---

## Architecture

```
Phase 1 (now)           Phase 2 (when you move off Readdy)
─────────────────       ──────────────────────────────────
Readdy (frontend)  →    Railway (frontend + backend)
Railway (API only) →    Railway (everything)

thebarcrawlers.com      thebarcrawlers.com
      ↓ POST                  ↓ same-origin
Railway /api/strategy   Railway /api/strategy
      ↓                       ↓
Anthropic API           Anthropic API
```

---

## Local development

```bash
git clone https://github.com/YOUR_USERNAME/thebarcrawlers-api
cd thebarcrawlers-api
npm install
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env
npm run dev
```

Test the endpoint:
```bash
curl -X POST http://localhost:3000/api/strategy \
  -H "Content-Type: application/json" \
  -d '{"name":"The Rusty Nail","city":"Nashville","hood":"Broadway","type":"Cocktail Bar","challenge":"Slow weeknights"}'
```

---

## Deploy to Railway

1. Push this repo to GitHub
2. Go to railway.app → New Project → Deploy from GitHub repo
3. Select this repo
4. Add environment variable: `ANTHROPIC_API_KEY` = your key
5. Railway auto-detects Node.js and deploys

Your API URL will be: `https://thebarcrawlers-api-production.up.railway.app`

Add a custom domain if you want: `api.thebarcrawlers.com`

---

## Connecting Readdy to the API

In Readdy's custom code panel, the fetch call is:

```js
const res = await fetch('https://YOUR_RAILWAY_URL/api/strategy', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, city, hood, type, challenge })
});
const strategy = await res.json();
```

Replace `YOUR_RAILWAY_URL` with the Railway URL above.

---

## Phase 2: Moving the full site to Railway

When you're ready to move off Readdy:

1. Export or rebuild your site as static HTML/CSS/JS
2. Drop the built files into the `/public` folder in this repo
3. In `src/server.js`, uncomment these two lines:
   ```js
   // const publicDir = join(__dirname, '..', 'public');
   // if (existsSync(publicDir)) app.use(express.static(publicDir));
   ```
4. Push to GitHub → Railway auto-redeploys
5. Point your thebarcrawlers.com DNS to Railway
6. Remove the CORS restrictions (same-origin now)

That's it. The API code doesn't change at all.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `ALLOWED_ORIGINS` | No | Extra comma-separated CORS origins |
| `PORT` | No | Set automatically by Railway |

---

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check — returns `{status: "ok"}` |
| POST | `/api/strategy` | Generate bar growth strategy |

### POST /api/strategy

**Request body:**
```json
{
  "name": "The Rusty Nail",
  "city": "Nashville",
  "hood": "Broadway",
  "type": "Cocktail Bar",
  "challenge": "Slow weeknights — can't fill seats Mon–Thu"
}
```
`name` and `city` are required. Everything else is optional but improves strategy quality.

**Response:** JSON strategy object with score, gaps, sections, and CTA copy.
