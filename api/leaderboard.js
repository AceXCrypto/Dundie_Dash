const { getSupabase } = require('./_db');
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('players').select('x_username, weekly_score, best_score')
      .gt('weekly_score', 0).order('weekly_score', { ascending: false }).limit(10);
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    console.error('leaderboard error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
};
