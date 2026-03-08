const { getSupabase } = require('./_db');
function isValidWallet(addr) {
  return typeof addr === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { x_username, wallet_address, score } = req.body;
    const username = (typeof x_username === 'string') ? x_username.trim().slice(0, 30) : '';
    if (!username) return res.status(400).json({ success: false, error: 'Missing username.' });
    const wallet = (wallet_address || '').trim();
    if (!isValidWallet(wallet)) return res.status(400).json({ success: false, error: 'Invalid wallet.' });
    if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 500) {
      return res.status(400).json({ success: false, error: 'Invalid score.' });
    }
    const supabase = getSupabase();
    const { data: existing, error: fetchErr } = await supabase
      .from('players').select('*').eq('wallet_address', wallet).maybeSingle();
    if (fetchErr) throw fetchErr;
    if (existing) {
      const updates = { updated_at: new Date().toISOString(), x_username: username };
      if (score > existing.weekly_score) updates.weekly_score = score;
      if (score > existing.best_score) updates.best_score = score;
      if (updates.weekly_score || updates.best_score) {
        const { error: updateErr } = await supabase
          .from('players').update(updates).eq('wallet_address', wallet);
        if (updateErr) throw updateErr;
      }
      return res.json({ success: true, updated: true });
    }
    const { error: insertErr } = await supabase
      .from('players').insert({ x_username: username, wallet_address: wallet, weekly_score: score, best_score: score });
    if (insertErr) throw insertErr;
    return res.json({ success: true, created: true });
  } catch (err) {
    console.error('submit-score error:', err);
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
};
