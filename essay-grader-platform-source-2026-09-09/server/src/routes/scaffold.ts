import { Router } from 'express';
import { db } from '../db/store.ts';
import { authRequired, ah } from '../middleware/auth.ts';
import { ai } from '../ai/index.ts';

const router = Router();
router.use(authRequired);

router.post('/generate', ah(async (req, res) => {
  const b = (req.body || {}) as any;
  let title = String(b.title || '').trim();
  let materialText = String(b.materialText || '').trim();
  let keyword = b.keyword ? String(b.keyword) : undefined;
  let thinkingType = b.thinkingType;

  if (b.questionId) {
    const question = db.byId('questions', String(b.questionId));
    if (question) {
      title = question.title; materialText = question.materialText;
      keyword = question.keyword; thinkingType = question.thinkingType;
    }
  }
  if (!title && !materialText) return void res.status(400).json({ error: '请选择题目或填写作文题' });
  const scaffold = await ai.generateScaffold({ title, materialText, keyword, thinkingType });
  res.json({ scaffold });
}));

export default router;
