import React, { useEffect, useMemo, useState } from 'react';
import { Download, Search, Eye } from 'lucide-react';
import { api, fmtDate, getToken } from '../api';
import type { ClassRoom, Question, Correction } from '../types';
import { Card, Badge, Spinner, Empty, Modal, Alert } from '../components/ui';
import ColoredEssay, { MARK_COLOR_LABEL } from '../components/ColoredEssay';

const ALL_TAGS = ['偷换概念', '论据偏离', '逻辑重叠', '循环论证', '以偏概全', '因果倒置'];

export default function HistoryPage() {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [classId, setClassId] = useState('');
  const [questionId, setQuestionId] = useState('');
  const [tag, setTag] = useState('');
  const [keyword, setKeyword] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [detail, setDetail] = useState<Correction | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [c, q] = await Promise.all([
          api.get<{ classes: ClassRoom[] }>('/classes'),
          api.get<{ questions: Question[] }>('/questions'),
        ]);
        setClasses(c.classes); setQuestions(q.questions);
      } catch (e) { setError((e as Error).message); }
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (classId) qs.set('classId', classId);
      if (questionId) qs.set('questionId', questionId);
      if (tag) qs.set('tag', tag);
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const r = await api.get<{ corrections: Correction[] }>(`/corrections?${qs.toString()}`);
      setCorrections(r.corrections);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [classId, questionId, tag, from, to]);

  const filtered = useMemo(() => {
    if (!keyword.trim()) return corrections;
    return corrections.filter((c) => (c.studentName || '').includes(keyword.trim()) || (c.questionTitle || '').includes(keyword.trim()));
  }, [corrections, keyword]);

  const exportCsv = async () => {
    const qs = new URLSearchParams();
    if (classId) qs.set('classId', classId);
    if (questionId) qs.set('questionId', questionId);
    if (tag) qs.set('tag', tag);
    const res = await fetch(`/api/corrections/export.csv?${qs.toString()}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `批改记录_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const toggleVerified = async (c: Correction) => {
    await api.put(`/corrections/${c.id}`, { isVerified: !c.isVerified });
    setDetail({ ...c, isVerified: !c.isVerified });
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">批改历史与检索</h1>
          <p className="text-sm text-slate-500 mt-0.5">按班级 / 学生 / 题目 / 错误标签 / 时间多维度筛选，支持导出 Excel(CSV)</p>
        </div>
        <button className="btn-primary" onClick={exportCsv}><Download className="w-4 h-4" /> 导出 CSV</button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <Card bodyClassName="p-3">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          <select className="input text-xs" value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">全部班级</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select className="input text-xs" value={questionId} onChange={(e) => setQuestionId(e.target.value)}><option value="">全部题目</option>{questions.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}</select>
          <select className="input text-xs" value={tag} onChange={(e) => setTag(e.target.value)}><option value="">全部错误标签</option>{ALL_TAGS.map((t) => <option key={t}>{t}</option>)}</select>
          <input type="date" className="input text-xs" value={from} onChange={(e) => setFrom(e.target.value)} title="开始日期" />
          <input type="date" className="input text-xs" value={to} onChange={(e) => setTo(e.target.value)} title="结束日期" />
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input className="input text-xs pl-7" placeholder="搜索学生/题目" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          </div>
        </div>
      </Card>

      <Card title={`共 ${filtered.length} 条记录`}>
        {loading ? <Spinner /> : filtered.length === 0 ? <Empty text="没有符合条件的记录" /> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-100">
              <th className="py-2 font-medium">学生</th><th className="py-2 font-medium">班级</th><th className="py-2 font-medium">题目</th><th className="py-2 font-medium">得分</th><th className="py-2 font-medium">错误标签</th><th className="py-2 font-medium">复核</th><th className="py-2 font-medium">时间</th><th></th>
            </tr></thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 cursor-pointer" onClick={() => setDetail(c)}>
                  <td className="py-2.5 font-medium text-slate-700">{c.studentName || '—'}</td>
                  <td className="py-2.5 text-slate-500">{c.className || '—'}</td>
                  <td className="py-2.5 text-slate-500 max-w-[200px] truncate">{c.questionTitle || '—'}</td>
                  <td className="py-2.5 font-bold text-brand-700">{c.finalScore}</td>
                  <td className="py-2.5">{c.logicErrorTags.length ? c.logicErrorTags.slice(0, 3).map((t) => <Badge key={t} tone="red">{t}</Badge>) : '—'}</td>
                  <td className="py-2.5">{c.isVerified ? <Badge tone="green">已复核</Badge> : <Badge tone="amber">待复核</Badge>}</td>
                  <td className="py-2.5 text-xs text-slate-400">{fmtDate(c.createdAt)}</td>
                  <td className="py-2.5 text-right"><Eye className="w-4 h-4 text-slate-300" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `批改详情 · ${detail.studentName || ''}（${detail.finalScore} 分）` : ''} width="max-w-4xl">
        {detail && (() => {
          const pigai = detail.aiResponse?.pigai;
          return (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              {detail.isVerified ? <Badge tone="green">已复核</Badge> : <Badge tone="amber">待复核</Badge>}
              {!pigai && detail.confidenceAvg > 0 && <Badge tone="blue">置信度 {Math.round(detail.confidenceAvg * 100)}%</Badge>}
              {detail.logicErrorTags.length > 0 && detail.logicErrorTags.slice(0, 3).map((t) => <Badge key={t} tone="red">{t}</Badge>)}
              <button className="btn-outline text-xs ml-auto" onClick={() => toggleVerified(detail)}>标记为{detail.isVerified ? '待复核' : '已复核'}</button>
            </div>

            {pigai ? (
              <>
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="font-medium text-slate-800">批改1.0 估分：<span className="text-2xl font-bold text-brand-700">{pigai.estimate.main}</span> / 60</p>
                    <Badge tone="blue">区间 {pigai.estimate.range}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs max-w-md">
                    <div className="bg-slate-50 rounded-lg p-2"><p className="text-slate-500">内容（20）</p><p className="font-bold text-slate-800 text-base">{pigai.estimate.blocks.content}</p></div>
                    <div className="bg-slate-50 rounded-lg p-2"><p className="text-slate-500">表达（20）</p><p className="font-bold text-slate-800 text-base">{pigai.estimate.blocks.expression}</p></div>
                    <div className="bg-slate-50 rounded-lg p-2"><p className="text-slate-500">发展（20）</p><p className="font-bold text-slate-800 text-base">{pigai.estimate.blocks.development}</p></div>
                  </div>
                  {(pigai.estimate.floorReasons.length > 0 || pigai.estimate.nextBandGaps.length > 0) && (
                    <div className="grid md:grid-cols-2 gap-3 mt-3">
                      <div className="rounded-lg bg-emerald-50/60 border border-emerald-200 p-2.5">
                        <p className="text-xs font-medium text-emerald-700 mb-1">✅ 守得住当前区间</p>
                        <ul className="space-y-1 text-xs text-slate-700 leading-5">{pigai.estimate.floorReasons.map((r, i) => <li key={i}>· {r}</li>)}</ul>
                      </div>
                      <div className="rounded-lg bg-amber-50/60 border border-amber-200 p-2.5">
                        <p className="text-xs font-medium text-amber-700 mb-1">📈 不足以进入上一区间</p>
                        <ul className="space-y-1 text-xs text-slate-700 leading-5">{pigai.estimate.nextBandGaps.map((r, i) => <li key={i}>· {r}</li>)}</ul>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <p className="font-medium mb-1">🎨 作文全文三色标注（红=错字/病句 · 蓝=逻辑错误 · 黄=引用待核）</p>
                  <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/40">
                    <ColoredEssay text={detail.originalText} marks={pigai.marks} />
                  </div>
                  {pigai.marks.length > 0 && (
                    <ul className="space-y-1 mt-2 text-xs">
                      {pigai.marks.map((m, i) => (
                        <li key={i} className="flex items-start gap-2 leading-5">
                          <span className={'inline-block w-2.5 h-2.5 rounded-full mt-1 shrink-0 ' + (m.color === 'red' ? 'bg-red-500' : m.color === 'blue' ? 'bg-blue-500' : 'bg-yellow-500')} />
                          <span className="text-slate-400 shrink-0">第 {m.paragraph} 段·{MARK_COLOR_LABEL[m.color]}</span>
                          <span className="text-slate-500 line-through shrink-0 max-w-[180px] truncate">{m.original}</span>
                          <span className="text-slate-600">{m.note}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="font-medium mb-1.5">📋 四维优点与不足</p>
                  <div className="grid md:grid-cols-2 gap-2">
                    {pigai.dimensions.map((d, i) => (
                      <div key={i} className="rounded-lg border border-slate-200 p-2.5">
                        <p className="text-sm font-medium text-slate-800 mb-1">{d.name}</p>
                        {(d.strengths.length ? d.strengths : ['（暂无）']).map((s, j) => <p key={'s' + j} className="text-xs text-emerald-700 leading-5 flex gap-1"><span>✅</span><span>{s}</span></p>)}
                        {(d.weaknesses.length ? d.weaknesses : ['（暂无）']).map((s, j) => <p key={'w' + j} className="text-xs text-amber-700 leading-5 flex gap-1"><span>⚠</span><span>{s}</span></p>)}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400 leading-6 rounded-lg bg-slate-50 p-3">
                🗂 旧版数据：该记录由早期版本生成，不含“批改1.0”报告。可在“批改工作台”重新加载并点击「AI 批改」以生成新版报告。
              </p>
            )}

            {detail.teacherModifiedComment && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                <p className="font-medium text-amber-700 mb-1">📝 教师终审评语</p>
                <p className="whitespace-pre-wrap leading-6">{detail.teacherModifiedComment}</p>
              </div>
            )}
          </div>
          );
        })()}
      </Modal>
    </div>
  );
}
