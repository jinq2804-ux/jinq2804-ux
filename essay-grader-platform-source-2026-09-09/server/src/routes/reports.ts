import { Router } from 'express';
import { db } from '../db/store.ts';
import { authRequired, ah } from '../middleware/auth.ts';
import { ai } from '../ai/index.ts';

const router = Router();
router.use(authRequired);

const TAG_ADVICE: Record<string, string> = {
  偷换概念: '训练“下定义”意识：写作前列出核心概念，写完自查是否前后一致。',
  论据偏离: '每个分论点只服务一个论点；用例后用一句话回扣论点。',
  逻辑重叠: '列提纲时给每个分论点安排“唯一任务”，避免换例证重复论证。',
  循环论证: '先给核心概念下操作性定义，再用过程与机制证明观点。',
  以偏概全: '数据与事例需注明出处与范围，避免用个别现象推导全体结论。',
  因果倒置: '梳理“原因→结果”链条，检验是否把结果当原因。',
};

router.get('/classes/:id/report', ah(async (req, res) => {
  const klass = db.byId('classes', req.params.id);
  if (!klass) return void res.status(404).json({ error: '班级不存在' });
  const studentIds = new Set(db.find('students', (s) => s.classId === klass.id).map((s) => s.id));
  const corrs = db.data.corrections.filter((c) => studentIds.has(c.studentId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const weaknesses = db.find('studentWeakness', (w) => studentIds.has(w.studentId));
  const clips = db.find('highlightClips', (h) => h.classId === klass.id).sort((a, b) => Number(b.isPinned) - Number(a.isPinned));

  // 共性薄弱项 TOP3
  const tagCount = new Map<string, number>();
  for (const w of weaknesses) tagCount.set(w.errorTag, (tagCount.get(w.errorTag) || 0) + 1);
  const weaknessTop = [...tagCount.entries()]
    .map(([tag, count]) => ({ tag, count, ratio: studentIds.size ? count / studentIds.size : 0, advice: TAG_ADVICE[tag] || '建议结合批改记录做专项训练。' }))
    .sort((a, b) => b.count - a.count).slice(0, 5);

  // 进步曲线（按天聚合平均分）
  const byDay = new Map<string, number[]>();
  for (const c of corrs) {
    const day = c.createdAt.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(c.finalScore);
  }
  const trend = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, scores]) => ({
    date: date.slice(5),
    avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10,
    count: scores.length,
  }));

  const avgScore = corrs.length ? Math.round(corrs.reduce((a, b) => a + b.finalScore, 0) / corrs.length * 10) / 10 : 0;

  const clipRows = clips.map((h) => {
    const corr = h.correctionId ? db.byId('corrections', h.correctionId) : undefined;
    const stu = corr?.studentId ? db.byId('students', corr.studentId) : undefined;
    return { ...h, studentName: stu?.name || '', questionTitle: corr ? db.byId('questions', corr.questionId)?.title || '' : '', verified: corr?.isVerified || false };
  });

  const latest = [...corrs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8).map((c) => {
    const stu = db.byId('students', c.studentId);
    const qn = db.byId('questions', c.questionId);
    return { id: c.id, studentName: stu?.name || '', questionTitle: qn?.title || '', finalScore: c.finalScore, logicErrorTags: c.logicErrorTags, isVerified: c.isVerified, createdAt: c.createdAt };
  });

  res.json({
    report: {
      className: klass.name,
      gradeLevel: klass.gradeLevel,
      studentCount: studentIds.size,
      correctionCount: corrs.length,
      avgScore,
      weaknessTop,
      trend,
      clips: clipRows,
      latest,
    },
  });
}));

// 一键生成讲评课大纲
router.post('/classes/:id/lecture-outline', ah(async (req, res) => {
  const klass = db.byId('classes', req.params.id);
  if (!klass) return void res.status(404).json({ error: '班级不存在' });
  const studentIds = new Set(db.find('students', (s) => s.classId === klass.id).map((s) => s.id));
  const corrs = db.data.corrections.filter((c) => studentIds.has(c.studentId));
  const weaknesses = db.find('studentWeakness', (w) => studentIds.has(w.studentId));
  const tagCount = new Map<string, number>();
  for (const w of weaknesses) tagCount.set(w.errorTag, (tagCount.get(w.errorTag) || 0) + 1);
  const top = [...tagCount.entries()].map(([tag, count]) => ({ tag, ratio: studentIds.size ? count / studentIds.size : 0 })).sort((a, b) => b.ratio - a.ratio).slice(0, 3);
  const avg = corrs.length ? Math.round(corrs.reduce((a, b) => a + b.finalScore, 0) / corrs.length) : 48;
  const outline = await ai.generateLectureOutline(klass.name, top, avg);
  res.json({ outline });
}));

// 优秀片段置顶
router.post('/highlights/:id/pin', ah(async (req, res) => {
  const h = db.byId('highlightClips', req.params.id);
  if (!h) return void res.status(404).json({ error: '片段不存在' });
  const pinned = (req.body || {}).pinned !== undefined ? Boolean((req.body as any).pinned) : true;
  db.update('highlightClips', h.id, { isPinned: pinned });
  res.json({ clip: db.byId('highlightClips', h.id) });
}));

export default router;
