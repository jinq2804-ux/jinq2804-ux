import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, CheckCircle2, CloudDownload, ExternalLink, Eye, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2,
} from 'lucide-react';
import { api, fmtDate, getSessionUser } from '../api';
import type { Material, User } from '../types';
import { Badge, Spinner, Empty, Modal, Alert } from '../components/ui';

const FORM_OPTIONS = ['时政热点/现象', '历史事件/典故', '核心人物', '学术理论/社科概念', '名言金句', '文艺作品'];
const FIELD_OPTIONS = ['科技·数字', '文化·传统', '社会·民生', '经济·商业', '哲学·思辨', '生态·自然'];
const MOTIF_OPTIONS = ['个人与时代', '物质与精神', '传统与现代', '科技与人文', '快与慢', '自我认知', '批判与反思', '信念与坚守', '其他'];
const ERA_OPTIONS = ['中国古代', '中国近现代/当代', '世界经典', '全球当代'];
const DIM_META: { key: 'form' | 'field' | 'motif' | 'era'; label: string; opts: string[] }[] = [
  { key: 'form', label: '素材形态', opts: FORM_OPTIONS },
  { key: 'field', label: '题材领域', opts: FIELD_OPTIONS },
  { key: 'motif', label: '核心母题', opts: MOTIF_OPTIONS },
  { key: 'era', label: '时空属性', opts: ERA_OPTIONS },
];
const STATUS_LABEL: Record<string, string> = { draft: '草稿', pending: '待审核', published: '已发布', archived: '已下架' };
const EMPTY_DIMS = { form: '', field: '', motif: '', era: '' };

type Resp = { materials: Material[]; total: number; version: string };

