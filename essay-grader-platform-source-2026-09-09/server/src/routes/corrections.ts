import { Router } from 'express';
import { db } from '../db/store.ts';
import { authRequired, ah } from '../middleware/auth.ts';
import { ai } from '../ai/index.ts';
import type { Correction, CorrectionAI } from '../types.ts';
import { ensurePigai, syncEstimateToScore, alignMarksToEssay } from '../ai/pigai.ts';
import { calibrateScore, selectScoreAnchors } from '../ai/calibration.ts';

const router = Router();
router.use(authRequired);

function applyLengthPenalty(ai: CorrectionAI, essay: string) {
  const chars = (essay || '').length;
  const count = (essay || '').replace(/\s/g, '').length;
  const shortage = Math.max(0, 800 - count);
  let penalty = Math.floor(shortage / 100);
  let final = Math.round((ai.scoring?.finalScore || 0) - penalty);
  if (count <= 300) final = Math.min(final, 30);
  final = Math.max(0, Math.min(60, final));
  ai.scoring.finalScore = final;
  ai.scoring.grade = final >= 54 ? 'A' : final >= 45 ? 'B' : final >= 36 ? 'C' : 'D';
  return { chars, count, shortage, penalty, rule: '满分60分，一般基准分48。字数以不含空白字符计，少于800字每缺100字扣1分；少于或等于300字时参考分不高于30分。' };
}

function enrich(c: Correction) {
  const student = c.studentId ? db.byId('students', c.studentId) : undefined;
  const question = c.questionId ? db.byId('questions', c.questionId) : undefined;
  const klass = student ? db.byId('classes', student.classId) : undefined;
  return {
    ...c,
    studentName: student?.name || '',
    studentNo: student?.studentNo || '',
    className: klass?.name || '',
    questionTitle: question?.title || '',
    questionMaterial: question?.materialText || '',
  };
}

// AI 分析（不落库）
router.post('/analyze', ah(async (req, res) => {
  const b = (req.body || {}) as any;
  const essay = String(b.essay || '').trim();
  if (essay.length < 40) return void res.status(400).json({ error: '作文内容过短，请粘贴完整作文（至少 40 字）' });
  const questionText = String(b.questionText || '').trim();
  const question = b.questionId ? db.byId('questions', String(b.questionId)) : questionText ? { id: '', title: '手动录入题目（文字/图片导入）', materialText: questionText } : undefined;
  const calibrationSelection = selectScoreAnchors(
    question ? `${question.title || ''}\n${question.materialText || ''}` : questionText,
    essay,
  );
  const aiResponse = await ai.correctEssay({
    question: question ? { id: question.id, title: question.title, materialText: question.materialText } : null,
    essay,
    scoreAnchors: calibrationSelection.applied ? calibrationSelection.anchors : undefined,
  });
  const calibration = calibrateScore(aiResponse, calibrationSelection);
  const lengthInfo = applyLengthPenalty(aiResponse, essay);
  aiResponse.pigai = ensurePigai(aiResponse);
  syncEstimateToScore(aiResponse);
  alignMarksToEssay(aiResponse, essay);
  res.json({
    analysis: aiResponse,
    question: question || null,
    metrics: { lengthInfo, calibration },
  });
}));

// 保存批改记录
router.post('/', ah(async (req, res) => {
  const b = (req.body || {}) as any;
  const originalText = String(b.originalText || '').trim();
  if (!originalText) return void res.status(400).json({ error: '缺少作文原文' });
  const aiResponse = b.aiResponse as CorrectionAI;
  const studentId = b.studentId ? String(b.studentId) : '';
  const student = studentId ? db.byId('students', studentId) : undefined;
  const now = new Date().toISOString();
  const tagsRaw: string[] = Array.isArray(b.logicErrorTags) ? b.logicErrorTags.map(String) : [];
  const tags: string[] = Array.from(new Set<string>(tagsRaw));

  const correction: Correction = {
    id: db.newId(),
    questionId: b.questionId ? String(b.questionId) : '',
    studentId,
    teacherId: req.user!.id,
    originalText,
    aiResponse,
    teacherModifiedComment: b.teacherModifiedComment ? String(b.teacherModifiedComment) : undefined,
    finalScore: Number(b.finalScore) || aiResponse?.scoring?.finalScore || 70,
    logicErrorTags: tags,
    isVerified: Boolean(b.isVerified),
    confidenceAvg: Number(b.confidenceAvg) || 0,
    createdAt: now,
    updatedAt: now,
  };
  db.insert('corrections', correction);

  // 错题本：有标签时才生成（批改1.0 引擎不产出旧式逻辑标签时跳过）
  if (studentId && tags.length) {
    const weakNote = (aiResponse?.pigai?.dimensions || []).flatMap((d) => d.weaknesses)[0] || '';
    for (const tag of tags) {
      db.insert('studentWeakness', {
        id: db.newId(), studentId, errorTag: tag, correctionId: correction.id,
        exampleSentence: weakNote.slice(0, 80) || tag,
        createdAt: now,
      });
    }
  }
  // 优秀片段墙
  if (studentId) {
    for (const clip of (aiResponse?.highlights || []).slice(0, 3)) {
      if (!clip || !clip.trim()) continue;
      db.insert('highlightClips', {
        id: db.newId(), correctionId: correction.id, clipText: clip.trim(),
        topicTags: ([] as string[]), classId: student?.classId || '', isPinned: false, createdAt: now,
      });
    }
  }
  res.json({ correction: enrich(correction) });
}));

