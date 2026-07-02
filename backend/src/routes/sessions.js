const router = require('express').Router();
const { supabase } = require('../middleware/auth');

// GET /api/sessions/:projectId — fetch chat history
router.get('/:projectId', async (req, res, next) => {
  try {
    // Verify project belongs to user first
    const { data: proj } = await supabase
      .from('projects').select('id')
      .eq('id', req.params.projectId)
      .eq('user_id', req.user.id).single();
    if (!proj) return res.status(404).json({ error: 'Not found' });

    const { data, error } = await supabase
      .from('chat_sessions').select('*')
      .eq('project_id', req.params.projectId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (e) { next(e); }
});

module.exports = router;
