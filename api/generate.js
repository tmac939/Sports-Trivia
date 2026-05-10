export default async function handler(req, res) {
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

  const prompt = `You are a hardcore sports trivia question generator. Generate exactly ${qcount} trivia questions with these settings:
- League: ${league}
- Decade: ${decade}
- Difficulty: ${difficulty}
- Format: ${format}

CRITICAL RULES:
1. Every single fact must be 100% accurate.
2. Include variety: player awards, stat leaders, draft picks, team records, trades, coaching.
3. Return ONLY a valid JSON array. No markdown, no explanation, just the raw JSON array.

For MULTIPLE CHOICE questions:
{
  "type": "mc",
  "category": "Category label",
  "question": "The question text",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correct": 0,
  "fact": "Short interesting fact (1-2 sentences)."
}

For LIST questions:
{
  "type": "list",
  "category": "Category label",
  "question": "The question text",
  "sub": "Short instruction",
  "items": ["Answer 1", "Answer 2", "Answer 3"],
  "labels": ["Label 1", "Label 2", "Label 3"],
  "stats": ["Stat 1", "Stat 2", "Stat 3"],
  "aliases": [["answer1", "alias1"], ["answer2", "alias2"], ["answer3", "alias3"]],
  "fact": "Short interesting fact (1-2 sentences)."
}

Generate ${qcount} questions now as a raw JSON array:`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const raw = await response.json();
    console.log('Claude response status:', response.status);
    console.log('Claude response body:', JSON.stringify(raw).slice(0, 500));

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
    return res.status(500).json({ error: 'Failed to generate questions', details: err.message });
  }
}
