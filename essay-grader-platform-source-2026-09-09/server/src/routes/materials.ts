import { Router } from 'express';
import { db } from '../db/store.ts';
import { authRequired, ah } from '../middleware/auth.ts';
import type { Material } from '../types.ts';
import { collectMaterials, getCollectionStatus } from '../materials/collector.ts';
import { guessDims, FORM_OPTIONS, FIELD_OPTIONS, MOTIF_OPTIONS, ERA_OPTIONS } from '../materials/dims.ts';

const router = Router();
router.use(authRequired);

function strings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.map(String).map((s) => s.trim()).filter(Boolean))] : [];
}
function safeUrl(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try { const parsed = new URL(raw); return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : ''; } catch { return ''; }
}
function validDims(d: any): boolean {
  return !!d && FORM_OPTIONS.includes(d.form) && FIELD_OPTIONS.includes(d.field) && MOTIF_OPTIONS.includes(d.motif) && ERA_OPTIONS.includes(d.era);
}
function normalize(m: Material): Material {
  const createdAt = m.createdAt || new Date(0).toISOString();
  return {
    ...m,
    gradeLevels: m.gradeLevels?.length ? m.gradeLevels : ['通用'],
    dims: validDims(m.dims) ? m.dims : guessDims(m as any),
    teacherComment: m.teacherComment || '可作为议论文素材，使用时补充与分论点的逻辑联系。',
    applicableArguments: m.applicableArguments || m.debateDimension,
    status: m.status || (m.sourceVerified ? 'published' : 'pending'),
    updatedAt: m.updatedAt || createdAt,
  };
}
function libraryVersion(): string {
  const latest = db.data.materials.reduce((max, item) => { const u = normalize(item).updatedAt!; return u > max ? u : max; }, '');
  return `${db.data.materials.length}:${latest}`;
}
function okDims(m: Material): Material { return { ...m, dims: m.dims }; }

router.get('/version', ah(async (_req, res) => { res.set('Cache-Control', 'no-store'); res.json({ version: libraryVersion(), checkedAt: new Date().toISOString() }); }));
router.get('/collection-status', ah(async (_req, res) => { res.json(getCollectionStatus()); }));
router.post('/collect', ah(async (req, res) => {
  if (req.user!.role !== 'admin') return void res.status(403).json({ error: '需要管理员权限' });
  res.json(await collectMaterials());
}));

router.get('/my', ah(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const mine = db.data.myMaterials.filter((x) => x.userId === req.user!.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const items = mine.map((my) => { const m = db.byId('materials', my.materialId); return m ? { myId: my.id, material: okDims(normalize(m)) } : null; }).filter(Boolean);
  res.json({ items });
}));
router.post('/:id/my', ah(async (req, res) => {
  const m = db.byId('materials', req.params.id);
  if (!m) return void res.status(404).json({ error: '素材不存在' });
  if (db.data.myMaterials.some((x) => x.userId === req.user!.id && x.materialId === m.id)) { res.json({ ok: true, saved: true }); return; }
  const row = { id: db.newId(), userId: req.user!.id, materialId: m.id, createdAt: new Date().toISOString() };
  db.insert('myMaterials', row);
  res.json({ ok: true, myId: row.id });
}));
router.delete('/my/:myId', ah(async (req, res) => {
  const row = db.byId('myMaterials', req.params.myId);
  if (!row || row.userId !== req.user!.id) return void res.status(404).json({ error: '记录不存在' });
  db.remove('myMaterials', row.id);
  res.json({ ok: true });
}));

router.get('/', ah(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const q = req.query as Record<string, string | undefined>;
  let list = db.data.materials.map(normalize);
  if (req.user!.role !== 'admin') {
    list = list.filter((m) => m.status === 'published' || m.createdBy === req.user!.id);
  } else if (q.status && q.status !== '全部') {
    list = list.filter((m) => m.status === q.status);
  }
  for (const key of ['form', 'field', 'motif', 'era'] as const) {
    const v = q[key];
    if (v && v !== '全部') list = list.filter((m) => m.dims[key] === v);
  }
  if (q.search) {
    const needle = q.search.trim().toLowerCase();
    list = list.filter((m) => [m.title, m.content, m.source, m.sourceTitle, m.sourcePublisher, m.teacherComment, m.applicableArguments, m.debateDimension, m.dims.form, m.dims.field, m.dims.motif, m.dims.era].filter(Boolean).join(' ').toLowerCase().includes(needle));
  }
  list.sort((a, b) => b.updatedAt!.localeCompare(a.updatedAt!));
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(q.pageSize) || 30));
  const total = list.length;
  const materials = list.slice((page - 1) * pageSize, page * pageSize).map(okDims);
  res.setHeader('ETag', `W/"${libraryVersion()}"`);
  res.json({ materials, total, page, pageSize, version: libraryVersion(), filterOptions: { forms: FORM_OPTIONS, fields: FIELD_OPTIONS, motifs: MOTIF_OPTIONS, eras: ERA_OPTIONS } });
}));

