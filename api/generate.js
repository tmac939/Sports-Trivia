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

  // ── NAME THE NICHE: list-style, EXHAUSTIVE bounded answer sets only ──
  else if (mode === 'niche') {
    prompt = `You are a hardcore sports trivia question generator. Generate exactly 3 "Name the Niche" trivia questions with these settings:
- League: ${league}
- Difficulty: ${difficulty}

CRITICAL RULE — THE ANSWER SET MUST BE COMPLETE AND EXHAUSTIVE, NOT A SAMPLE:
Every question must have a category where you can list EVERY SINGLE valid answer that exists — not a representative sample, not "some examples," but literally all of them. The player should never be able to name something correct that ISN'T in your "items" list.

This means you must REJECT any open-ended category like:
- "Name running backs who rushed for 1000+ yards since 2015" — BAD, this has 40+ possible answers and you can't list them all
- "Name quarterbacks who started a playoff game" — BAD, too many to enumerate
- "Name players who made the Pro Bowl" — BAD, hundreds of valid answers

Instead, use categories that are NATURALLY BOUNDED to a small, fixed, fully-listable set, such as:
- "Name every team to win the Super Bowl in the 2010s" (exactly 10 possible answers, one per year)
- "Name every #1 overall NFL Draft pick from 2015-2024" (exactly 10 answers, one per year)
- "Name every quarterback who started a Super Bowl since 2015" (a small fixed list — verify the real count)
- "Name every player who won NFL MVP since 2000" (one per year, fully listable)
- "Name every team that has appeared in the last 5 Super Bowls" (small fixed list)
- "Name all 32 NFL teams" / "Name all current AFC East starting QBs" (rosters are small and fixed)

The pattern: tie the category to a fixed time window or a fixed structural count (one per year, one per round, one per division, one per franchise) so the full answer set is small (8-20 items) and 100% enumerable. If you cannot confidently list every single valid answer, do not use that category — pick a different one that you can fully enumerate.

Before finalizing each question, mentally verify: "Have I listed every single correct answer, with zero omissions and zero extras?" If you have any doubt, narrow the category further (e.g. add a specific date range or condition) until the set is small enough to be 100% complete.

CRITICAL — TIER RATING RULES:
For every answer, assign a "tier" based on genuine real-world recognizability. Do NOT rate everything "known" — include all 4 tiers.

Tier definitions with concrete NFL examples:
- "iconic"   = a casual fan who barely watches knows this instantly. Examples: Tom Brady, Patrick Mahomes, Peyton Manning.
- "known"    = a regular fan who follows the league would get this. Examples: Derrick Henry, Justin Jefferson, Nick Bosa.
- "niche"    = only fans who watch closely or know the era well would recall. Examples: Tyler Lockett, Amon-Ra St. Brown.
- "deepcut"  = true experts/stat-heads only. Examples: a backup QB who started a handful of games, a one-time Pro Bowler.

REQUIRED DISTRIBUTION per question: roughly 2-3 "iconic", 3-4 "known", 3-4 "niche", 2-3 "deepcut". Do NOT make everything the same tier.

Every fact must be 100% accurate. Do not invent players, teams, or stats. Double check names, years, and team affiliations against real history before including them.

Return ONLY a valid JSON array. No markdown, no explanation.

Format:
{
  "type": "list",
  "category": "Category label",
  "question": "Name as many [X] as you can",
  "sub": "2 minutes — name as many as possible. More obscure answers score more points.",
  "items": ["Answer 1", "Answer 2", ...],
  "tiers": ["iconic", "known", "niche", "deepcut", ...],
  "labels": ["Label 1", "Label 2", ...],
  "stats": ["Stat or context 1", "Stat or context 2", ...],
  "aliases": [["answer1","alias1","last name only"], ["answer2","alias2","last name only"], ...],
  "fact": "Short interesting fact about this group."
}

IMPORTANT ALIAS RULE: every answer's alias array MUST include the player's last name only as one of the entries (e.g. for "Patrick Mahomes" include "mahomes"). This allows players to type just a last name.

All five arrays (items, tiers, labels, stats, aliases) must be exactly the same length.
Aliases should be lowercase, no punctuation.

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
