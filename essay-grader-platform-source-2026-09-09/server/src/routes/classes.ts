import { Router } from 'express';
import { db } from '../db/store.ts';
import { authRequired, ah } from '../middleware/auth.ts';
import type { ClassRoom, Student } from '../types.ts';

const router = Router();
router.use(authRequired);

function classStats(c: ClassRoom) {
  const students = db.find('students', (s) => s.classId === c.id);
  const corrections = db.data.corrections.filter((cor) => students.some((s) => s.id === cor.studentId));
  const avg = corrections.length ? Math.round(corrections.reduce((a, b) => a + b.finalScore, 0) / corrections.length * 10) / 10 : 0;
  return { studentCount: students.length, correctionCount: corrections.length, avgScore: avg };
}

router.get('/', ah(async (req, res) => {
  let list = db.data.classes;
  if (req.user!.role !== 'admin') list = list.filter((c) => c.teacherId === req.user!.id);
  res.json({ classes: list.map((c) => ({ ...c, ...classStats(c) })) });
}));

router.post('/', ah(async (req, res) => {
  const { name, gradeLevel } = (req.body || {}) as any;
  const nm = String(name || '').trim();
  if (!nm) return void res.status(400).json({ error: '班级名称不能为空' });
  const c: ClassRoom = {
    id: db.newId(), teacherId: req.user!.id, name: nm,
    gradeLevel: String(gradeLevel || '高一'), createdAt: new Date().toISOString(),
  };
  db.insert('classes', c);
  res.json({ class: { ...c, ...classStats(c) } });
}));

router.put('/:id', ah(async (req, res) => {
  const c = db.byId('classes', req.params.id);
  if (!c) return void res.status(404).json({ error: '班级不存在' });
  const { name, gradeLevel } = (req.body || {}) as any;
  const patch: Partial<ClassRoom> = {};
  if (typeof name === 'string' && name.trim()) patch.name = name.trim();
  if (typeof gradeLevel === 'string') patch.gradeLevel = gradeLevel;
  const updated = db.update('classes', c.id, patch)!;
  res.json({ class: { ...updated, ...classStats(updated) } });
}));

router.delete('/:id', ah(async (req, res) => {
  const c = db.byId('classes', req.params.id);
  if (!c) return void res.status(404).json({ error: '班级不存在' });
  db.remove('classes', c.id);
  db.data.students = db.data.students.filter((s) => s.classId !== c.id);
  db.save();
  res.json({ ok: true });
}));

// 学生列表
router.get('/:id/students', ah(async (req, res) => {
  const klass = db.byId('classes', req.params.id);
  if (!klass) return void res.status(404).json({ error: '班级不存在' });
  const students = db.find('students', (s) => s.classId === klass.id);
  const withStats = students.map((s) => {
    const corrs = db.data.corrections.filter((c) => c.studentId === s.id);
    const avg = corrs.length ? Math.round(corrs.reduce((a, b) => a + b.finalScore, 0) / corrs.length * 10) / 10 : 0;
    const tags = [...new Set(corrs.flatMap((c) => c.logicErrorTags))];
    return { ...s, avgScore: avg, correctionCount: corrs.length, tags };
  });
  res.json({ students: withStats });
}));

// 新增单个学生
router.post('/:id/students', ah(async (req, res) => {
  const klass = db.byId('classes', req.params.id);
  if (!klass) return void res.status(404).json({ error: '班级不存在' });
  const { name, studentNo } = (req.body || {}) as any;
  const nm = String(name || '').trim();
  if (!nm) return void res.status(400).json({ error: '学生姓名不能为空' });
  const s: Student = {
    id: db.newId(), classId: klass.id, name: nm,
    studentNo: String(studentNo || '').trim(), createdAt: new Date().toISOString(),
  };
  db.insert('students', s);
  res.json({ student: s });
}));

// 批量导入（每行：姓名,学号）
router.post('/:id/students/import', ah(async (req, res) => {
  const klass = db.byId('classes', req.params.id);
  if (!klass) return void res.status(404).json({ error: '班级不存在' });
  const text = String((req.body || {}).text || '');
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let added = 0; const errors: string[] = [];
  for (const line of lines) {
    const parts = line.split(/[,，\t]/).map((p) => p.trim());
    if (!parts[0]) { errors.push(`无法解析：${line}`); continue; }
    db.insert('students', {
      id: db.newId(), classId: klass.id, name: parts[0],
      studentNo: parts[1] || '', createdAt: new Date().toISOString(),
    });
    added++;
  }
  res.json({ added, errors, total: db.find('students', (s) => s.classId === klass.id).length });
}));

router.delete('/students/:studentId', ah(async (req, res) => {
  const s = db.byId('students', req.params.studentId);
  if (!s) return void res.status(404).json({ error: '学生不存在' });
  db.remove('students', s.id);
  res.json({ ok: true });
}));

export default router;