// 列表（多维筛选）
router.get('/', ah(async (req, res) => {
  const q = req.query as any;
  let list = db.data.corrections;
  if (req.user!.role !== 'admin') list = list.filter((c) => c.teacherId === req.user!.id);
  if (q.studentId) list = list.filter((c) => c.studentId === q.studentId);
  if (q.questionId) list = list.filter((c) => c.questionId === q.questionId);
  if (q.classId) {
    const ids = new Set(db.find('students', (s) => s.classId === q.classId).map((s) => s.id));
    list = list.filter((c) => ids.has(c.studentId));
  }
  if (q.tag) list = list.filter((c) => c.logicErrorTags.includes(q.tag));
  if (q.from) list = list.filter((c) => c.createdAt >= new Date(q.from).toISOString());
  if (q.to) list = list.filter((c) => c.createdAt <= new Date(q.to).toISOString());
  if (q.verified !== undefined) list = list.filter((c) => String(c.isVerified) === q.verified);
  list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ corrections: list.map(enrich), total: list.length });
}));

router.get('/export.csv', ah(async (req, res) => {
  const q = req.query as any;
  let list = db.data.corrections;
  if (req.user!.role !== 'admin') list = list.filter((c) => c.teacherId === req.user!.id);
  if (q.studentId) list = list.filter((c) => c.studentId === q.studentId);
  if (q.questionId) list = list.filter((c) => c.questionId === q.questionId);
  if (q.classId) {
    const ids = new Set(db.find('students', (s) => s.classId === q.classId).map((s) => s.id));
    list = list.filter((c) => ids.has(c.studentId));
  }
  if (q.tag) list = list.filter((c) => c.logicErrorTags.includes(q.tag));
  list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const rows = list.map((c) => {
    const stu = c.studentId ? db.byId('students', c.studentId) : undefined;
    const qn = c.questionId ? db.byId('questions', c.questionId) : undefined;
    const pigaiStrengths = (c.aiResponse?.pigai?.dimensions || []).flatMap((d) => d.strengths);
    const comment = c.teacherModifiedComment || pigaiStrengths[0] || '';
    return [stu?.name || '', stu?.studentNo || '', qn?.title || '', c.finalScore, c.aiResponse?.scoring?.grade || '', (c.logicErrorTags || []).join('、'), comment.replace(/[\r\n]+/g, ' '), c.createdAt.slice(0, 10)];
  });
  const head = ['学生姓名', '学号', '题目', '得分', '等级', '错误标签', '评语摘要', '批改日期'];
  const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="corrections-${Date.now()}.csv"`);
  res.send('\uFEFF' + csv);
}));

router.get('/:id', ah(async (req, res) => {
  const c = db.byId('corrections', req.params.id);
  if (!c) return void res.status(404).json({ error: '记录不存在' });
  res.json({ correction: enrich(c) });
}));

// 更新：教师修改评语/分数/复核状态/AI 结构
router.put('/:id', ah(async (req, res) => {
  const c = db.byId('corrections', req.params.id);
  if (!c) return void res.status(404).json({ error: '记录不存在' });
  if (c.teacherId !== req.user!.id && req.user!.role !== 'admin') return void res.status(403).json({ error: '无权修改该记录' });
  const b = (req.body || {}) as any;
  const patch: Partial<Correction> = { updatedAt: new Date().toISOString() };
  if (typeof b.teacherModifiedComment === 'string') patch.teacherModifiedComment = b.teacherModifiedComment;
  if (b.finalScore !== undefined) patch.finalScore = Number(b.finalScore);
  if (typeof b.isVerified === 'boolean') patch.isVerified = b.isVerified;
  if (b.aiResponse) patch.aiResponse = b.aiResponse as CorrectionAI;
  if (Array.isArray(b.logicErrorTags)) patch.logicErrorTags = Array.from(new Set<string>(b.logicErrorTags.map(String)));
  const updated = db.update('corrections', c.id, patch)!;

  // 风格学习（P1）：教师改写评语即入库作为风格样本（仅旧版数据含 comment 时触发）
  const legacyComment = (c.aiResponse as any)?.comment;
  if (patch.teacherModifiedComment && patch.teacherModifiedComment !== (c.teacherModifiedComment || '') && legacyComment) {
    const orig = [legacyComment.strength, legacyComment.fatalIssue, ...(legacyComment.suggestions || []).map((s: any) => s.advice)].filter(Boolean).join('；');
    db.insert('teacherStyles', {
      id: db.newId(), teacherId: req.user!.id, aiRawComment: orig.slice(0, 2000),
      teacherModifiedComment: patch.teacherModifiedComment.slice(0, 2000), createdAt: new Date().toISOString(),
    });
  }
  res.json({ correction: enrich(updated) });
}));

router.delete('/:id', ah(async (req, res) => {
  const c = db.byId('corrections', req.params.id);
  if (!c) return void res.status(404).json({ error: '记录不存在' });
  if (c.teacherId !== req.user!.id && req.user!.role !== 'admin') return void res.status(403).json({ error: '无权删除' });
  db.remove('corrections', c.id);
  res.json({ ok: true });
}));

export default router;


