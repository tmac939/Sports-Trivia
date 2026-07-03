module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { question, verification } = req.body;
  if (!question || !verification) return res.status(400).json({ error: 'Missing question or verification' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing API key' });

  let fixPrompt = '';

  if (question.type === 'mc') {
    fixPrompt = `You previously fact-checked this trivia question and found an issue. Use web search to verify the correct facts, then return a fully corrected version of the question.

Original question: ${JSON.stringify(question)}

Fact-check findings:
- Verdict: ${verification.verdict}
- Explanation: ${verification.explanation || ''}
- Suggested correction: ${verification.suggestedCorrection || ''}

Search the web to confirm the accurate facts, then return ONLY a corrected JSON object in this exact format (no markdown, no explanation):
{
  "type": "mc",
  "category": "...",
  "question": "...",
  "options": ["A","B","C","D"],
  "correct": 0,
  "fact": "..."
}

Keep everything that was already correct unchanged. Only fix what's actually wrong. If the question itself is fundamentally flawed and can't be fixed by changing the answer, you may rewrite the question to a similar but verifiably accurate one in the same category/spirit.`;
  } else {
    fixPrompt = `You previously fact-checked this "Name the Niche" trivia question and found issues with its answer list. Use web search to verify the complete, accurate answer set, then return a fully corrected version.

Original question: ${JSON.stringify(question)}

Fact-check findings:
- Verdict: ${verification.verdict}
- Explanation: ${verification.explanation || ''}
- Missing answers found: ${JSON.stringify(verification.missingAnswers || [])}
- Incorrect/extra answers found: ${JSON.stringify(verification.incorrectAnswers || [])}

Search the web to confirm the complete, accurate answer set for this category — every single valid answer, no more, no less. Then return ONLY a corrected JSON object in this exact format (no markdown, no explanation):
{
  "type": "list",
  "category": "...",
  "question": "...",
  "sub": "...",
  "items": [...],
  "tiers": [...],
  "labels": [...],
  "stats": [...],
  "aliases": [[...]],
  "fact": "..."
}

Rules:
- Remove any answers confirmed incorrect/extra.
- Add any answers confirmed missing, with appropriate tier ratings (iconic/known/niche/deepcut) and aliases including last-name-only.
- Keep all five arrays (items, tiers, labels, stats, aliases) the same length and correctly aligned by index.
- If the category itself is too open-ended to ever be complete, narrow the question itself (e.g. add a specific year range) so the corrected list IS complete and accurate.`;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20260209', name: 'web_search' }],
        messages: [{ role: 'user', content: fixPrompt }]
      })
    });

    const raw = await response.json();
    if (!response.ok) return res.status(500).json({ error: 'Claude API error', details: raw });

    const textBlocks = (raw.content || []).filter(b => b.type === 'text').map(b => b.text);
    let text = textBlocks.join('\n').trim();
    text = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response: ' + text.slice(0, 200));

    const corrected = JSON.parse(jsonMatch[0]);
    return res.status(200).json({ corrected });

  } catch(err) {
    console.error('Autofix error:', err);
    return res.status(500).json({ error: err.message });
  }
}
