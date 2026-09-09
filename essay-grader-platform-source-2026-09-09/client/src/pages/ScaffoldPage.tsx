import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { api } from '../api';
import type { Question } from '../types';
import { Card, Badge, Empty, Alert } from '../components/ui';

interface ScaffoldData {
  insights: { level: string; title: string; description: string }[];
  outline: { intro: string; points: { title: string; type: string; detail: string }[]; conclusion: string };
  materials: { name: string; trait: string; appliesTo: string; source: string }[];
  traps: string[];
}

export default function ScaffoldPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [mode, setMode] = useState<'existing' | 'custom'>('existing');
  const [questionId, setQuestionId] = useState('');
  const [title, setTitle] = useState('');
  const [material, setMaterial] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScaffoldData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ questions: Question[] }>('/questions').then((r) => {
      setQuestions(r.questions);
      const pub = r.questions.find((x) => x.published);
      if (pub) setQuestionId(pub.id);
    }).catch(() => undefined);
  }, []);

  const generate = async () => {
    setError('');
    if (mode === 'custom' && (!title.trim() || !material.trim())) { setError('请填写作文题标题与材料'); return; }
    setLoading(true);
    try {
      const body = mode === 'existing' ? { questionId } : { title, materialText: material };
      const r = await api.post<{ scaffold: ScaffoldData }>('/scaffold/generate', body);
      setResult(r.scaffold);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">写作框架辅助</h1>
        <p className="text-sm text-slate-500 mt-0.5">立意三梯度 + 论证大纲 + 精准素材推荐，一键生成课堂可用框架</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <Card title="选择作文题">
        <div className="flex gap-2 mb-3">
          {([['existing', '从已发布/题库题目'], ['custom', '自定义题目']] as const).map(([m, label]) => (
            <button key={m} onClick={() => { setMode(m); setResult(null); }}
              className={`px-3 py-1.5 text-sm rounded-lg border ${mode === m ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'}`}>{label}</button>
          ))}
        </div>
        {mode === 'existing' ? (
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="label">题目</label>
              <select className="input" value={questionId} onChange={(e) => setQuestionId(e.target.value)}>
                <option value="">选择题目</option>
                {questions.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
              </select>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div><label className="label">作文题标题</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：快与慢" /></div>
            <div><label className="label">材料/引导语</label><textarea className="input min-h-[80px]" value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="粘贴作文材料或引导语…" /></div>
          </div>
        )}
        <button className="btn-primary mt-3" onClick={generate} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} 生成写作框架
        </button>
      </Card>

      {result && (
        <>
          <div className="grid md:grid-cols-3 gap-3">
            {result.insights.map((ins, i) => (
              <div key={i} className={`card p-4 border-t-4 ${i === 0 ? 'border-emerald-400' : i === 1 ? 'border-brand-400' : 'border-violet-400'}`}>
                <Badge tone={i === 0 ? 'green' : i === 1 ? 'blue' : 'purple'}>{ins.level}</Badge>
                <p className="font-semibold text-slate-800 mt-2 text-sm">{ins.title}</p>
                <p className="text-xs text-slate-500 mt-1.5 leading-5">{ins.description}</p>
              </div>
            ))}
          </div>

          <Card title="论证大纲">
            <div className="space-y-2 text-sm">
              <div className="flex gap-2"><Badge tone="blue">开头</Badge><p className="text-slate-700 leading-6">{result.outline.intro}</p></div>
              {result.outline.points.map((p, i) => (
                <div key={i} className="flex gap-2"><Badge tone={p.type === '递进' ? 'purple' : p.type === '对比' ? 'amber' : 'gray'}>{p.type} · 分论点{i + 1}</Badge>
                  <div><p className="text-slate-700 leading-6">{p.title}</p><p className="text-xs text-slate-400">{p.detail}</p></div></div>
              ))}
              <div className="flex gap-2"><Badge tone="green">结尾</Badge><p className="text-slate-700 leading-6">{result.outline.conclusion}</p></div>
            </div>
          </Card>

          <Card title="精准素材推荐">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="py-2 font-medium">素材名称</th><th className="py-2 font-medium">核心品质</th><th className="py-2 font-medium">适用分论点</th><th className="py-2 font-medium">来源</th>
              </tr></thead>
              <tbody>
                {result.materials.map((m, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 font-medium text-slate-700">{m.name}</td>
                    <td className="py-2.5 text-slate-500">{m.trait}</td>
                    <td className="py-2.5"><Badge tone="blue">{m.appliesTo}</Badge></td>
                    <td className="py-2.5 text-xs text-slate-400">{m.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.traps.length > 0 && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50/40 p-3">
                <p className="text-xs font-medium text-red-700 mb-1">⚠ 立意偏题预警</p>
                <p className="text-sm text-red-600">{result.traps.join('；')}</p>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

