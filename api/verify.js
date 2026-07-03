module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'Missing question' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Missing API key' });

  // Build a fact-check prompt depending on question type
  let factCheckPrompt = '';
  if (question.type === 'mc') {
    factCheckPrompt = `Fact-check this trivia question using web search. Verify the correct answer is accurate.

Question: "${question.question}"
Options: ${question.options.join(', ')}
Claimed correct answer: "${question.options[question.correct]}"
Claimed supporting fact: "${question.fact}"

Search the web to verify this. Respond with ONLY a JSON object (no markdown):
{
  "verdict": "correct" | "incorrect" | "uncertain",
  "explanation": "1-2 sentence explanation of what you found",
  "suggestedCorrection": "if incorrect, what the right answer/fact actually is, otherwise empty string"
}`;
  } else {
    factCheckPrompt = `Fact-check this trivia question's answer list using web search. The question requires the list to be COMPLETE — every valid answer must be included and there must be ZERO incorrect or extra answers.

Question: "${question.question}"
Category: "${question.category}"
Listed answers: ${(question.items || []).join(', ')}

Search the web to verify:
1. Are all listed answers actually correct/valid for this category?
2. Is the list complete — are there any valid answers missing?
3. Are there any answers in the list that should NOT be there?

Respond with ONLY a JSON object (no markdown):
{
  "verdict": "correct" | "incorrect" | "uncertain",
  "explanation": "1-3 sentence summary of what you found",
  "missingAnswers": ["any valid answers that are missing from the list, empty array if none"],
  "incorrectAnswers": ["any answers in the list that are wrong/shouldn't be there, empty array if none"]
}`;
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
        max_tokens: 2000,
        tools: [{ type: 'web_search_20260209', name: 'web_search' }],
        messages: [{ role: 'user', content: factCheckPrompt }]
      })
    });

    const raw = await response.json();
    if (!response.ok) return res.status(500).json({ error: 'Claude API error', details: raw });

    // Extract the final text response (after any tool use blocks)
    const textBlocks = (raw.content || []).filter(b => b.type === 'text').map(b => b.text);
    let text = textBlocks.join('\n').trim();
    text = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

    // Find the JSON object in the text (in case there's surrounding commentary)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response: ' + text.slice(0, 200));

    const result = JSON.parse(jsonMatch[0]);
    return res.status(200).json(result);

  } catch(err) {
    console.error('Verify error:', err);
    return res.status(500).json({ error: err.message });
  }
}
