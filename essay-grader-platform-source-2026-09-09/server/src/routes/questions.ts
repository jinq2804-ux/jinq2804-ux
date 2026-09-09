import { Router } from 'express';
import { db } from '../db/store.ts';
import { authRequired, ah } from '../middleware/auth.ts';
import { ai } from '../ai/index.ts';
import type { Question, ThinkingType } from '../types.ts';

const router = Router();
router.use(authRequired);

const THINKING_TYPES: ThinkingType[] = ['progressive', 'dialectical', 'metaphoric', 'free'];
const GAOKAO_PROVINCES = ['全国卷', '全国甲卷', '全国乙卷', '全国一卷', '全国二卷', '新高考Ⅰ卷', '新高考Ⅱ卷', '北京卷', '上海卷', '天津卷', '浙江卷', '江苏卷', '广东卷'];
const ALL = new Set(['', '全部', 'all', 'ALL']);
// 省份/卷别排序：以“卷”结尾的高考卷在前（全国→新高考→地方卷），其后省份按拼音排序
const PROV_PINYIN: Record<string, string> = {
  全国: 'quanguo', 北京: 'beijing', 天津: 'tianjin', 河北: 'hebei', 山西: 'shanxi', 内蒙古: 'neimenggu',
  辽宁: 'liaoning', 吉林: 'jilin', 黑龙江: 'heilongjiang', 上海: 'shanghai', 江苏: 'jiangsu',
  浙江: 'zhejiang', 安徽: 'anhui', 福建: 'fujian', 江西: 'jiangxi', 山东: 'shandong', 河南: 'henan',
  湖北: 'hubei', 湖南: 'hunan', 广东: 'guangdong', 广西: 'guangxi', 海南: 'hainan', 重庆: 'chongqing',
  四川: 'sichuan', 贵州: 'guizhou', 云南: 'yunnan', 西藏: 'xizang', 陕西: 'shaanxi', 甘肃: 'gansu',
  青海: 'qinghai', 宁夏: 'ningxia', 新疆: 'xinjiang', 台湾: 'taiwan', 香港: 'xianggang', 澳门: 'aomen',
};
const JUAN_NATIONAL = ['全国卷', '全国甲卷', '全国乙卷', '全国一卷', '全国二卷'];
function provinceSortKey(v: string): [number, number, string] {
  const s = String(v || '');
  if (s.endsWith('卷')) {
    if (s.startsWith('全国')) {
      const i = JUAN_NATIONAL.indexOf(s);
      return [0, i >= 0 ? i : 50, s];
    }
    if (s.startsWith('新高考')) return [1, s.includes('Ⅱ') ? 1 : 0, s];
    const name = s.slice(0, -1);
    return [2, 0, PROV_PINYIN[name] || name];
  }
  return [3, 0, PROV_PINYIN[s] || s];
}
function sortProvinces(list: string[]): string[] {
  return [...list].sort((a, b) => {
    const ka = provinceSortKey(a);
    const kb = provinceSortKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2]);
  });
}


const clean = (v: unknown) => { const s = String(v || '').trim(); return ALL.has(s) ? '' : s; };

// 题库元信息（省份/年份/考试类别，供下拉筛选）。传入 province 时，年份/考试类别按该省/卷过滤
router.get('/meta', ah(async (req, res) => {
  const scopeProv = clean((req.query as any).province);
  const provinces = new Set<string>(GAOKAO_PROVINCES);
  const years = new Set<string>();
  const examCategories = new Set<string>();
  for (const q of db.data.questions) {
    if (q.province) provinces.add(q.province);
    if (scopeProv && q.province !== scopeProv) continue;
    if (q.year) years.add(q.year);
    if (q.examCategory) examCategories.add(q.examCategory);
  }
  res.json({
    meta: {
      provinces: sortProvinces([...provinces]),
      years: [...years].sort((a, b) => Number(b) - Number(a)),
      examCategories: [...examCategories].sort((a, b) => a.localeCompare(b, 'zh')),
    },
  });
}));

