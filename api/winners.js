const { getSupabase } = require('./_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('winners')
      .select('x_username, score, week_ending, prize_type, prize_description, prize_sent')
      .order('week_ending', { ascending: false })
      .limit(12);
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    console.error('winners error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
};
