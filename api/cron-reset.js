const { getSupabase } = require('./_db');

module.exports = async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const supabase = getSupabase();

    // Get the top scorer before resetting
    const { data: top, error: topErr } = await supabase
      .from('players')
      .select('x_username, wallet_address, weekly_score')
      .order('weekly_score', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (topErr) throw topErr;

    // Record the winner if someone actually played
    if (top && top.weekly_score > 0) {
      const weekEnding = new Date().toISOString().split('T')[0];
      const { error: winErr } = await supabase
        .from('winners')
        .insert({
          x_username: top.x_username,
          wallet_address: top.wallet_address,
          score: top.weekly_score,
          week_ending: weekEnding,
          prize_type: 'TBD',
          prize_description: '',
          prize_sent: false,
        });
      if (winErr) throw winErr;
    }

    // Reset all weekly scores
    const { error: resetErr } = await supabase
      .from('players')
      .update({ weekly_score: 0, updated_at: new Date().toISOString() })
      .gte('weekly_score', 0);

    if (resetErr) throw resetErr;

    return res.json({
      success: true,
      winner: top && top.weekly_score > 0 ? top.x_username : null,
      score: top ? top.weekly_score : 0,
    });
  } catch (err) {
    console.error('cron-reset error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
};
