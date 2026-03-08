const { getSupabase } = require('./_db');

module.exports = async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('players')
      .update({ weekly_score: 0, updated_at: new Date().toISOString() })
      .gte('weekly_score', 0);
    if (error) throw error;
    return res.json({ success: true, reset: true, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('cron-reset error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
};
