const express   = require('express');
const cors      = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app    = express();
const client = new Anthropic();

app.use(express.json({ limit: '10kb' }));

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

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'thebarcrawlers-api',
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    keyPrefix: process.env.ANTHROPIC_API_KEY?.substring(0, 12) || 'NOT SET'
  });
});

app.post('/api/strategy', async (req, res) => {
  const { name, city, hood, type, challenge } = req.body || {};

  console.log('[strategy] request:', { name, city });

  if (!name || !city) {
    return res.status(400).json({ error: 'name and city are required' });
  }

  try {
    const message = await client.messages.create({
      model:      'claude-opus-4-5-20251101',
      max_tokens: 4096,  // increased from 1024 — JSON was getting cut off
      messages:   [{ role: 'user', content: buildPrompt({ name, city, hood, type, challenge }) }],
    });

    const raw = message.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .replace(/```json|```/g, '')
      .trim();

    const parsed = safeParseJSON(raw);
    if (!parsed) throw new Error('Could not parse model response as JSON');

    console.log('[strategy] success:', name, city);
    res.json(parsed);

  } catch (err) {
    console.error('[strategy error]', err.message);
    res.status(500).json({ error: 'Strategy generation failed: ' + err.message });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('thebarcrawlers-api running on port ' + PORT);
  console.log('ANTHROPIC_API_KEY set:', !!process.env.ANTHROPIC_API_KEY);
});

// ── Safe JSON parser ──────────────────────────────────────────────
function safeParseJSON(raw) {
  // Attempt 1: direct parse
  try { return JSON.parse(raw); } catch (_) {}

  // Attempt 2: extract JSON object
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try { return JSON.parse(match[0]); } catch (_) {}

  // Attempt 3: fix trailing commas and control characters
  const fixed = match[0]
    .replace(/,\s*([\]}])/g, '$1')
    .replace(/[\x00-\x1F\x7F]/g, ' ');

  try { return JSON.parse(fixed); } catch (e) {
    console.error('[safeParseJSON] failed, raw length:', raw.length);
    console.error('[safeParseJSON] error at:', e.message);
    return null;
  }
}

// ── Prompt builder ────────────────────────────────────────────────
function buildPrompt({ name, city, hood, type, challenge }) {
  return `You are a nightlife marketing strategist for The Bar Crawlers (thebarcrawlers.com), the B2B arm of barcrwlr.com, an AI bar crawl platform live in 97 cities. Generate a specific, actionable bar growth strategy.

VENUE:
Name: ${name}
City: ${city}
${hood      ? 'Neighborhood: ' + hood      : ''}
${type      ? 'Type: '         + type      : ''}
${challenge ? 'Biggest challenge: ' + challenge : ''}

CRITICAL RULES:
1. Return ONLY valid JSON — no markdown, no explanation, no text before or after
2. Do NOT use apostrophes or single quotes in any string value — use "do not" not "don't", "you are" not "you're", "we will" not "we'll"
3. Keep each "desc" field to 1-2 sentences maximum to stay within output limits

{
  "score": <integer 15-68>,
  "gaps": [
    {"label":"Google ranking","value":"<3-4 words>","status":"<bad|warn|ok>"},
    {"label":"Ad presence","value":"<3-4 words>","status":"<bad|warn|ok>"},
    {"label":"Social content","value":"<3-4 words>","status":"<bad|warn|ok>"},
    {"label":"AI search","value":"<3-4 words>","status":"<bad|warn|ok>"},
    {"label":"Event marketing","value":"<3-4 words>","status":"<bad|warn|ok>"},
    {"label":"barcrwlr listing","value":"<3-4 words>","status":"<bad|warn|ok>"}
  ],
  "sections": [
    {"id":"local_seo","title":"Local SEO and Google presence","actions":[
      {"title":"<action>","desc":"<1-2 sentences specific to ${name} in ${city}>","timeline":"Week 1-2"},
      {"title":"<action>","desc":"<1-2 sentences>","timeline":"Week 2-3"}
    ]},
    {"id":"content","title":"Content and social media system","actions":[
      {"title":"<action>","desc":"<1-2 sentences specific to ${type || 'bar'} in ${city}>","timeline":"Week 1"},
      {"title":"<action>","desc":"<1-2 sentences>","timeline":"Ongoing"}
    ]},
    {"id":"google_ads","title":"Paid advertising strategy","actions":[
      {"title":"<action>","desc":"<1-2 sentences specific to ${city}${hood ? ' / ' + hood : ''}>","timeline":"Week 2"},
      {"title":"<action>","desc":"<1-2 sentences>","timeline":"Month 1-2"}
    ]},
    {"id":"ai_search","title":"AI search visibility","actions":[
      {"title":"<action>","desc":"<1-2 sentences — ChatGPT, Perplexity, Google AI for ${city}>","timeline":"Month 1"},
      {"title":"<action>","desc":"<1-2 sentences>","timeline":"Month 2"}
    ]},
    {"id":"events","title":"Event and weeknight strategy","actions":[
      {"title":"<action>","desc":"<1-2 sentences specific to: ${challenge || 'slow nights'}>","timeline":"Week 2-3"},
      {"title":"<action>","desc":"<1-2 sentences>","timeline":"Ongoing"}
    ]},
    {"id":"barcrwlr","title":"Barcrwlr.com placement and crawl traffic","actions":[
      {"title":"Featured placement on barcrwlr.com in ${city}","desc":"${name} featured in barcrwlr crawl routes for ${city}. 97 cities, highest-intent nightlife traffic. No other agency offers this.","timeline":"Week 1"},
      {"title":"Crawl route integration and SEO backlink","desc":"Integrated into themed routes on barcrwlr.com, passing SEO authority to the venue site while driving crawl night foot traffic.","timeline":"Week 2-3"}
    ]}
  ],
  "cta_headline": "<compelling headline referencing their challenge — no apostrophes>",
  "cta_sub": "<1-2 sentences why The Packed House System solves their problem — no apostrophes>"
}`;
}
