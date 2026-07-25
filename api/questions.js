const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { settings, roomId } = req.body;
  if (!settings || !roomId) return res.status(400).json({ error: 'Missing settings or roomId' });

  const { league, leagues, decade, difficulty, mode = 'classic', format, qcount = 10 } = settings;
  // Support both single league (legacy) and leagues array (new multi-select)
  const leagueList = leagues && leagues.length > 0 ? leagues : (league ? [league] : []);

  const sb = createClient(
    process.env.SUPABASE_URL || 'https://dvdcwpqixtnlzdhkvgik.supabase.co',
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
  );

  const nicheRounds = settings.nicheRounds || 3;
  const needed = mode === 'niche' ? nicheRounds : mode === 'gauntlet' ? 12 : qcount;

  try {
    // ── Pull from approved question bank first ──
    let query = sb.from('question_bank')
      .select('*')
      .eq('status', 'approved')
      .eq('mode', mode)
      .in('league', leagueList);

    // For niche: no decade or difficulty filter — use the whole niche bank for selected leagues
    // For classic/gauntlet: filter by difficulty and decade
    if (mode !== 'niche') {
      query = query.eq('difficulty', difficulty);
      if (decade && decade !== 'All eras') {
        query = query.in('decade', [decade, 'All eras']);
      }
    }

    // For classic, match format type
    if (mode === 'classic' && format && format !== 'Mixed') {
      query = query.in('type', [format === 'Multiple choice' ? 'mc' : 'list', 'mixed']);
    }

    const { data: banked, error: bankError } = await query;
    if (bankError) console.error('Bank query error:', bankError);
    const approved = banked || [];
    console.log(`Bank query: mode=${mode} leagues=${leagueList.join(',')} → ${approved.length} approved questions found`);

    // Shuffle approved pool
    const shuffled = approved.sort(() => Math.random() - 0.5);

    // For niche: if we have at least 1 approved question use the bank
    // (better to play 1-2 bank questions than trigger slow generation)
    if (mode === 'niche' && shuffled.length > 0) {
      const questions = shuffled.slice(0, needed).map(r => r.data);
      return res.status(200).json({ questions, source: 'bank' });
    }

    if (shuffled.length >= needed) {
      const questions = shuffled.slice(0, needed).map(r => r.data);
      return res.status(200).json({ questions, source: 'bank' });
    }

    // Not enough — use what we have and generate the rest
    const fromBank = shuffled.map(r => r.data);
    const stillNeeded = needed - fromBank.length;

    // Generate remaining questions
    const genRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        messages: [{ role: 'user', content: buildPrompt({ ...settings, qcount: stillNeeded }) }]
      })
    });

    const genData = await genRes.json();
    if (!genData.content?.[0]?.text) throw new Error('Empty response from Claude');

    let text = genData.content[0].text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const generated = JSON.parse(text);
    if (!Array.isArray(generated)) throw new Error('Not an array');

    // Merge: approved first, then generated
    const questions = [...fromBank, ...generated];
    return res.status(200).json({ questions, source: 'mixed', bankCount: fromBank.length, generatedCount: generated.length });

  } catch(err) {
    console.error('Questions error:', err);
    return res.status(500).json({ error: err.message });
  }
}

function buildPrompt(settings) {
  const { league, decade, difficulty, format, qcount, mode } = settings;

  if (mode === 'gauntlet') {
    return `Generate exactly ${qcount} multiple choice sports trivia questions for a GAUNTLET game.
League: ${league} | Decade: ${decade}
Difficulty progression: questions 1-3 Easy, 4-6 Medium, 7-9 Hard, 10-12 Extreme.
Return ONLY a JSON array. Each item: {"type":"mc","category":"...","question":"...","options":["A","B","C","D"],"correct":0,"fact":"...","difficulty":"Easy"}`;
  }

  if (mode === 'niche') {
    return `Generate exactly ${qcount} "Name the Niche" questions. League: ${league} | Difficulty: ${difficulty}

CRITICAL: The category must be a BOUNDED, FULLY ENUMERABLE set — every single valid answer must appear in "items" with zero omissions. Reject open-ended categories like "name RBs who rushed 1000+ yards since 2015" (too many answers, can't list them all). Instead use categories tied to a fixed year range or fixed structural count, e.g. "every Super Bowl champion in the 2010s," "every #1 draft pick 2015-2024," "every NFL MVP since 2010," "all 32 NFL teams." Before finalizing, verify you have listed every correct answer with none missing and none extra. If you can't be 100% sure the list is complete, pick a narrower category.

STRONG PREFERENCE: prioritize stat-based categories across these angles — season leaders (e.g. "every rushing yards leader 2014-2023"), career milestones/records (e.g. "every QB with 5+ Super Bowl rings," "every RB with a 2,000-yard season" — pick rare enough thresholds the list is short), and single-game performances (e.g. "every player to rush for 250+ yards in a game"). Use a specific numeric threshold or exact year range so the set stays small and fully verifiable. At least 2 of the ${qcount} questions should be stat-based, mixing across these angles.

Each answer needs a "tier": iconic(2-3 per question), known(3-4), niche(3-4), deepcut(2-3). Do not rate everything the same tier.
Every fact must be accurate — do not invent players, teams, or years.

Return ONLY a JSON array. Each item: {"type":"list","category":"...","question":"Name as many [X] as you can","sub":"2 minutes","items":[...],"tiers":[...],"labels":[...],"stats":[...],"aliases":[[...]],"fact":"..."}
All five arrays same length. Aliases include last-name-only.`;
  }

  const fmtInstr = format === 'Multiple choice'
    ? 'All multiple choice with 4 options.'
    : format === 'Name the list'
    ? 'All list-style, 3-6 items, vary count.'
    : 'Mix of multiple choice and list questions.';

  return `Generate exactly ${qcount} sports trivia questions.
League: ${league} | Decade: ${decade} | Difficulty: ${difficulty} | Format: ${format}
${fmtInstr}
Return ONLY a JSON array.
MC: {"type":"mc","category":"...","question":"...","options":["A","B","C","D"],"correct":0,"fact":"..."}
List: {"type":"list","category":"...","question":"...","sub":"...","items":[...],"labels":[...],"stats":[...],"aliases":[[...]],"fact":"..."}`;
}