// 查找题库：高考真题(gaokao) / 模拟卷考题(mock)
router.get('/bank', ah(async (req, res) => {
  const q = req.query as any;
  const bankRaw = clean(q.bank);
  const banks = !bankRaw || bankRaw === 'all' ? ['gaokao', 'mock'] : [bankRaw === 'mock' ? 'mock' : 'gaokao'];
  const province = clean(q.province);
  const year = clean(q.year);
  const examCategory = clean(q.examCategory);
  const keyword = clean(q.keyword);
  const thinkingType = clean(q.thinkingType);
  let list = db.data.questions.filter((x) => x.bank && banks.includes(x.bank));
  if (province) list = list.filter((x) => x.province === province);
  if (year) list = list.filter((x) => String(x.year) === year);
  if (examCategory) list = list.filter((x) => x.examCategory === examCategory);
  if (keyword) list = list.filter((x) => (x.keyword || '').includes(keyword) || x.title.includes(keyword) || x.materialText.includes(keyword));
  if (thinkingType) list = list.filter((x) => x.thinkingType === thinkingType);
  list = [...list].sort((a, b) => (b.year || '').localeCompare(a.year || '') || a.title.localeCompare(b.title, 'zh'));
  res.json({ questions: list, total: list.length });
}));

// 我的题库：本人生成/保存/导入的题目 + 本人批改使用过的题目
router.get('/my', ah(async (req, res) => {
  const mine = db.data.questions.filter((x) => x.teacherId === req.user!.id);
  const usedIds = new Set(
    db.data.corrections
      .filter((c) => c.teacherId === req.user!.id && c.questionId)
      .map((c) => c.questionId),
  );
  const used = db.data.questions.filter((x) => usedIds.has(x.id));
  const seen = new Set<string>();
  const merged: Question[] = [];
  for (const x of [...mine, ...used]) {
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    merged.push(x);
  }
  merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ questions: merged, total: merged.length });
}));

// AI 生成题目（老接口，保留）
router.post('/generate', ah(async (req, res) => {
  const { province, grade, keyword, thinkingType, useWeb } = (req.body || {}) as any;
  const tt = THINKING_TYPES.includes(thinkingType) ? thinkingType : 'dialectical';
  const draft = await ai.generateQuestion({
    province: String(province || '全国卷'),
    grade: String(grade || '高二'),
    keyword: keyword ? String(keyword) : undefined,
    thinkingType: tt,
    useWeb: Boolean(useWeb),
  });
  res.json({ draft });
}));

// 自定义出题：模仿某题风格 / 输入题目 / 输入想法由 AI 生成
router.post('/generate-custom', ah(async (req, res) => {
  const b = (req.body || {}) as any;
  const styleQuestionId = b.styleQuestionId ? String(b.styleQuestionId) : '';
  const style = styleQuestionId ? db.byId('questions', styleQuestionId) : null;
  const mode = ['imitate', 'idea', 'raw'].includes(b.mode) ? b.mode : (style ? 'imitate' : 'idea');
  const draft = await ai.generateCustomQuestion({
    mode,
    styleQuestionId: style?.id,
    style: style
      ? {
          title: style.title, province: style.province, year: style.year,
          examCategory: style.examCategory, paperName: style.paperName,
          materialText: style.materialText, requirementText: style.requirementText,
          keyword: style.keyword, thinkingType: style.thinkingType,
        }
      : null,
    keyword: b.keyword ? String(b.keyword) : undefined,
    thinkingType: THINKING_TYPES.includes(b.thinkingType) ? b.thinkingType : undefined,
    province: b.province ? String(b.province) : undefined,
    grade: b.grade ? String(b.grade) : undefined,
    rawTitle: b.rawTitle ? String(b.rawTitle) : undefined,
    rawMaterial: b.rawMaterial ? String(b.rawMaterial) : undefined,
    inspiration: b.inspiration ? String(b.inspiration) : undefined,
  });
  res.json({ draft, style: style || null });
}));

// 保存题目（草稿或发布）
router.post('/', ah(async (req, res) => {
  const b = (req.body || {}) as any;
  const title = String(b.title || '').trim();
  const materialText = String(b.materialText || '').trim();
  const requirementText = String(b.requirementText || '').trim();
  if (!title || !materialText || !requirementText) return void res.status(400).json({ error: '标题、材料与要求不能为空' });
  const question: Question = {
    id: db.newId(),
    teacherId: req.user!.id,
    title, materialText, requirementText,
    checklist: Array.isArray(b.checklist) ? b.checklist : [],
    thinkingType: THINKING_TYPES.includes(b.thinkingType) ? b.thinkingType : 'dialectical',
    difficulty: ['easy', 'medium', 'hard'].includes(b.difficulty) ? b.difficulty : 'medium',
    province: String(b.province || ''),
    grade: String(b.grade || ''),
    keyword: b.keyword ? String(b.keyword) : undefined,
    traps: Array.isArray(b.traps) ? b.traps.map(String) : [],
    published: Boolean(b.published),
    source: b.source === 'manual' ? 'manual' : b.source === 'imported' ? 'imported' : 'ai_generated',
    year: b.year ? String(b.year) : undefined,
    examCategory: b.examCategory ? String(b.examCategory) : undefined,
    paperName: b.paperName ? String(b.paperName) : undefined,
    styleOriginId: b.styleOriginId ? String(b.styleOriginId) : undefined,
    createdAt: new Date().toISOString(),
  };
  db.insert('questions', question);
  res.json({ question });
}));

