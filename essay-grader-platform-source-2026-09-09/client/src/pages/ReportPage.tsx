import React, { useEffect, useState } from 'react';
import { Loader2, Pin, Presentation, Copy } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { api, fmtDate } from '../api';
import type { ClassRoom, HighlightClip, Correction } from '../types';
import ColoredEssay, { MARK_COLOR_LABEL } from '../components/ColoredEssay';
import { Card, Badge, Spinner, Empty, Stat, Modal, Alert } from '../components/ui';

interface Report {
  className: string; gradeLevel: string; studentCount: number; correctionCount: number; avgScore: number;
  weaknessTop: { tag: string; count: number; ratio: number; advice: string }[];
  trend: { date: string; avg: number; count: number }[];
  clips: HighlightClip[];
  latest: { id: string; studentName: string; questionTitle: string; finalScore: number; logicErrorTags: string[]; isVerified: boolean; createdAt: string }[];
}
interface Outline { title: string; totalMinutes: number; segments: { phase: string; minutes: number; content: string; examples: string[] }[]; }

export default function ReportPage() {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [classId, setClassId] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [outline, setOutline] = useState<Outline | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [detail, setDetail] = useState<Correction | null>(null);
  const [detailId, setDetailId] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    api.get<{ classes: ClassRoom[] }>('/classes').then((r) => {
      setClasses(r.classes);
      if (r.classes[0]) setClassId(r.classes[0].id);
    }).catch((e) => setError((e as Error).message));
  }, []);

  const load = async (id: string) => {
    if (!id) return;
    setLoading(true); setError('');
    try {
      const r = await api.get<{ report: Report }>(`/reports/classes/${id}/report`);
      setReport(r.report);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };
  useEffect(() => { if (classId) load(classId); }, [classId]);

  const togglePin = async (clip: HighlightClip) => {
    await api.post(`/reports/highlights/${clip.id}/pin`, { pinned: !clip.isPinned });
    if (classId) await load(classId);
  };
  const genOutline = async () => {
    if (!classId) return;
    setGenLoading(true);
    try {
      const r = await api.post<{ outline: Outline }>(`/reports/classes/${classId}/lecture-outline`);
      setOutline(r.outline);
    } catch (e) { setError((e as Error).message); } finally { setGenLoading(false); }
  };
  const copyOutline = async () => {
    if (!outline) return;
    const txt = `# ${outline.title}\n\n` + outline.segments.map((s) => `## ${s.phase}（${s.minutes}分钟）\n${s.content}\n示例：${s.examples.join(' / ')}`).join('\n\n');
    await navigator.clipboard.writeText(txt);
    setNotice('讲评课大纲已复制'); window.setTimeout(() => setNotice(''), 2000);
  };

  const openDetail = async (id: string) => {
    setDetailId(id); setDetail(null); setDetailError('');
    setDetailLoading(true);
    try {
      const r = await api.get<{ correction: Correction }>(`/corrections/${id}`);
      setDetail(r.correction);
    } catch (e) { setDetailError((e as Error).message); }
    finally { setDetailLoading(false); }
  };
  const closeDetail = () => { setDetailId(''); setDetail(null); setDetailError(''); };

  const clips = showPinnedOnly ? (report?.clips || []).filter((c) => c.isPinned) : (report?.clips || []);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">班级学情报告</h1>
          <p className="text-sm text-slate-500 mt-0.5">共性薄弱项 TOP3 · 进步曲线 · 优秀片段墙 · 一键讲评课大纲</p>
        </div>
        <div className="flex items-center gap-3">
          <select className="input !w-44" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">选择班级</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn-primary" onClick={genOutline} disabled={genLoading || !classId}>
            {genLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Presentation className="w-4 h-4" />} 生成讲评课大纲
          </button>
        </div>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {loading ? <Spinner /> : !report ? <Empty text="请选择班级" /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="班级" value={report.className} sub={report.gradeLevel} />
            <Stat label="学生数" value={report.studentCount} />
            <Stat label="批改总量" value={report.correctionCount} />
            <Stat label="班级平均分" value={report.avgScore} tone="text-brand-700" sub="满分 60 · 一般基准 48" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card title="共性薄弱项 TOP3">
              {report.weaknessTop.length === 0 ? <Empty text="暂无错题数据" /> : report.weaknessTop.slice(0, 3).map((w, i) => (
                <div key={w.tag} className="mb-4 last:mb-0">
                  <div className="flex items-center justify-between text-sm">
                    <p className="font-medium text-slate-700">{i + 1}. {w.tag}</p>
                    <span className="text-xs text-slate-400">出现在 {w.count} 人次 · {Math.round(w.ratio * 100)}% 学生</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                    <div className={`h-full rounded-full ${i === 0 ? 'bg-red-500' : i === 1 ? 'bg-amber-500' : 'bg-brand-500'}`} style={{ width: `${Math.min(100, w.ratio * 100)}%` }} />
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5 leading-5">{w.advice}</p>
                </div>
              ))}
            </Card>

            <Card title="班级平均分进步曲线">
              {report.trend.length < 2 ? <Empty text="数据不足，至少需要 2 个批改日" /> : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={report.trend} margin={{ top: 8, right: 16, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis domain={[50, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="avg" name="平均分" stroke="#1d6fe8" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <Card title="优秀片段墙"
            extra={<label className="flex items-center gap-1.5 text-xs text-slate-500"><input type="checkbox" checked={showPinnedOnly} onChange={(e) => setShowPinnedOnly(e.target.checked)} /> 仅看置顶</label>}>
            {clips.length === 0 ? <Empty text="暂无片段" hint="批改时 AI 会自动提取精彩句子入库" /> : (
              <div className="grid md:grid-cols-2 gap-3">
                {clips.map((c) => (
                  <div key={c.id} className={`rounded-xl border p-3 ${c.isPinned ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200'}`}>
                    <p className="text-sm text-slate-700 leading-6">“{c.clipText}”</p>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-slate-400">{c.studentName || ''}{c.questionTitle ? ` · ${c.questionTitle}` : ''}</p>
                      <button onClick={() => togglePin(c)} className={`text-xs flex items-center gap-1 ${c.isPinned ? 'text-amber-600' : 'text-slate-400 hover:text-amber-600'}`}>
                        <Pin className="w-3.5 h-3.5" /> {c.isPinned ? '已置顶' : '置顶'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="最近批改明细">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="py-2 font-medium">学生</th><th className="py-2 font-medium">题目</th><th className="py-2 font-medium">得分</th><th className="py-2 font-medium">错误标签</th><th className="py-2 font-medium">复核</th><th className="py-2 font-medium">时间</th>
              </tr></thead>
              <tbody>
                {report.latest.map((c) => (
                  <tr key={c.id} onClick={() => openDetail(c.id)} title="点击查看完整批改1.0报告" className="border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50/60">
                    <td className="py-2.5 font-medium text-slate-700">{c.studentName}</td>
                    <td className="py-2.5 text-slate-500 max-w-[220px] truncate">{c.questionTitle || '—'}</td>
                    <td className="py-2.5 font-bold text-brand-700">{c.finalScore}</td>
                    <td className="py-2.5">{c.logicErrorTags.length ? c.logicErrorTags.slice(0, 2).map((t) => <Badge key={t} tone="red">{t}</Badge>) : '—'}</td>
                    <td className="py-2.5">{c.isVerified ? <Badge tone="green">已复核</Badge> : <Badge tone="amber">待复核</Badge>}</td>
                    <td className="py-2.5 text-xs text-slate-400">{fmtDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <Modal open={!!outline} onClose={() => setOutline(null)} title={outline?.title || '讲评课大纲'} width="max-w-3xl">
        {outline && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>总时长：{outline.totalMinutes} 分钟 · 建议生成 PPT 大纲后按需调整</span>
              <button className="btn-outline text-xs" onClick={copyOutline}><Copy className="w-3.5 h-3.5" /> 复制 Markdown</button>
            </div>
            {outline.segments.map((s, i) => (
              <div key={i} className="border border-slate-200 rounded-xl p-3">
                <div className="flex items-center gap-2"><Badge tone="blue">{i + 1}</Badge><p className="font-medium text-sm">{s.phase}</p><span className="text-xs text-slate-400">（{s.minutes} 分钟）</span></div>
                <p className="text-sm text-slate-600 mt-2 leading-6">{s.content}</p>
                {s.examples.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">{s.examples.map((ex, j) => <span key={j} className="text-xs bg-slate-100 text-slate-500 rounded px-2 py-0.5">{ex}</span>)}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={!!detailId} onClose={closeDetail} title="批改详情（批改1.0 报告）" width="max-w-4xl">
        {detailLoading ? <Spinner /> : detailError ? <Alert tone="error">{detailError}</Alert> : detail ? <CorrectionDetailView c={detail} /> : null}
      </Modal>
    </div>
  );
}


function CorrectionDetailView({ c }: { c: Correction }) {
  const pigai = c.aiResponse?.pigai;
  const dot = (color: string) => (color === 'red' ? 'bg-red-500' : color === 'blue' ? 'bg-blue-500' : 'bg-yellow-500');
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone="blue">{c.studentName || '未关联学生'}</Badge>
        <Badge tone="purple">最终得分 {c.finalScore} / 60</Badge>
        {c.aiResponse?.scoring?.grade ? <Badge tone="gray">AI 等级 {c.aiResponse.scoring.grade}</Badge> : null}
        {c.isVerified ? <Badge tone="green">已复核</Badge> : <Badge tone="amber">待复核</Badge>}
        <span className="text-xs text-slate-400 ml-auto">{c.questionTitle || ''}{c.createdAt ? ' · ' + fmtDate(c.createdAt) : ''}</span>
      </div>

      {pigai ? (
        <>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <p className="font-medium text-slate-800">批改1.0 估分：<span className="text-3xl font-bold text-brand-700">{pigai.estimate.main}</span> / 60</p>
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
              <ColoredEssay text={c.originalText} marks={pigai.marks} />
            </div>
            {pigai.marks.length > 0 && (
              <ul className="space-y-1 mt-2 text-xs">
                {pigai.marks.map((m, i) => (
                  <li key={i} className="flex items-start gap-2 leading-5">
                    <span className={'inline-block w-2.5 h-2.5 rounded-full mt-1 shrink-0 ' + dot(m.color)} />
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
          🗂 旧版数据：该记录由早期版本生成，不含“批改1.0”报告，可在“批改工作台”重新批改生成新版报告。
        </p>
      )}

      {c.teacherModifiedComment && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
          <p className="font-medium text-amber-700 mb-1">📝 教师终审评语</p>
          <p className="whitespace-pre-wrap leading-6">{c.teacherModifiedComment}</p>
        </div>
      )}
    </div>
  );
}
