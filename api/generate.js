module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { settings, roomId } = req.body;
  if (!settings || !roomId) {
    return res.status(400).json({ error: 'Missing settings or roomId' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing API key in environment variables' });
  }

  const { league, format, decade, difficulty, qcount = 10 } = settings;

  const formatInstructions = format === 'Multiple choice'
    ? `All questions must be multiple choice with exactly 4 options.`
    : format === 'Name the list'
    ? `All questions must be list-style where players name multiple items. IMPORTANT: Vary the number of items across questions — some should have 3 items, some 4, some 5, and some 6. Do NOT default to 3 items every time. Match the item count to the question naturally (e.g. "name the top 5 rushers" = 5 items, "name all 6 division winners" = 6 items).`
    : `Mix of multiple choice and list-style questions. For list questions, vary the number of items — use 3, 4, 5, or 6 items depending on what fits the question naturally.`;

  const prompt = `You are a hardcore sports trivia question generator. Generate exactly ${qcount} trivia questions with these settings:
- League: ${league}
- Decade: ${decade}
- Difficulty: ${difficulty}
- Format: ${format}

${formatInstructions}

CRITICAL RULES:
1. Every single fact must be 100% accurate. Double-check all stats, years, and names.
2. Do NOT invent stats or fabricate records.
3. Questions should test real knowledge — not just champions and MVPs.
4. Include variety: stat leaders, draft picks, team records, trades, coaches, award winners, playoff runs, individual game performances.
5. Difficulty guide: Easy = champions/MVPs anyone who watched knows. Medium = stat leaders, playoff runs. Hard = role players, obscure records, specific game stats. Extreme = draft positions, exact splits, game logs.
6. For list questions: the number of items in "items", "labels", "stats", and "aliases" arrays MUST all be identical.

Return ONLY a valid JSON array. No markdown, no explanation, just raw JSON.

For MULTIPLE CHOICE questions:
{
  "type": "mc",
  "category": "Category label",
  "question": "The question text",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correct": 0,
  "fact": "A short interesting fact explaining the answer (1-2 sentences)."
}

For LIST questions (items can be 3, 4, 5, or 6 — choose what fits the question best):
{
  "type": "list",
  "category": "Category label",
  "question": "The question text",
  "sub": "Short instruction e.g. '5 answers, in order'",
  "items": ["Answer 1", "Answer 2", "Answer 3", "Answer 4", "Answer 5"],
  "labels": ["Label 1", "Label 2", "Label 3", "Label 4", "Label 5"],
  "stats": ["Stat 1", "Stat 2", "Stat 3", "Stat 4", "Stat 5"],
  "aliases": [["answer1","alias1"], ["answer2","alias2"], ["answer3","alias3"], ["answer4","alias4"], ["answer5","alias5"]],
  "fact": "A short interesting fact about the list (1-2 sentences)."
}

Notes:
- "correct" for MC is the index (0-3) of the correct answer.
- "aliases" is an array of arrays — each inner array has all acceptable spellings/nicknames for that answer, all lowercase, no punctuation.
- "labels" describes what each slot represents (e.g. "2021 rushing leader", "1st pick 2020 draft").
- All four list arrays (items, labels, stats, aliases) must have the same length.

Generate ${qcount} questions now:`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const raw = await response.json();
    console.log('Claude status:', response.status);

    if (!response.ok) {
      return res.status(500).json({ error: 'Claude API error', details: raw });
    }

    if (!raw.content || !raw.content[0] || !raw.content[0].text) {
      return res.status(500).json({ error: 'Empty content from Claude', raw });
    }

    let text = raw.content[0].text.trim();
    text = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

    const questions = JSON.parse(text);
    if (!Array.isArray(questions)) throw new Error('Response is not an array');

    return res.status(200).json({ questions });

  } catch (err) {
    console.error('Generation error:', err);
    return res.status(500).json({ error: err.message });
  }
}