function buildNewMaterial(req: any): Material | null {
  const b = (req.body || {}) as Record<string, any>;
  const title = String(b.title || '').trim();
  const content = String(b.content || '').trim();
  const d = b.dims;
  if (!title || !content || !validDims(d)) return null;
  const now = new Date().toISOString();
  const isAdmin = req.user!.role === 'admin';
  const publishNow = isAdmin && b.status === 'published';
  const grades = strings(b.gradeLevels);
  return {
    id: db.newId(), title, content,
    gradeLevels: grades.length ? grades : ['通用'],
    dims: { form: d.form, field: d.field, motif: d.motif, era: d.era },
    debateDimension: String(b.debateDimension || '').trim(),
    source: String(b.source || b.sourcePublisher || '教师录入').trim(),
    sourceTitle: String(b.sourceTitle || '').trim(),
    sourceUrl: safeUrl(b.sourceUrl),
    sourcePublisher: String(b.sourcePublisher || '').trim(),
    sourcePublishedAt: String(b.sourcePublishedAt || '').trim(),
    sourceVerified: publishNow,
    teacherComment: String(b.teacherComment || '').trim(),
    applicableArguments: String(b.applicableArguments || '').trim(),
    status: publishNow ? 'published' : (b.status === 'draft' ? 'draft' : 'pending'),
    reviewedBy: publishNow ? req.user!.id : undefined,
    reviewedAt: publishNow ? now : undefined,
    origin: 'manual', createdBy: req.user!.id, createdAt: now, updatedAt: now,
  };
}
router.post('/', ah(async (req, res) => {
  const m = buildNewMaterial(req);
  if (!m) return void res.status(400).json({ error: '标题、内容与四维分类不能为空' });
  db.insert('materials', m);
  res.status(201).json({ material: normalize(m), version: libraryVersion() });
}));

router.put('/:id', ah(async (req, res) => {
  const existing = db.byId('materials', req.params.id);
  if (!existing) return void res.status(404).json({ error: '素材不存在' });
  if (existing.createdBy !== req.user!.id && req.user!.role !== 'admin') return void res.status(403).json({ error: '无权修改' });
  const b = (req.body || {}) as Record<string, any>;
  const patch: Partial<Material> = { updatedAt: new Date().toISOString() };
  if (typeof b.title === 'string' && b.title.trim()) patch.title = b.title.trim();
  if (typeof b.content === 'string' && b.content.trim()) patch.content = b.content.trim();
  const d = b.dims;
  if (validDims(d)) patch.dims = { form: d.form, field: d.field, motif: d.motif, era: d.era };
  if (Array.isArray(b.gradeLevels)) { const g = strings(b.gradeLevels); patch.gradeLevels = g.length ? g : ['通用']; }
  for (const key of ['debateDimension', 'source', 'sourceTitle', 'sourcePublisher', 'sourcePublishedAt', 'teacherComment', 'applicableArguments'] as const) {
    if (typeof b[key] === 'string') patch[key] = b[key].trim();
  }
  if (typeof b.sourceUrl === 'string') patch.sourceUrl = safeUrl(b.sourceUrl);
  if (req.user!.role === 'admin' && ['draft', 'pending', 'published', 'archived'].includes(b.status)) {
    patch.status = b.status; patch.sourceVerified = b.status === 'published';
    patch.reviewedBy = b.status === 'published' ? req.user!.id : undefined;
    patch.reviewedAt = b.status === 'published' ? patch.updatedAt : undefined;
  } else if (normalize(existing).status === 'published') {
    patch.status = 'pending'; patch.sourceVerified = false; patch.reviewedBy = undefined; patch.reviewedAt = undefined;
  }
  const updated = db.update('materials', existing.id, patch)!;
  res.json({ material: normalize(updated), version: libraryVersion() });
}));

router.post('/:id/review', ah(async (req, res) => {
  if (req.user!.role !== 'admin') return void res.status(403).json({ error: '需要管理员权限' });
  const existing = db.byId('materials', req.params.id);
  if (!existing) return void res.status(404).json({ error: '素材不存在' });
  const action = String((req.body as any)?.action || '');
  if (!['publish', 'return', 'archive'].includes(action)) return void res.status(400).json({ error: '审核动作无效' });
  const now = new Date().toISOString();
  const patch: Partial<Material> = {
    status: action === 'publish' ? 'published' : action === 'archive' ? 'archived' : 'pending',
    sourceVerified: action === 'publish',
    teacherComment: typeof (req.body as any)?.teacherComment === 'string' ? (req.body as any).teacherComment.trim() : existing.teacherComment,
    reviewedBy: req.user!.id, reviewedAt: now, updatedAt: now,
  };
  res.json({ material: normalize(db.update('materials', existing.id, patch)!), version: libraryVersion() });
}));

router.get('/:id/related', ah(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const base = db.byId('materials', req.params.id);
  if (!base) return void res.status(404).json({ error: '素材不存在' });
  const m0 = normalize(base);
  const pool = db.data.materials.map(normalize).filter((x) => x.id !== m0.id && x.status === 'published');
  let rel = pool.filter((x) => x.dims.motif === m0.dims.motif && x.dims.form !== m0.dims.form);
  if (rel.length < 4) rel = pool.filter((x) => x.dims.motif === m0.dims.motif);
  if (rel.length < 4) {
    const extra = pool.filter((x) => x.dims.field === m0.dims.field && x.dims.form !== m0.dims.form && !rel.some((y) => y.id === x.id));
    rel = rel.concat(extra);
  }
  res.json({ items: rel.slice(0, 4).map(okDims) });
}));

router.delete('/:id', ah(async (req, res) => {
  const m = db.byId('materials', req.params.id);
  if (!m) return void res.status(404).json({ error: '素材不存在' });
  if (m.createdBy !== req.user!.id && req.user!.role !== 'admin') return void res.status(403).json({ error: '无权删除' });
  db.remove('materials', m.id);
  res.json({ ok: true, version: libraryVersion() });
}));

export default router;