export default function MaterialsPage() {
  const user = getSessionUser<User>();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [dims, setDims] = useState<{ form: string; field: string; motif: string; era: string }>({ ...EMPTY_DIMS });
  const [status, setStatus] = useState(isAdmin ? '全部' : 'published');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [mine, setMine] = useState<{ myId: string; material: Material }[]>([]);
  const [mineIds, setMineIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState<any>(null);
  const [detail, setDetail] = useState<Material | null>(null);
  const [related, setRelated] = useState<Material[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const versionRef = useRef('');

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    (Object.keys(dims) as ('form' | 'field' | 'motif' | 'era')[]).forEach((k) => { if (dims[k]) params.set(k, dims[k]); });
    if (status !== '全部') params.set('status', status);
    params.set('pageSize', '100');
    return params.toString();
  }, [dims, status, search]);

  const loadAll = async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const r = await api.get<Resp>(`/materials?${query}&_=${Date.now()}`);
      setMaterials(r.materials); setTotal(r.total); versionRef.current = r.version; setError('');
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); setRefreshing(false); }
  };
  const loadMine = async () => {
    try {
      const r = await api.get<{ items: { myId: string; material: Material }[] }>('/materials/my');
      setMine(r.items); setMineIds(new Set(r.items.map((x) => x.material.id)));
    } catch { /* 静默 */ }
  };
  useEffect(() => { void loadAll(); /* eslint-disable-next-line */ }, [query]);
  useEffect(() => { void loadMine(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    const t = window.setInterval(async () => {
      try {
        const r = await api.get<{ version: string }>(`/materials/version?_=${Date.now()}`);
        if (versionRef.current && r.version !== versionRef.current) { await loadAll(true); setNotice('素材库已同步最新内容'); window.setTimeout(() => setNotice(''), 2000); }
      } catch { /* 静默 */ }
    }, 20000);
    return () => window.clearInterval(t);
  }, [query]);

  const startCreate = () => { setEditing(null); setForm({ title: '', content: '', dims: { ...EMPTY_DIMS }, gradeLevels: ['通用'], source: '', sourceTitle: '', sourceUrl: '', sourcePublisher: '', sourcePublishedAt: '', teacherComment: '', applicableArguments: '', debateDimension: '', status: 'pending' }); setOpen(true); };
  const startEdit = (m: Material) => { setEditing(m); setForm({ ...m, dims: { ...m.dims } }); setOpen(true); };
  const setDim = (key: string, v: string) => setForm((f: any) => ({ ...f, dims: { ...f.dims, [key]: v } }));
  const submit = async () => {
    if (!form?.title.trim() || !form?.content.trim()) { setError('标题与内容不能为空'); return; }
    const d = form.dims;
    if (!d.form || !d.field || !d.motif || !d.era) { setError('请完成四维分类（素材形态/题材领域/核心母题/时空属性）'); return; }
    setError('');
    try {
      if (editing) await api.put(`/materials/${editing.id}`, form);
      else await api.post('/materials', form);
      setOpen(false); setNotice(editing ? '素材已更新' : '素材已提交'); window.setTimeout(() => setNotice(''), 2000);
      await loadAll(true);
    } catch (e) { setError((e as Error).message); }
  };
  const collectNow = async () => {
    setCollecting(true); setError('');
    try {
      const result = await api.post<{ lastAdded: number; lastErrors: string[] }>('/materials/collect');
      setStatus('pending');
      setNotice(`采集完成：新增 ${result.lastAdded} 条待审核${result.lastErrors?.length ? `，${result.lastErrors.length} 源失败` : ''}`); window.setTimeout(() => setNotice(''), 4000);
      await loadAll(true);
    } catch (e) { setError((e as Error).message); } finally { setCollecting(false); }
  };
  const review = async (m: Material, action: 'publish' | 'return' | 'archive') => {
    try { await api.post(`/materials/${m.id}/review`, { action }); await loadAll(true); } catch (e) { setError((e as Error).message); }
  };
  const remove = async (m: Material) => {
    if (!window.confirm(`删除素材「${m.title}」？`)) return;
    try { await api.del(`/materials/${m.id}`); await loadAll(true); } catch (e) { setError((e as Error).message); }
  };
  const toggleSave = async (m: Material) => {
    try {
      if (mineIds.has(m.id)) { const my = mine.find((x) => x.material.id === m.id); if (my) await api.del(`/materials/my/${my.myId}`); setNotice('已从我的素材库移除'); }
      else { await api.post(`/materials/${m.id}/my`); setNotice(`已加入我的素材库：${m.title}`); }
      window.setTimeout(() => setNotice(''), 2000); await loadMine();
    } catch (e) { setError((e as Error).message); }
  };
  const openDetail = async (m: Material) => { setDetail(m); try { const r = await api.get<{ items: Material[] }>(`/materials/${m.id}/related`); setRelated(r.items); } catch { setRelated([]); } };
  const openRelated = async (m: Material) => { setDetail(m); try { const r = await api.get<{ items: Material[] }>(`/materials/${m.id}/related`); setRelated(r.items); } catch { setRelated([]); } };

  const dimChip = (m: Material, key: string) => {
    const label = DIM_META.find((x) => x.key === key)?.label || key;
    const v = (m.dims as any)?.[key];
    return v ? <Badge tone={key === 'form' ? 'blue' : key === 'field' ? 'green' : key === 'motif' ? 'purple' : 'amber'}>{label}：{v}</Badge> : null;
  };

  const renderCard = (m: Material, inMine = false) => (
    <article key={m.id} className="card flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <button className="min-w-0 text-left" onClick={() => openDetail(m)}>
          <h3 className="text-base font-semibold text-brand-700 hover:underline">{m.title}</h3>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button className="rounded-lg p-1.5 text-slate-400 hover:text-brand-600" onClick={() => openDetail(m)} title="查看"><Eye className="h-4 w-4" /></button>
          {(isAdmin || m.createdBy === user?.id) && <>
            <button className="rounded-lg p-1.5 text-slate-400 hover:text-brand-600" onClick={() => startEdit(m)} title="编辑"><Pencil className="h-4 w-4" /></button>
            <button className="rounded-lg p-1.5 text-slate-400 hover:text-red-500" onClick={() => remove(m)} title="删除"><Trash2 className="h-4 w-4" /></button>
          </>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">{DIM_META.map((x) => dimChip(m, x.key))}</div>
      <p className="mt-2 text-sm leading-6 text-slate-600 line-clamp-4">{m.content}</p>
      {m.teacherComment && <p className="mt-2 flex items-start gap-1 text-xs text-amber-800"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{m.teacherComment}</span></p>}
      {isAdmin && m.status !== 'published' && m.status === 'pending' && <div className="mt-3 flex gap-2"><button className="btn-primary text-xs" onClick={() => review(m, 'publish')}><CheckCircle2 className="h-3.5 w-3.5" />审核并发布</button><button className="btn-outline text-xs" onClick={() => review(m, 'return')}>退回</button></div>}
      {isAdmin && m.status === 'published' && <button className="btn-outline text-xs mt-3" onClick={() => review(m, 'archive')}><Archive className="h-3.5 w-3.5" />下架</button>}
      {!inMine && (
        <button onClick={() => toggleSave(m)} className={`mt-3 self-end ${mineIds.has(m.id) ? 'btn-outline' : 'btn-primary'} text-xs`}>
          {mineIds.has(m.id) ? '已在我的素材库（点此移除）' : '加入我的素材库'}
        </button>
      )}
    </article>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">素材库</h1>
          <p className="mt-1 text-sm text-slate-500">四维筛选 · 已核验素材；写作框架只引用已发布内容</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && <button className="btn-outline" onClick={collectNow} disabled={collecting}><CloudDownload className={`h-4 w-4 ${collecting ? 'animate-bounce' : ''}`} />{collecting ? '采集中' : '立即采集'}</button>}
          <button className="btn-outline" onClick={() => loadAll(true)} disabled={refreshing}><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />刷新</button>
          <button className="btn-primary" onClick={startCreate}><Plus className="h-4 w-4" />录入素材</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setTab('all')} className={`rounded-lg border px-4 py-1.5 text-sm font-medium ${tab === 'all' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'}`}>全部素材</button>
        <button onClick={() => setTab('mine')} className={`rounded-lg border px-4 py-1.5 text-sm font-medium ${tab === 'mine' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'}`}>我的素材库（{mine.length}）</button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {tab === 'mine' ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">我的素材库（{mine.length}）</h2>
          {mine.length === 0 ? <div className="card p-8"><Empty text="还没有收藏素材" hint="在“全部素材”中点击“加入我的素材库”" /></div> : <div className="grid gap-4 xl:grid-cols-2">{mine.map(({ myId, material: m }) => (<div key={myId}>{renderCard(m, true)}<div className="mt-1 text-right"><button className="btn-outline text-xs" onClick={() => toggleSave(m)}>移除</button></div></div>))}</div>}
        </div>
      ) : (
        <>
          <section className="card p-4" aria-label="检索栏">
            <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-700">检索栏</h3><span className="text-xs text-slate-400">共 {total} 条</span></div>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); }}>
              <label className="relative block">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input className="input pl-9" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="搜索标题、正文、来源或教师评价" />
              </label>
              <div className="grid gap-3 md:grid-cols-4">
                {DIM_META.map((x) => (
                  <div key={x.key}>
                    <span className="label">{x.label}</span>
                    <select className="input mt-1" value={dims[x.key]} onChange={(e) => setDims({ ...dims, [x.key]: e.target.value })}>
                      <option value="">全部</option>{x.opts.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {isAdmin && (
                <div>
                  <span className="label">状态</span>
                  <select className="input mt-1" value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="全部">全部状态</option><option value="published">已发布</option><option value="pending">待审核</option><option value="draft">草稿</option>
                  </select>
                </div>
              )}
            </form>
          </section>
          {loading ? <div className="card p-10"><Spinner /></div> : materials.length === 0 ? <div className="card p-10"><Empty text="没有符合条件的素材" /></div> : <div className="grid gap-4 xl:grid-cols-2">{materials.map((m) => renderCard(m))}</div>}
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? '编辑素材' : '录入素材'} width="max-w-3xl">
        {form && (
          <div className="space-y-3 max-h-[72vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3"><div><label className="label">名称</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div><div><label className="label">来源</label><input className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></div></div>
            <div><label className="label">素材内容</label><textarea className="input min-h-[140px]" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
            <div className="grid gap-3 md:grid-cols-2">
              {DIM_META.map((x) => (
                <div key={x.key}><label className="label">{x.label}（必选）</label>
                  <select className="input mt-1" value={form.dims[x.key]} onChange={(e) => setDim(x.key, e.target.value)}>
                    <option value="">请选择</option>{x.opts.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select></div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">来源链接</label><input className="input" type="url" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} /></div>
              <div><label className="label">发布日期</label><input className="input" type="date" value={form.sourcePublishedAt} onChange={(e) => setForm({ ...form, sourcePublishedAt: e.target.value })} /></div>
            </div>
            <div><label className="label">教师评价</label><textarea className="input min-h-[80px]" value={form.teacherComment} onChange={(e) => setForm({ ...form, teacherComment: e.target.value })} /></div>
            <div className="flex justify-end gap-2"><button className="btn-outline" onClick={() => setOpen(false)}>取消</button><button className="btn-primary" onClick={submit} disabled={!form.title.trim() || !form.content.trim()}>{editing ? '保存修改' : '提交'}</button></div>
          </div>
        )}
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title || '素材详情'} width="max-w-4xl">
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">{DIM_META.map((x) => dimChip(detail, x.key))}</div>
            {detail.source && <p className="flex items-center gap-1.5 text-xs text-slate-500">{detail.sourcePublisher || detail.source}{detail.sourceUrl ? <a href={detail.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-brand-600"><ExternalLink className="h-3 w-3" />来源</a> : null}</p>}
            <div className="rounded-lg bg-slate-50 p-3 text-sm leading-6 whitespace-pre-wrap">{detail.content}</div>
            {detail.teacherComment && <div className="rounded-lg border border-amber-100 bg-amber-50/70 p-3"><p className="text-xs font-medium text-amber-800">教师评价</p><p className="mt-1 text-sm text-amber-900/80">{detail.teacherComment}</p></div>}
            <div className="border-t pt-3">
              <p className="text-sm font-semibold mb-2">关联推荐（同母题·不同形态）</p>
              {related.length === 0 ? <p className="text-sm text-slate-400">暂无关联素材</p> : <div className="grid gap-2 md:grid-cols-2">{related.map((r) => (<button key={r.id} onClick={() => openRelated(r)} className="rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50"><p className="text-sm font-medium text-brand-700">{r.title}</p><p className="mt-1 text-xs text-slate-500 line-clamp-2">{r.content}</p></button>))}</div>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
