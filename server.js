const express   = require('express');
const cors      = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app    = express();
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

app.use(express.json({ limit: '10kb' }));

// ── CORS ──────────────────────────────────────────────────────────
const ALLOWED = [
  'https://thebarcrawlers.com',
  'https://www.thebarcrawlers.com',
  'http://localhost:3000',
  'http://localhost:5173',
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED.includes(origin)) return cb(null, true);
    cb(new Error('CORS blocked: ' + origin));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

// ── HEALTH CHECK (Railway needs this) ────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'thebarcrawlers-api' });
});

// ── STRATEGY ENDPOINT ─────────────────────────────────────────────
app.post('/api/strategy', async (req, res) => {
  const { name, city, hood, type, challenge } = req.body || {};

  if (!name || !city) {
    return res.status(400).json({ error: 'name and city are required' });
  }

  try {
    const message = await client.messages.create({
      model:      'claude-opus-4-5',
      max_tokens: 1024,
      messages:   [{ role: 'user', content: buildPrompt({ name, city, hood, type, challenge }) }],
    });

    const raw = message.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .replace(/```json|```/g, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No valid JSON in response');
      parsed = JSON.parse(match[0]);
    }

    res.json(parsed);

  } catch (err) {
    console.error('[strategy error]', err.message);
    res.status(500).json({ error: 'Strategy generation failed. Please try again.' });
  }
});

// ── 404 ───────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── START ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('thebarcrawlers-api running on port ' + PORT);
});

// ── PROMPT BUILDER ────────────────────────────────────────────────
function buildPrompt({ name, city, hood, type, challenge }) {
  return `You are a nightlife marketing strategist for The Bar Crawlers (thebarcrawlers.com), the B2B arm of barcrwlr.com — an AI bar crawl platform live in 97 cities. Generate a specific, actionable bar growth strategy.

VENUE:
Name: ${name}
City: ${city}
${hood      ? 'Neighborhood: ' + hood      : ''}
${type      ? 'Type: '         + type      : ''}
${challenge ? 'Biggest challenge: ' + challenge : ''}

Return ONLY valid JSON with no markdown, no preamble:
{
  "score": <integer 15-68, realistic digital weakness score>,
  "gaps": [
    {"label":"Google ranking","value":"<3-4 word assessment>","status":"<bad|warn|ok>"},
    {"label":"Ad presence","value":"<3-4 words>","status":"<bad|warn|ok>"},
    {"label":"Social content","value":"<3-4 words>","status":"<bad|warn|ok>"},
    {"label":"AI search","value":"<3-4 words>","status":"<bad|warn|ok>"},
    {"label":"Event marketing","value":"<3-4 words>","status":"<bad|warn|ok>"},
    {"label":"barcrwlr listing","value":"<3-4 words>","status":"<bad|warn|ok>"}
  ],
  "sections": [
    {"id":"local_seo","title":"Local SEO & Google presence","actions":[
      {"title":"<specific action>","desc":"<2 sentences specific to ${name} in ${city}${hood ? ' / ' + hood : ''}>","timeline":"Week 1-2"},
      {"title":"<action>","desc":"<explanation>","timeline":"Week 2-3"},
      {"title":"<action>","desc":"<explanation>","timeline":"Month 1"}
    ]},
    {"id":"content","title":"Content & social media system","actions":[
      {"title":"<action specific to ${type || 'bar'} in ${city}>","desc":"<explanation>","timeline":"Week 1"},
      {"title":"<action>","desc":"<explanation>","timeline":"Ongoing"}
    ]},
    {"id":"google_ads","title":"Paid advertising strategy","actions":[
      {"title":"<action specific to ${city}${hood ? ' / ' + hood : ''}>","desc":"<explanation>","timeline":"Week 2"},
      {"title":"<action>","desc":"<explanation>","timeline":"Month 1-2"}
    ]},
    {"id":"ai_search","title":"AI search visibility","actions":[
      {"title":"<action>","desc":"<urgent — ChatGPT, Perplexity, Google AI Overviews for ${city}>","timeline":"Month 1"},
      {"title":"<action>","desc":"<explanation>","timeline":"Month 2"}
    ]},
    {"id":"events","title":"Event & weeknight strategy","actions":[
      {"title":"<action specific to: ${challenge || 'slow nights'}>","desc":"<explanation>","timeline":"Week 2-3"},
      {"title":"<action>","desc":"<explanation>","timeline":"Ongoing"}
    ]},
    {"id":"barcrwlr","title":"Barcrwlr.com placement & crawl traffic","actions":[
      {"title":"Featured placement on barcrwlr.com in ${city}","desc":"${name} featured in barcrwlr crawl routes for ${city}${hood ? ' in the ' + hood + ' area' : ''}. Barcrwlr operates across 97 cities driving active nightlife seekers — the highest-intent bar traffic available. No other agency offers this.","timeline":"Week 1"},
      {"title":"Crawl route integration and SEO backlink","desc":"We integrate ${name} into themed crawl routes and city guides on barcrwlr.com, passing direct SEO authority to your site while driving ongoing crawl night foot traffic.","timeline":"Week 2-3"}
    ]}
  ],
  "cta_headline": "<compelling headline referencing their specific challenge>",
  "cta_sub": "<1-2 sentences why The Packed House System solves their exact problem at ${name}>"
}

Make every action specific to ${name} in ${city}. Reference neighborhood, venue type, and challenge directly. Be concrete. Never score above 68.`;
}
