export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { settings, roomId } = req.body;
  if (!settings || !roomId) {
    return res.status(400).json({ error: 'Missing settings or roomId' });
  }

  const { league, format, decade, difficulty, qcount = 10 } = settings;

  const formatInstructions = format === 'Multiple choice'
    ? `All questions must be multiple choice with exactly 4 options.`
    : format === 'Name the list'
    ? `All questions must be list-style where players name multiple items.`
    : `Mix of multiple choice and list-style questions.`;

  const prompt = `You are a hardcore sports trivia question generator. Generate exactly ${qcount} trivia questions with these settings:
- League: ${league}
- Decade: ${decade}
- Difficulty: ${difficulty}
- Format: ${format}

${formatInstructions}

CRITICAL RULES:
1. Every single fact must be 100% accurate. Double-check all stats, years, and names.
2. Do NOT invent stats or fabricate records.
3. Questions should test real knowledge — not just Super Bowl winners or obvious facts.
4. Include variety: player awards, stat leaders, draft picks, team records, trades, coaching, individual game performances.
5. Difficulty guide: Easy = champions/MVPs anyone who watched knows. Medium = stat leaders, playoff runs. Hard = role players, obscure records, specific game stats. Extreme = draft positions, exact splits, game logs.

Return ONLY a valid JSON array. No markdown, no explanation, just the JSON.

For MULTIPLE CHOICE questions use this exact format:
{
  "type": "mc",
  "category": "Category label",
  "question": "The question text",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correct": 0,
  "fact": "A short interesting fact explaining the answer (1-2 sentences)."
}

For LIST questions use this exact format:
{
  "type": "list",
  "category": "Category label",
  "question": "The question text",
  "sub": "Short instruction like '4 answers, in order'",
  "items": ["Answer 1", "Answer 2", "Answer 3"],
  "labels": ["Label for slot 1", "Label for slot 2", "Label for slot 3"],
  "stats": ["Stat 1", "Stat 2", "Stat 3"],
  "aliases": [["answer1", "a1 alias"], ["answer2", "a2 alias"], ["answer3", "a3 alias"]],
  "fact": "A short interesting fact about the list (1-2 sentences)."
}

The "correct" field for MC is the index (0-3) of the correct option.
The "aliases" field for list questions is an array of arrays — each inner array contains all acceptable spellings/nicknames for that answer (all lowercase, no punctuation).
The "labels" field describes what each slot represents (e.g. "2021 season", "MVP 2020").

Generate ${qcount} questions now:`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (!data.content || !data.content[0]) {
      throw new Error('Empty response from Claude');
    }

    let text = data.content[0].text.trim();
    // Strip any markdown fences if present
    text = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

    const questions = JSON.parse(text);

    if (!Array.isArray(questions)) throw new Error('Response is not an array');

    return res.status(200).json({ questions });
  } catch (err) {
    console.error('Generation error:', err);
    return res.status(500).json({ error: 'Failed to generate questions', details: err.message });
  }
}
