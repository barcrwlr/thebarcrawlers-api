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
      max_tokens: 1024,
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
// Handles common issues with model-generated JSON:
// - Unescaped apostrophes in strings (you're, we'll, doesn't)
// - Trailing commas
// - Extra text before/after the JSON object
function safeParseJSON(raw) {
  // Attempt 1: direct parse
  try { return JSON.parse(raw); } catch (_) {}

  // Attempt 2: extract the JSON object and try again
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  const extracted = match[0];

  try { return JSON.parse(extracted); } catch (_) {}

  // Attempt 3: fix common issues then parse
  const fixed = extracted
    // Remove trailing commas before ] or }
    .replace(/,\s*([\]}])/g, '$1')
    // Fix unescaped apostrophes inside JSON string values
    // Matches: "some text with it's an apostrophe"
    .replace(/"([^"]*?)'/g, (match, p1) => '"' + p1.replace(/'/g, "\\'"))
    // Remove any control characters that break JSON
    .replace(/[\x00-\x1F\x7F]/g, ' ');

  try { return JSON.parse(fixed); } catch (_) {}

  // Attempt 4: ask the model to fix it (not worth the latency, just log)
  console.error('[safeParseJSON] all attempts failed, raw length:', raw.length);
  console.error('[safeParseJSON] raw preview:', raw.substring(3600, 3800));
  return null;
}

// ── Prompt builder ────────────────────────────────────────────────
// Key change: removed apostrophes from the prompt template itself
// and instructed the model to avoid them in JSON output
function buildPrompt({ name, city, hood, type, challenge }) {
  return `You are a nightlife marketing strategist for The Bar Crawlers (thebarcrawlers.com), the B2B arm of barcrwlr.com, an AI bar crawl platform live in 97 cities. Generate a specific, actionable bar growth strategy.

VENUE:
Name: ${name}
City: ${city}
${hood      ? 'Neighborhood: ' + hood      : ''}
${type      ? 'Type: '         + type      : ''}
${challenge ? 'Biggest challenge: ' + challenge : ''}

CRITICAL: Return ONLY valid JSON. Do NOT use apostrophes or single quotes anywhere in the output — use alternative phrasing instead (e.g. "you are" not "you're", "do not" not "don't", "we will" not "we'll"). This is essential for JSON validity.

{
  "score": <integer 15-68, realistic digital weakness score>,
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
      {"title":"<action>","desc":"<2 sentences specific to ${name} in ${city}>","timeline":"Week 1-2"},
      {"title":"<action>","desc":"<explanation>","timeline":"Week 2-3"}
    ]},
    {"id":"content","title":"Content and social media system","actions":[
      {"title":"<action>","desc":"<specific to ${type || 'bar'} in ${city}>","timeline":"Week 1"},
      {"title":"<action>","desc":"<explanation>","timeline":"Ongoing"}
    ]},
    {"id":"google_ads","title":"Paid advertising strategy","actions":[
      {"title":"<action>","desc":"<specific to ${city}${hood ? ' / ' + hood : ''}>","timeline":"Week 2"},
      {"title":"<action>","desc":"<explanation>","timeline":"Month 1-2"}
    ]},
    {"id":"ai_search","title":"AI search visibility","actions":[
      {"title":"<action>","desc":"<ChatGPT, Perplexity, Google AI Overviews for ${city}>","timeline":"Month 1"},
      {"title":"<action>","desc":"<explanation>","timeline":"Month 2"}
    ]},
    {"id":"events","title":"Event and weeknight strategy","actions":[
      {"title":"<action>","desc":"<specific to: ${challenge || 'slow nights'}>","timeline":"Week 2-3"},
      {"title":"<action>","desc":"<explanation>","timeline":"Ongoing"}
    ]},
    {"id":"barcrwlr","title":"Barcrwlr.com placement and crawl traffic","actions":[
      {"title":"Featured placement on barcrwlr.com in ${city}","desc":"${name} featured in barcrwlr crawl routes for ${city}. 97 cities, highest-intent nightlife traffic. No other agency offers this.","timeline":"Week 1"},
      {"title":"Crawl route integration and SEO backlink","desc":"Integrated into themed routes and city guides on barcrwlr.com, passing SEO authority directly to the venue site.","timeline":"Week 2-3"}
    ]}
  ],
  "cta_headline": "<compelling headline referencing their specific challenge>",
  "cta_sub": "<1-2 sentences why The Packed House System solves their problem at ${name}>"
}

Every action must be specific to ${name} in ${city}. Never score above 68. No apostrophes in any string value.`;
}
