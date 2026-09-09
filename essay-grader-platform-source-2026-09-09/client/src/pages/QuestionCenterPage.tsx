import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2, Sparkles, Search, BookOpen, PencilLine, Library, Save, Send, Copy,
  Download, Upload, Eye, Trash2, Pin, Wand2, CheckCircle2,
} from 'lucide-react';
import { api, fmtDate } from '../api';
import type { Question } from '../types';
import { Card, Badge, Modal, Alert, Empty, Spinner } from '../components/ui';

const TYPE_LABEL: Record<string, string> = { progressive: '逻辑递进型', dialectical: '关系辩证型', metaphoric: '比喻象征型' };
const DIFF_LABEL: Record<string, string> = { easy: '易', medium: '中', hard: '难' };
const SOURCE_LABEL: Record<string, string> = { ai_generated: 'AI生成', manual: '自建', imported: '导入', gaokao: '高考真题', mock: '模拟卷' };

type Tab = 'search' | 'custom' | 'mine';
interface Meta { provinces: string[]; years: string[]; examCategories: string[]; }

const EMPTY_Q = (): Question => ({
  id: '', teacherId: '', title: '', materialText: '', requirementText: '',
  checklist: [], thinkingType: 'dialectical', difficulty: 'medium', province: '', grade: '',
  traps: [], published: false, source: 'ai_generated', createdAt: new Date().toISOString(),
});

