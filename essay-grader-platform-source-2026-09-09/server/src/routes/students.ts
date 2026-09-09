import { Router } from 'express';
import { db } from '../db/store.ts';
import { authRequired, ah } from '../middleware/auth.ts';
import { ai } from '../ai/index.ts';

const router = Router();
router.use(authRequired);

function enrichTask(t: any) {
  const q = t.questionId ? db.byId('questions', t.questionId) : undefined;
  return { ...t, questionTitle: t.questionTitle || q?.title || '' };
}

router.get('/:id', ah(async (req, res) => {
  const s = db.byId('students', req.params.id);
  if (!s) return void res.status(404).json({ error: '学生不存在' });
  const corrs = db.data.corrections.filter((c) => c.studentId === s.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const weaknesses = db.find('studentWeakness', (w) => w.studentId === s.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const tasks = db.find('learningTasks', (t) => t.studentId === s.id).map(enrichTask);
  const avg = corrs.length ? Math.round(corrs.reduce((a, b) => a + b.finalScore, 0) / corrs.length * 10) / 10 : 0;
  res.json({ student: { ...s, avgScore: avg, correctionCount: corrs.length }, weaknesses, corrections: corrs.slice(0, 10), tasks });
}));

// 个性化推荐（AI/演示）
router.post('/:id/recommendations', ah(async (req, res) => {
  const s = db.byId('students', req.params.id);
  if (!s) return void res.status(404).json({ error: '学生不存在' });
  const corrs = db.data.corrections.filter((c) => c.studentId === s.id);
  const tags = [...new Set(corrs.flatMap((c) => c.logicErrorTags))];
  const avg = corrs.length ? Math.round(corrs.reduce((a, b) => a + b.finalScore, 0) / corrs.length) : 0;
  const recs = await ai.generateRecommendations([{ studentId: s.id, studentName: s.name, tags, avg }]);
  res.json({ recommendation: recs[0] || null });
}));

// 布置学习任务
router.post('/:id/tasks', ah(async (req, res) => {
  const s = db.byId('students', req.params.id);
  if (!s) return void res.status(404).json({ error: '学生不存在' });
  const b = (req.body || {}) as any;
  const task = {
    id: db.newId(), studentId: s.id,
    questionId: b.questionId ? String(b.questionId) : '',
    questionTitle: b.questionTitle ? String(b.questionTitle) : undefined,
    taskType: ['practice', 'review', 'read'].includes(b.taskType) ? b.taskType : 'practice',
    status: 'pending' as const, recommendedBy: req.user!.id, createdAt: new Date().toISOString(),
  };
  db.insert('learningTasks', task);
  res.json({ task: enrichTask(task) });
}));

// 班级个性化推荐列表（一键布置）
router.post('/classes/:classId/recommendations', ah(async (req, res) => {
  const klass = db.byId('classes', req.params.classId);
  if (!klass) return void res.status(404).json({ error: '班级不存在' });
  const students = db.find('students', (s) => s.classId === klass.id);
  const profiles = students.map((s) => {
    const corrs = db.data.corrections.filter((c) => c.studentId === s.id);
    const tags = [...new Set(corrs.flatMap((c) => c.logicErrorTags))];
    const avg = corrs.length ? Math.round(corrs.reduce((a, b) => a + b.finalScore, 0) / corrs.length) : 0;
    return { studentId: s.id, studentName: s.name, tags, avg };
  }).filter((p) => p.tags.length || p.avg > 0);
  const recs = await ai.generateRecommendations(profiles);
  res.json({ recommendations: recs });
}));

router.put('/tasks/:taskId', ah(async (req, res) => {
  const task = db.byId('learningTasks', req.params.taskId);
  if (!task) return void res.status(404).json({ error: '任务不存在' });
  const status = (req.body || {}).status === 'completed' ? 'completed' : 'pending';
  const updated = db.update('learningTasks', task.id, { status })!;
  res.json({ task: enrichTask(updated) });
}));

export default router;