// 批量导入新题
router.post('/import', ah(async (req, res) => {
  const list = Array.isArray((req.body || {}).questions) ? (req.body as any).questions : [];
  if (!list.length) return void res.status(400).json({ error: '请提供待导入的题目列表' });
  const added: Question[] = [];
  const errors: string[] = [];
  list.forEach((b: any, i: number) => {
    const title = String(b?.title || '').trim();
    const materialText = String(b?.materialText || b?.material || '').trim();
    const requirementText = String(b?.requirementText || b?.requirement || '').trim();
    if (!title || !materialText || !requirementText) {
      errors.push(`第 ${i + 1} 条缺少 标题/材料/要求`);
      return;
    }
    const q: Question = {
      id: db.newId(), teacherId: req.user!.id, title, materialText, requirementText,
      checklist: Array.isArray(b.checklist) ? b.checklist : [],
      thinkingType: THINKING_TYPES.includes(b.thinkingType) ? b.thinkingType : 'dialectical',
      difficulty: ['easy', 'medium', 'hard'].includes(b.difficulty) ? b.difficulty : 'medium',
      province: String(b.province || b.province_name || '').trim(),
      grade: String(b.grade || '').trim(),
      keyword: b.keyword ? String(b.keyword).trim() : undefined,
      traps: Array.isArray(b.traps) ? b.traps.map(String) : [],
      published: Boolean(b.published),
      source: b.source === 'manual' ? 'manual' : 'imported',
      bank: undefined,
      year: b.year ? String(b.year) : undefined,
      examCategory: b.examCategory ? String(b.examCategory) : undefined,
      paperName: b.paperName ? String(b.paperName) : undefined,
      createdAt: new Date().toISOString(),
    };
    db.insert('questions', q);
    added.push(q);
  });
  res.json({ added, errors, count: added.length });
}));

// 将题库/他人题目保存进“我的题库”（复制）
router.post('/:id/save', ah(async (req, res) => {
  const src = db.byId('questions', req.params.id);
  if (!src) return void res.status(404).json({ error: '题目不存在' });
  if (src.teacherId === req.user!.id && !src.bank) return void res.status(400).json({ error: '该题目已在你的题库中' });
  const now = new Date().toISOString();
  const copy: Question = {
    ...src,
    id: db.newId(),
    teacherId: req.user!.id,
    bank: undefined,
    published: false,
    createdAt: now,
  };
  db.insert('questions', copy);
  res.json({ question: copy });
}));

// 列表（历史兼容：本人 + 已发布，供批改工作台选择）
router.get('/', ah(async (req, res) => {
  const q = req.query as any;
  let list = db.data.questions;
  if (req.user!.role !== 'admin') {
    list = list.filter((x) => x.teacherId === req.user!.id || x.published || x.bank);
  }
  if (q.published !== undefined) list = list.filter((x) => String(x.published) === q.published);
  if (q.thinkingType) list = list.filter((x) => x.thinkingType === q.thinkingType);
  list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ questions: list });
}));

router.get('/:id', ah(async (req, res) => {
  const question = db.byId('questions', req.params.id);
  if (!question) return void res.status(404).json({ error: '题目不存在' });
  res.json({ question });
}));

router.post('/:id/publish', ah(async (req, res) => {
  const question = db.byId('questions', req.params.id);
  if (!question) return void res.status(404).json({ error: '题目不存在' });
  const target = req.body?.published !== undefined ? Boolean(req.body.published) : !question.published;
  db.update('questions', question.id, { published: target });
  res.json({ question: db.byId('questions', question.id) });
}));

router.delete('/:id', ah(async (req, res) => {
  const question = db.byId('questions', req.params.id);
  if (!question) return void res.status(404).json({ error: '题目不存在' });
  const isOwner = question.teacherId === req.user!.id;
  if (!isOwner && req.user!.role !== 'admin') return void res.status(403).json({ error: '无权删除该题目' });
  db.remove('questions', question.id);
  res.json({ ok: true });
}));

export default router;
