module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { settings, roomId } = req.body;
  if (!settings || !roomId) return res.status(400).json({ error: 'Missing settings or roomId' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing API key' });

  const { league, format, decade, difficulty, qcount = 10, mode = 'classic' } = settings;

  let prompt = '';

  // ── GAUNTLET: 12 questions, 3 per difficulty tier ──
  if (mode === 'gauntlet') {
    prompt = `You are a hardcore sports trivia question generator. Generate exactly 12 multiple choice questions for a GAUNTLET mode game with these settings:
- League: ${league}
- Decade: ${decade}

The questions MUST follow this exact difficulty progression:
- Questions 1-3: Easy (champions, MVPs, anyone who watched knows)
- Questions 4-6: Medium (stat leaders, playoff runs, notable trades)
- Questions 7-9: Hard (role players, obscure records, specific game stats)
- Questions 10-12: Extreme (draft positions, exact splits, game logs, obscure facts)

Each question must be multiple choice with 4 options.
Include variety: awards, stat leaders, draft picks, team records, coaches, trades, individual performances.
Every fact must be 100% accurate.

Return ONLY a valid JSON array. No markdown, no explanation.

Format:
{
  "type": "mc",
  "category": "Category label",
  "question": "The question text",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correct": 0,
  "fact": "Short interesting fact (1-2 sentences).",
  "difficulty": "Easy"
}

Generate all 12 questions now:`;
  }

  // ── NAME THE NICHE: list-style, large answer pools ──
  else if (mode === 'niche') {
    prompt = `You are a hardcore sports trivia question generator. Generate exactly 3 "Name the Niche" trivia questions with these settings:
- League: ${league}
- Decade: ${decade}
- Difficulty: ${difficulty}

Each question asks players to name as many valid answers as possible from a large pool within 2 minutes.
Questions should have 8-15 valid answers so players can find obvious ones AND obscure ones.
Obscure answers should be genuinely harder to think of, rewarding deep knowledge.

Every fact must be 100% accurate.

Return ONLY a valid JSON array. No markdown, no explanation.

Format:
{
  "type": "list",
  "category": "Category label",
  "question": "Name as many [X] as you can",
  "sub": "2 minutes — name as many as possible. Obscure answers score more.",
  "items": ["Answer 1", "Answer 2", ... up to 15 answers],
  "labels": ["Label 1", "Label 2", ...],
  "stats": ["Stat or context 1", "Stat or context 2", ...],
  "aliases": [["answer1","alias1"], ["answer2","alias2"], ...],
  "fact": "Short interesting fact about this group."
}

All four arrays (items, labels, stats, aliases) must be the same length.
Aliases should be lowercase, no punctuation, include common nicknames and last-name-only versions.

Generate 3 niche questions now:`;
  }

  // ── CLASSIC ──
  else {
    const formatInstructions = format === 'Multiple choice'
      ? `All questions must be multiple choice with exactly 4 options.`
      : format === 'Name the list'
      ? `All questions must be list-style. IMPORTANT: Vary the number of items — use 3, 4, 5, or 6 items depending on what fits the question naturally. Do NOT default to 3 every time.`
      : `Mix of multiple choice and list-style questions. For list questions, vary items between 3 and 6.`;

    prompt = `You are a hardcore sports trivia question generator. Generate exactly ${qcount} trivia questions with these settings:
- League: ${league}
- Decade: ${decade}
- Difficulty: ${difficulty}
- Format: ${format}

${formatInstructions}

CRITICAL RULES:
1. Every single fact must be 100% accurate.
2. Include variety: stat leaders, draft picks, team records, trades, coaches, award winners, playoff runs, individual game performances.
3. For list questions: items, labels, stats, and aliases arrays must all be the same length.
4. Difficulty: Easy = MVPs/champions. Medium = stat leaders, playoff runs. Hard = role players, obscure records. Extreme = draft slots, splits, game logs.

Return ONLY a valid JSON array. No markdown, no explanation.

Multiple choice format:
{
  "type": "mc",
  "category": "Category label",
  "question": "The question text",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correct": 0,
  "fact": "Short interesting fact (1-2 sentences)."
}

List format (3-6 items):
{
  "type": "list",
  "category": "Category label",
  "question": "The question text",
  "sub": "Short instruction e.g. '5 answers, in order'",
  "items": ["Answer 1", "Answer 2", "Answer 3", "Answer 4"],
  "labels": ["Label 1", "Label 2", "Label 3", "Label 4"],
  "stats": ["Stat 1", "Stat 2", "Stat 3", "Stat 4"],
  "aliases": [["answer1","alias1"],["answer2","alias2"],["answer3","alias3"],["answer4","alias4"]],
  "fact": "Short interesting fact (1-2 sentences)."
}

Generate ${qcount} questions now:`;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:'claude-sonnet-4-6', max_tokens:8000, messages:[{ role:'user', content:prompt }] })
    });
    const raw = await response.json();
    console.log('Claude status:', response.status);
    if (!response.ok) return res.status(500).json({ error:'Claude API error', details:raw });
    if (!raw.content?.[0]?.text) return res.status(500).json({ error:'Empty response from Claude' });
    let text = raw.content[0].text.trim().replace(/^```json\n?/,'').replace(/\n?```$/,'').trim();
    const questions = JSON.parse(text);
    if (!Array.isArray(questions)) throw new Error('Not an array');
    return res.status(200).json({ questions });
  } catch(err) {
    console.error('Generation error:', err);
    return res.status(500).json({ error: err.message });
  }
}
