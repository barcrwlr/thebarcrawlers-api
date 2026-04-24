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

// ── STRATEGY ENDPOINT ─────────────────────────────────────────────
app.post('/api/strategy', async (req, res) => {
  const { name, city, hood, type, challenge } = req.body || {};

  console.log('[strategy] request:', { name, city });

  if (!name || !city) {
    return res.status(400).json({ error: 'name and city are required' });
  }

  try {
    const message = await client.messages.create({
      model:      'claude-opus-4-5-20251101',
      max_tokens: 4096,
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

// ── ONBOARDING ENDPOINT ───────────────────────────────────────────
app.post('/api/onboard', async (req, res) => {
  const {
    name, city, neighborhood, barType, capacity,
    websiteUrl, challenge, targetCustomer, features, adBudget,
  } = req.body || {};

  console.log('[onboard] request:', { name, city });

  if (!name || !city) {
    return res.status(400).json({ error: 'name and city are required' });
  }

  try {
    const message = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4096,
      messages:   [{ role: 'user', content: buildOnboardPrompt({ name, city, neighborhood, barType, capacity, websiteUrl, challenge, targetCustomer, features, adBudget }) }],
    });

    const raw = message.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .replace(/```json|```/g, '')
      .trim();

    const parsed = safeParseJSON(raw);
    if (!parsed) throw new Error('Could not parse model response as JSON');

    console.log('[onboard] success:', name, city);
    res.json(parsed);

  } catch (err) {
    console.error('[onboard error]', err.message);
    res.status(500).json({ error: 'Onboarding package generation failed. Please try again.' });
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
  console.log('ANTHROPIC_API_KEY set:', !!process.env.ANTHROPIC_API_KEY);
});

// ── SAFE JSON PARSER ──────────────────────────────────────────────
function safeParseJSON(raw) {
  try { return JSON.parse(raw); } catch (_) {}

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try { return JSON.parse(match[0]); } catch (_) {}

  const fixed = match[0]
    .replace(/,\s*([\]}])/g, '$1')
    .replace(/[\x00-\x1F\x7F]/g, ' ');

  try { return JSON.parse(fixed); } catch (e) {
    console.error('[safeParseJSON] failed, raw length:', raw.length);
    console.error('[safeParseJSON] error at:', e.message);
    return null;
  }
}

// ── ONBOARD PROMPT BUILDER ────────────────────────────────────────
function buildOnboardPrompt({ name, city, neighborhood, barType, capacity, websiteUrl, challenge, targetCustomer, features, adBudget }) {
  return `You are the onboarding AI for TheBarCrawlers.com — an AI marketing service for independent bars. A new client just signed up. Generate a complete Month 1 onboarding package for their bar.

VENUE INTAKE:
Name: ${name}
City: ${city}
${neighborhood    ? 'Neighborhood: '     + neighborhood    : ''}
${barType         ? 'Bar type: '         + barType         : ''}
${capacity        ? 'Capacity: '         + capacity        : ''}
${websiteUrl      ? 'Website: '          + websiteUrl      : 'No current website'}
${challenge       ? 'Biggest challenge: '+ challenge       : ''}
${targetCustomer  ? 'Target customer: '  + targetCustomer  : ''}
${features        ? 'Notable features: ' + features        : ''}
${adBudget        ? 'Monthly ad budget: $'+ adBudget       : ''}

Return ONLY valid JSON with no markdown fences, no preamble. Do NOT use apostrophes in string values.
{
  "audit": {
    "score": <integer 18-65, realistic digital weakness score — lower = more gaps>,
    "gaps": [
      { "label": "Google Business Profile", "severity": "<critical|warn|ok>", "finding": "<specific 1-sentence finding for ${name}>", "fix": "<specific fix action, 1 sentence>" },
      { "label": "Website & SEO", "severity": "<critical|warn|ok>", "finding": "...", "fix": "..." },
      { "label": "Paid advertising", "severity": "<critical|warn|ok>", "finding": "...", "fix": "..." },
      { "label": "AI search visibility", "severity": "<critical|warn|ok>", "finding": "...", "fix": "..." },
      { "label": "Social & content", "severity": "<critical|warn|ok>", "finding": "...", "fix": "..." },
      { "label": "barcrwlr.com listing", "severity": "critical", "finding": "Not yet listed on barcrwlr.com — missing from 97-city nightlife network", "fix": "Create and publish featured listing in ${city} crawl routes this week" }
    ]
  },
  "gbp_description": "<optimized Google Business Profile description, max 750 characters, for ${name} in ${city}${neighborhood ? ' / ' + neighborhood : ''}. Include bar type, atmosphere, signature features, relevant local search keywords. Sound like a real venue, not an ad. No apostrophes.>",
  "barcrwlr_listing": {
    "headline": "<punchy 8-12 word headline for ${name} on barcrwlr.com>",
    "description": "<2-3 paragraph listing description for barcrwlr.com. Energetic but honest. Include neighborhood, vibe, what makes this a good crawl stop. ~120 words. No apostrophes.>",
    "crawl_hook": "<1-sentence hook for the crawl route card. No apostrophes.>"
  },
  "content_calendar": [
    { "week": 1, "type": "<GBP post|Instagram caption|Event announcement|Weekly special|Blog post>", "title": "<specific title for ${name}>", "hook": "<opening line or angle, 1 sentence>" },
    { "week": 1, "type": "...", "title": "...", "hook": "..." },
    { "week": 1, "type": "...", "title": "...", "hook": "..." },
    { "week": 1, "type": "...", "title": "...", "hook": "..." },
    { "week": 1, "type": "...", "title": "...", "hook": "..." },
    { "week": 2, "type": "...", "title": "...", "hook": "..." },
    { "week": 2, "type": "...", "title": "...", "hook": "..." },
    { "week": 2, "type": "...", "title": "...", "hook": "..." },
    { "week": 2, "type": "...", "title": "...", "hook": "..." },
    { "week": 2, "type": "...", "title": "...", "hook": "..." },
    { "week": 3, "type": "...", "title": "...", "hook": "..." },
    { "week": 3, "type": "...", "title": "...", "hook": "..." },
    { "week": 3, "type": "...", "title": "...", "hook": "..." },
    { "week": 3, "type": "...", "title": "...", "hook": "..." },
    { "week": 3, "type": "...", "title": "...", "hook": "..." },
    { "week": 4, "type": "...", "title": "...", "hook": "..." },
    { "week": 4, "type": "...", "title": "...", "hook": "..." },
    { "week": 4, "type": "...", "title": "...", "hook": "..." },
    { "week": 4, "type": "...", "title": "...", "hook": "..." },
    { "week": 4, "type": "...", "title": "...", "hook": "..." }
  ],
  "delivery_checklist": [
    {
      "phase": "Week 1 (Days 1-7)",
      "tasks": [
        "30-min onboarding call with ${name} owner — collect all logins and assets",
        "Run full digital audit — GBP, website, competitor rankings in ${city}",
        "<specific GBP fix task for ${name}>",
        "<specific website task based on current state>",
        "Set up barcrwlr.com listing in ${city}${neighborhood ? ' / ' + neighborhood : ''}"
      ]
    },
    {
      "phase": "Week 2 (Days 8-14)",
      "tasks": [
        "<specific Google Search ad campaign build task for ${city}${neighborhood ? ' / ' + neighborhood : ''}>",
        "<specific Meta ad task targeting ${targetCustomer || 'local bar-goers'}>",
        "Launch first 5 content pieces from content calendar",
        "<specific local SEO task for ${name}>",
        "Install conversion tracking — phone calls, direction requests, ad clicks"
      ]
    },
    {
      "phase": "Week 3 (Days 15-21)",
      "tasks": [
        "First week ad performance review — optimize bids and audiences",
        "Week 2 content batch delivered for approval",
        "<specific AI search task — structured data, GBP Q&A, citations for ${city} bar searches>",
        "<specific task based on ${challenge || 'slow weeknight traffic'}>",
        "Mid-month check-in call — 15 min, share early numbers"
      ]
    },
    {
      "phase": "Week 4 (Days 22-30)",
      "tasks": [
        "Week 3 content batch delivered and scheduled",
        "Full month 1 results report compiled — GBP impressions, ad conversions, ranking changes",
        "<specific month-end optimization task>",
        "Confirm Month 2 KPI targets with client — GBP impressions baseline and 3 tracked conversions",
        "Month 1 results presentation — 30-min call"
      ]
    }
  ],
  "ad_strategy": {
    "google_keywords": ["<keyword 1 for ${name} in ${city}>", "<keyword 2>", "<keyword 3>", "<keyword 4>", "<keyword 5>"],
    "meta_audience": "<2-3 sentence Meta audience targeting — demographics, interests, behaviors, geo radius for ${city}${neighborhood ? ' / ' + neighborhood : ''}>",
    "recommended_split": "<e.g. 60% Google Search ($X/mo), 40% Meta ($X/mo), based on ${adBudget ? '$' + adBudget + '/mo budget' : 'typical $500-700/mo starting budget'}>"
  }
}

Be specific to ${name} in ${city} throughout. Use venue type, challenge, and features to make every output feel custom — not a template. No apostrophes anywhere in the JSON values.`;
}

// ── STRATEGY PROMPT BUILDER ───────────────────────────────────────
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