export default function QuestionCenterPage() {
  const [tab, setTab] = useState<Tab>('search');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const flash = (msg: string) => { setNotice(msg); window.setTimeout(() => setNotice(''), 3000); };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">智能出题中心</h1>
        <p className="text-sm text-slate-500 mt-0.5">查找题库 · 自定义出题 · 我的题库</p>
      </div>
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {/* 三个等宽蓝色块：深浅不一的品牌蓝，各占 1/3，撑满整行 */}
      <div className="grid grid-cols-3 gap-3 w-full">
        {([
          ['search', '查找题库', BookOpen, 'bg-brand-200 text-brand-900 hover:bg-brand-300 border-brand-300'],
          ['custom', '自定义出题', PencilLine, 'bg-brand-200 text-brand-900 hover:bg-brand-300 border-brand-300'],
          ['mine', '我的题库', Library, 'bg-brand-200 text-brand-900 hover:bg-brand-300 border-brand-300'],
        ] as [Tab, string, React.ElementType, string][]).map(([k, label, Icon, shade]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex items-center justify-center gap-2 rounded-xl border py-3.5 text-sm font-semibold transition-all ${shade} ${tab === k ? 'ring-2 ring-brand-600 ring-offset-1 shadow-md' : 'shadow-sm hover:shadow'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'search' && <BankSearchTab onFlash={flash} onError={setError} />}
      {tab === 'custom' && <CustomGenerateTab onFlash={flash} onError={setError} />}
      {tab === 'mine' && <MyBankTab onFlash={flash} onError={setError} />}
    </div>
  );
}

/* ============================ 通用小件 ============================ */
function MetaBadges({ q }: { q: Question }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-400">
      {q.bank && <Badge tone={q.bank === 'gaokao' ? 'purple' : 'blue'}>{q.bank === 'gaokao' ? '高考真题' : '模拟卷'}</Badge>}
      {q.source && !q.bank && <Badge tone="gray">{SOURCE_LABEL[q.source] || q.source}</Badge>}
      {q.province && <span>{q.province}</span>}
      {q.year && <span>{q.year}年</span>}
      {q.examCategory && <span>· {q.examCategory}</span>}
      {q.paperName && <span className="truncate max-w-[220px]">· {q.paperName}</span>}
      {q.keyword && <Badge tone="amber">话题：{q.keyword}</Badge>}
      {q.thinkingType && <Badge tone="gray">{TYPE_LABEL[q.thinkingType] || (q.thinkingType === 'free' ? '自由发挥' : q.thinkingType)}</Badge>}
    </div>
  );
}

function QuestionPreviewModal({ q, onClose }: { q: Question; onClose: () => void }) {
  const copy = async () => {
    const text = `【${q.title}】\n\n${q.materialText}\n\n写作要求：${q.requirementText}\n\n评分细则：${q.checklist.map((c) => `${c.item}(${c.score}分)`).join('；')}\n\n偏题陷阱：${q.traps.join('；')}`;
    await navigator.clipboard.writeText(text).catch(() => undefined);
  };
  return (
    <Modal open onClose={onClose} title={q.title} width="max-w-3xl">
      <div className="space-y-3 text-sm">
        <MetaBadges q={q} />
        <div className="bg-slate-50 rounded-lg p-3 text-slate-700 leading-6">{q.materialText}</div>
        <p className="text-slate-600"><span className="font-medium">写作要求：</span>{q.requirementText}</p>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="border border-slate-200 rounded-lg p-3">
            <p className="font-medium mb-1.5">评分细则 Checklist</p>
            <ul className="space-y-1">{q.checklist.map((c, i) => <li key={i}>· {c.item}（{c.score} 分）</li>)}</ul>
          </div>
          <div className="border border-red-200 bg-red-50/40 rounded-lg p-3">
            <p className="font-medium text-red-700 mb-1.5">偏题陷阱预警</p>
            <ul className="space-y-1 text-red-600">{q.traps.map((t, i) => <li key={i}>⚠ {t}</li>)}</ul>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-outline text-xs" onClick={copy}><Copy className="w-3.5 h-3.5" /> 一键复制</button>
          <Link className="btn-primary text-xs" to={`/grading?question=${q.id}`}>去批改</Link>
        </div>
      </div>
    </Modal>
  );
}

function ImitateModal({ q, onClose, onFlash, onError }: { q: Question; onClose: () => void; onFlash: (s: string) => void; onError: (s: string) => void }) {
  const [topicMode, setTopicMode] = useState<'inherit' | 'replace'>('inherit');
  const [keyword, setKeyword] = useState('');
  const [thinkMode, setThinkMode] = useState<'inherit' | 'other'>('inherit');
  const [thinkingType, setThinkingType] = useState('');
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<Question | null>(null);

  const generate = async () => {
    onError('');
    if (topicMode === 'replace' && !keyword.trim()) { onError('请输入要替换的新话题关键词'); return; }
    setGenerating(true);
    try {
      const r = await api.post<{ draft: Question }>('/questions/generate-custom', {
        mode: 'imitate',
        styleQuestionId: q.id,
        keyword: topicMode === 'replace' ? keyword.trim() : undefined,
        thinkingType: thinkMode === 'other' && thinkingType ? thinkingType : undefined,
      });
      setDraft({ ...r.draft, published: false, teacherId: '', createdAt: new Date().toISOString(), id: '' });
    } catch (e) { onError((e as Error).message); } finally { setGenerating(false); }
  };
  const save = async (publish: boolean) => {
    if (!draft) return;
    try {
      const r = await api.post<{ question: Question }>('/questions', { ...draft, published: publish });
      onFlash(publish ? '已发布「' + r.question.title + '」' : '已存入我的题库：' + r.question.title);
      setDraft(null);
    } catch (e) { onError((e as Error).message); }
  };

  return (
    <Modal open onClose={onClose} title="模仿该题生成一道新题" width="max-w-3xl">
      <div className="space-y-3 text-sm">
        <p className="text-xs text-brand-600">本功能按“模拟出题1.0”标准生成：材料约 140 字、双维度独立命题（话题 × 思辨类型）。</p>
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-medium text-slate-500 mb-1">原题参考：{q.title}</p>
          <MetaBadges q={q} />
          <p className="text-xs text-slate-600 mt-1.5 leading-5">{q.materialText}</p>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-slate-500">话题处理</p>
            <label className="flex items-center gap-2 cursor-pointer text-slate-700">
              <input type="radio" className="accent-brand-600" checked={topicMode === 'inherit'} onChange={() => setTopicMode('inherit')} />
              模仿原题话题{q.keyword ? '（' + q.keyword + '）' : ''}
            </label>
            <div>
              <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                <input type="radio" className="accent-brand-600" checked={topicMode === 'replace'} onChange={() => setTopicMode('replace')} />
                替换为新话题
              </label>
              {topicMode === 'replace' && <input className="input mt-1.5" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="输入新话题关键词" />}
            </div>
          </div>
          <div className="border border-slate-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-slate-500">思辨类型</p>
            <label className="flex items-center gap-2 cursor-pointer text-slate-700">
              <input type="radio" className="accent-brand-600" checked={thinkMode === 'inherit'} onChange={() => setThinkMode('inherit')} />
              模仿原题思辨类型（{TYPE_LABEL[q.thinkingType] || q.thinkingType}）
            </label>
            <div>
              <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                <input type="radio" className="accent-brand-600" checked={thinkMode === 'other'} onChange={() => setThinkMode('other')} />
                换成其他思辨类型
              </label>
              {thinkMode === 'other' && (
                <select className="input mt-1.5" value={thinkingType} onChange={(e) => setThinkingType(e.target.value)}>
                  <option value="">请选择</option>
                  {Object.entries(TYPE_LABEL).filter(([v]) => v !== q.thinkingType).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary" onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {generating ? '生成中…' : '按此风格生成新题'}
          </button>
        </div>

        {draft && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-800">{draft.title}</p>
              <div className="flex gap-2">
                <button className="btn-outline text-xs" onClick={() => save(false)}><Save className="w-3.5 h-3.5" /> 存入我的题库</button>
                <button className="btn-primary text-xs" onClick={() => save(true)}><Send className="w-3.5 h-3.5" /> 保存并发布</button>
              </div>
            </div>
            {draft.styleNote && <p className="text-xs text-brand-700">{draft.styleNote}</p>}
            <MetaBadges q={draft} />
            <p className="text-xs text-slate-600 leading-5">{draft.materialText}</p>
            <p className="text-xs text-slate-500"><span className="font-medium">写作要求：</span>{draft.requirementText}</p>
            {draft.traps.length > 0 && <p className="text-xs text-red-600">偏题陷阱：{draft.traps.join('；')}</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}
/* ============================ 1. 查找题库 ============================ */
function PickQuestionModal({ questions, onPick, onClose }: { questions: Question[]; onPick: (q: Question) => void; onClose: () => void }) {
  const [kw, setKw] = useState('');
  const k = kw.trim();
  const list = k
    ? questions.filter((q) => `${q.title}${q.keyword || ''}${q.province}${q.year || ''}${q.examCategory || ''}${q.paperName || ''}`.includes(k))
    : questions;
  return (
    <Modal open onClose={onClose} title="选择要模仿的原题" width="max-w-3xl">
      <div className="space-y-3 text-sm">
        <input className="input" value={kw} onChange={(e) => setKw(e.target.value)} placeholder="在结果中筛选：标题 / 话题 / 省份 / 年份 / 考试类别 / 试卷名" />
        {list.length === 0 ? (
          <Empty text="当前条件下没有可选的原题" hint="可返回上方调整筛选条件后再试" />
        ) : (
          <div className="max-h-[46vh] overflow-y-auto space-y-2 pr-1">
            {list.map((q) => (
              <div key={q.id} className="flex items-start justify-between gap-3 border border-slate-100 rounded-xl p-3 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800 text-sm">{q.title}</p>
                  <div className="mt-1.5"><MetaBadges q={q} /></div>
                  <p className="text-xs text-slate-500 mt-1.5 line-clamp-1 leading-5">{q.materialText}</p>
                </div>
                <button className="btn-primary text-xs shrink-0" onClick={() => onPick(q)}><Wand2 className="w-3.5 h-3.5" /> 以此题为原题</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function BankSearchTab({ onFlash, onError }: { onFlash: (s: string) => void; onError: (s: string) => void }) {
  const [meta, setMeta] = useState<Meta>({ provinces: [], years: [], examCategories: [] });
  const [province, setProvince] = useState('全部');
  const [year, setYear] = useState('全部');
  const [examCategory, setExamCategory] = useState('全部');
  const [keyword, setKeyword] = useState('');
  const [thinkingType, setThinkingType] = useState('');
  const [results, setResults] = useState<Question[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [preview, setPreview] = useState<Question | null>(null);
  const [imitateQ, setImitateQ] = useState<Question | null>(null);
  const [pickOpen, setPickOpen] = useState(false);

  const loadMeta = async (prov = '') => {
    const qs = prov ? `?province=${encodeURIComponent(prov)}` : '';
    try {
      const r = await api.get<{ meta: Meta }>(`/questions/meta${qs}`);
      setMeta(r.meta);
    } catch { /* 忽略，保留旧 meta */ }
  };
  useEffect(() => { loadMeta(); }, []);

  const isJuan = province.endsWith('卷') && province !== '全部';
  const showExamCategory = province !== '全部' && !isJuan;
  const showTopic = !(isJuan && year !== '全部');
  const changeProvince = async (v: string) => {
    setProvince(v);
    setYear('全部');
    setExamCategory('全部');
    await loadMeta(v);
  };

  const search = async (): Promise<Question[]> => {
    setSearching(true);
    try {
      const p = new URLSearchParams();
      if (province !== '全部') p.set('province', province);
      if (year !== '全部') p.set('year', year);
      if (showExamCategory && examCategory !== '全部') p.set('examCategory', examCategory);
      if (showTopic) {
        if (keyword.trim()) p.set('keyword', keyword.trim());
        if (thinkingType) p.set('thinkingType', thinkingType);
      }
      const r = await api.get<{ questions: Question[] }>(`/questions/bank?${p.toString()}`);
      setResults(r.questions);
      return r.questions;
    } catch (e) { onError((e as Error).message); return []; } finally { setSearching(false); }
  };

  const saveToMine = async (q: Question) => {
    try {
      const r = await api.post<{ question: Question }>(`/questions/${q.id}/save`);
      onFlash(`已保存「${r.question.title}」到我的题库`);
    } catch (e) { onError((e as Error).message); }
  };

  const startImitate = async () => {
    let list = results;
    if (!list || list.length === 0) list = await search();
    if (!list || list.length === 0) { onError('当前条件下没有可用于模仿出题的题目，请调整筛选条件后再试'); return; }
    setPickOpen(true);
  };

  return (
    <div className="space-y-4">
      <Card title="查找题库">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">省份/卷别</label>
            <select className="input" value={province} onChange={(e) => { changeProvince(e.target.value); }}>
              <option value="全部">全部</option>
              {meta.provinces.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="label">年份</label>
            <select className="input" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="全部">全部</option>
              {meta.years.map((y) => <option key={y} value={y}>{y}年</option>)}
            </select>
          </div>
          {showExamCategory && (
            <div>
              <label className="label">考试类别</label>
              <select className="input" value={examCategory} onChange={(e) => setExamCategory(e.target.value)}>
                <option value="全部">全部</option>
                {meta.examCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          {showTopic && (
            <>
              <div>
                <label className="label">话题关键词</label>
                <input className="input" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="如：科技与人文 / 青年担当" />
              </div>
              <div>
                <label className="label">思辨类型</label>
                <select className="input" value={thinkingType} onChange={(e) => setThinkingType(e.target.value)}>
                  <option value="free">自由发挥（AI 自主定类型）</option>
                  {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
          <p className="text-xs text-amber-600">提示：选以“卷”结尾的高考卷并选定年份后，即锁定该卷；选省份后可再用考试类别/话题/思辨继续筛选。</p>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => { search(); }} disabled={searching}>
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} 查找
            </button>
          </div>
        </div>
      </Card>

      {results !== null && (
        <Card title={`查找结果（${results.length}）`}>
          {searching ? <Spinner /> : results.length === 0 ? <Empty text="没有找到符合条件的题目" hint="可把筛选条件设为“全部”后按 话题关键词 + 思辨类型 查找" /> : (
            <div className="space-y-2">
              {results.map((q) => (
                <div key={q.id} className="flex items-start justify-between gap-3 border border-slate-100 rounded-xl p-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 text-sm">{q.title}</p>
                    <div className="mt-1.5"><MetaBadges q={q} /></div>
                    <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-5">{q.materialText}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                    <button className="btn-outline text-xs" onClick={() => setPreview(q)}><Eye className="w-3.5 h-3.5" /> 查看</button>
                    <button className="btn-outline text-xs" onClick={() => saveToMine(q)}><Save className="w-3.5 h-3.5" /> 存入我的题库</button>
                    <button className="btn-primary text-xs" onClick={() => setImitateQ(q)}><Wand2 className="w-3.5 h-3.5" /> 模仿出题</button>
                    <Link to={`/grading?question=${q.id}`} className="btn-ghost text-xs">去批改</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {pickOpen && <PickQuestionModal questions={results || []} onPick={(q) => { setPickOpen(false); setImitateQ(q); }} onClose={() => setPickOpen(false)} />}
      {imitateQ && <ImitateModal q={imitateQ} onClose={() => setImitateQ(null)} onFlash={onFlash} onError={onError} />}
      {preview && <QuestionPreviewModal q={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

/* ============================ 2. 自定义出题 ============================ */
function CustomGenerateTab({ onFlash, onError }: { onFlash: (s: string) => void; onError: (s: string) => void }) {
  const [keyword, setKeyword] = useState('');
  const [thinkingType, setThinkingType] = useState('free');
  const grade = '高二';
  const [inspiration, setInspiration] = useState('');
  const [draft, setDraft] = useState<Question | null>(null);
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    onError('');
    if (!keyword.trim() && !inspiration.trim()) { onError('请输入话题关键词或填写想法'); return; }
    setGenerating(true);
    try {
      const r = await api.post<{ draft: Question }>('/questions/generate-custom', {
        mode: 'idea',
        keyword: keyword.trim() || undefined,
        thinkingType: thinkingType || undefined,
        grade,
        inspiration: inspiration.trim() || undefined,
      });
      setDraft({ ...r.draft, published: false, teacherId: '', createdAt: new Date().toISOString(), id: '' });
    } catch (e) { onError((e as Error).message); } finally { setGenerating(false); }
  };

  const save = async (publish: boolean) => {
    if (!draft) return;
    try {
      const r = await api.post<{ question: Question }>('/questions', { ...draft, published: publish });
      onFlash(publish ? '已发布「' + r.question.title + '」' : '已保存到我的题库');
      setDraft(null);
    } catch (e) { onError((e as Error).message); }
  };

  return (
    <div className="space-y-4">
              <Card title="自定义出题：输入话题关键词或想法，由 AI 生成完整作文题">
          <div className="space-y-3">
            <p className="text-xs text-brand-600">按“自定义出题1.0”标准生成：材料约 140 字、设问引导、不直接给论点；思辨类型可自由发挥。</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label">话题关键词</label>
                <input className="input" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="输入你想要的作文话题，如：信息茧房 / 青年担当 / 数字时代的手艺人" />
              </div>
              <div>
                <label className="label">思辨类型</label>
                <select className="input" value={thinkingType} onChange={(e) => setThinkingType(e.target.value)}>
                  <option value="">全部</option>
                  {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="label">或者只写一点想法，让 AI 帮你想（可选）</label>
              <textarea className="input min-h-[80px]" value={inspiration} onChange={(e) => setInspiration(e.target.value)} placeholder="例：我想出一道关于“数字原住民与网络素养”的题，最好有现实案例做材料…" />
            </div>
          </div>
        <div className="flex justify-end mt-4">
          <button className="btn-primary" onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {generating ? '生成中…' : 'AI 生成题目'}
          </button>
        </div>
      </Card>

      {draft && (
        <Card title="生成结果"
          extra={
            <div className="flex gap-2">
              <button className="btn-outline text-xs" onClick={() => save(false)}><Save className="w-3.5 h-3.5" /> 存入我的题库</button>
              <button className="btn-primary text-xs" onClick={() => save(true)}><Send className="w-3.5 h-3.5" /> 保存并发布</button>
            </div>
          }>
          <div className="space-y-3">
            {draft.styleNote && <Alert tone="info">{draft.styleNote}</Alert>}
            <h4 className="font-semibold text-slate-800">{draft.title}</h4>
            <MetaBadges q={draft} />
            <div className="bg-slate-50 rounded-lg p-3 leading-6 text-slate-700">{draft.materialText}</div>
            <p className="text-slate-600"><span className="font-medium">写作要求：</span>{draft.requirementText}</p>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="border border-slate-200 rounded-lg p-3">
                <p className="font-medium mb-2">评分细则</p>
                <ul className="space-y-1">{draft.checklist.map((c, i) => <li key={i}>· {c.item}（{c.score} 分）</li>)}</ul>
              </div>
              <div className="border border-red-200 bg-red-50/40 rounded-lg p-3">
                <p className="font-medium text-red-700 mb-2">偏题陷阱预警</p>
                <ul className="space-y-1 text-red-600">{draft.traps.map((t, i) => <li key={i}>⚠ {t}</li>)}</ul>
              </div>
            </div>
            <p className="text-xs text-slate-400">{draft.sourceNote}</p>
          </div>
        </Card>
      )}
    </div>
  );
}
/* ============================ 3. 我的题库 ============================ */
function MyBankTab({ onFlash, onError }: { onFlash: (s: string) => void; onError: (s: string) => void }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<'all' | 'week' | 'month' | 'older'>('all');
  const [topicFilter, setTopicFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [preview, setPreview] = useState<Question | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [resultMsg, setResultMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ questions: Question[] }>('/questions/my');
      setQuestions(r.questions);
    } catch (e) { onError((e as Error).message); } finally { setLoading(false); }
  }, [onError]);
  useEffect(() => { load(); }, [load]);

  const topics = useMemo(() => [...new Set(questions.map((q) => q.keyword).filter(Boolean))] as string[], [questions]);
  const cats = useMemo(() => [...new Set(questions.map((q) => q.examCategory).filter(Boolean))] as string[], [questions]);

  const filtered = useMemo(() => {
    let list = questions;
    const now = Date.now();
    if (group === 'week') list = list.filter((q) => now - new Date(q.createdAt).getTime() < 7 * 864e5);
    if (group === 'month') list = list.filter((q) => now - new Date(q.createdAt).getTime() < 30 * 864e5);
    if (group === 'older') list = list.filter((q) => now - new Date(q.createdAt).getTime() >= 30 * 864e5);
    if (topicFilter) list = list.filter((q) => q.keyword === topicFilter);
    if (catFilter) list = list.filter((q) => q.examCategory === catFilter);
    return list;
  }, [questions, group, topicFilter, catFilter]);

  const togglePublish = async (q: Question) => {
    await api.post(`/questions/${q.id}/publish`, { published: !q.published });
    await load();
  };
  const remove = async (q: Question) => {
    if (!window.confirm(`删除题目「${q.title}」？`)) return;
    await api.del(`/questions/${q.id}`);
    await load();
  };
  const downloadTemplate = () => {
    const sample = [{ title: '示例：科技与人文', materialText: '…材料…', requirementText: '…写作要求…', keyword: '科技与人文', thinkingType: 'dialectical', province: '全国卷', grade: '高二', year: '2025', examCategory: '名校协作体', paperName: '某协作体联考' }];
    const blob = new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'question-import-template.json'; a.click();
    URL.revokeObjectURL(url);
  };
  const doImport = async () => {
    setImporting(true); setResultMsg('');
    try {
      const arr = JSON.parse(importText);
      const r = await api.post<{ added: Question[]; errors: string[]; count: number }>('/questions/import', { questions: Array.isArray(arr) ? arr : [arr] });
      setResultMsg(r.errors.length ? `导入成功 ${r.count} 条；${r.errors.join('；')}` : `导入成功 ${r.count} 条 ✓`);
      setImportText('');
      await load();
    } catch (e) { setResultMsg(`导入失败：${(e as Error).message}`); } finally { setImporting(false); }
  };

  return (
    <div className="space-y-4">
      <Card
        extra={<button className="btn-primary text-xs" onClick={() => { setImportOpen(true); setResultMsg(''); }}><Upload className="w-3.5 h-3.5" /> 导入新题</button>}
        bodyClassName="p-0">
        {loading ? <Spinner /> : questions.length === 0 ? <Empty text="题库为空" hint="可在“查找题库”收藏、自定义出题生成，或点击右上角“导入新题”" /> : (
          <>
            <div className="px-4 pt-3 flex items-center gap-2 flex-wrap border-b border-slate-100 pb-3">
              <select className="input !w-32 text-xs" value={group} onChange={(e) => setGroup(e.target.value as any)}>
                <option value="all">全部时间</option><option value="week">近 7 天</option>
                <option value="month">近 30 天</option><option value="older">30 天前</option>
              </select>
              <select className="input !w-40 text-xs" value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
                <option value="">全部话题</option>{topics.map((t) => <option key={t}>{t}</option>)}
              </select>
              <select className="input !w-40 text-xs" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
                <option value="">全部考试类别</option>{cats.map((c) => <option key={c}>{c}</option>)}
              </select>
              <span className="text-xs text-slate-400 ml-auto">共 {filtered.length} 题</span>
            </div>
            <div className="divide-y divide-slate-100">
              {filtered.map((q) => (
                <div key={q.id} className="flex items-start justify-between gap-3 p-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 text-sm">{q.title}</p>
                    <div className="mt-1"><MetaBadges q={q} /></div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-1">{q.materialText}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                    <button className="btn-outline text-xs" onClick={() => setPreview(q)}><Eye className="w-3.5 h-3.5" /> 查看</button>
                    <Link to={`/grading?question=${q.id}`} className="btn-ghost text-xs">去批改</Link>
                    <button className="btn-ghost text-xs" onClick={() => togglePublish(q)}>{q.published ? <><Pin className="w-3.5 h-3.5" /> 取消发布</> : <><Send className="w-3.5 h-3.5" /> 发布</>}</button>
                    <button className="btn-ghost text-xs text-red-600" onClick={() => remove(q)}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
      {preview && <QuestionPreviewModal q={preview} onClose={() => setPreview(null)} />}

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="导入新题（支持正式真题/模拟卷数据库批量导入）" width="max-w-3xl">
        <div className="space-y-3">
          <Alert tone="info">
            两种方式任选：① 粘贴 JSON 数组批量导入（可先下载模板）；② 数据库文件后续提供时，把内容整理成同结构 JSON 粘贴即可。字段：title、materialText、requirementText 必填；可选 keyword、thinkingType(progressive/dialectical/metaphoric，分别对应 逻辑递进型/关系辩证型/比喻象征型)、province、grade、year、examCategory、paperName、checklist、traps。
          </Alert>
          <div className="flex gap-2">
            <button className="btn-outline text-xs" onClick={downloadTemplate}><Download className="w-3.5 h-3.5" /> 下载 JSON 模板</button>
            <button className="btn-outline text-xs" onClick={() => setImportText('[{\n  "title": "…", "materialText": "…", "requirementText": "…", "keyword": "…", "thinkingType": "dialectical", "province": "全国卷", "year": "2025", "examCategory": "名校协作体"\n}]')}>填入示例</button>
          </div>
          <textarea className="input min-h-[220px] font-mono text-xs" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='[{ "title": "...", "materialText": "...", "requirementText": "..." }]' />
          {resultMsg && <p className="text-sm text-slate-600">{resultMsg}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn-outline" onClick={() => setImportOpen(false)}>关闭</button>
            <button className="btn-primary" onClick={doImport} disabled={importing || !importText.trim()}>
              {importing && <Loader2 className="w-4 h-4 animate-spin" />} 开始导入
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
