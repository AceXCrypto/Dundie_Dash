const { getSupabase } = require('./_db');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const secret = req.headers['x-reset-secret'] || (req.body && req.body.secret);
    if (secret !== process.env.RESET_SECRET) return res.status(403).json({ error: 'Unauthorized.' });
    const supabase = getSupabase();
    const { error } = await supabase
      .from('players').update({ weekly_score: 0, updated_at: new Date().toISOString() }).gte('weekly_score', 0);
    if (error) throw error;
    return res.json({ success: true, reset: true });
  } catch (err) {
    console.error('reset-weekly error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
};
