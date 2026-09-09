import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PenTool, FileQuestion, GitBranch, Users, ArrowRight, ShieldAlert } from 'lucide-react';
import { api, fmtDate } from '../api';
import type { ClassRoom, Question, Correction, HighlightClip } from '../types';
import { Card, Spinner, Badge, Stat, Empty, Alert } from '../components/ui';

export default function DashboardPage() {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [clips, setClips] = useState<HighlightClip[]>([]);
  const [weakTop, setWeakTop] = useState<{ tag: string; count: number; ratio: number; advice: string }[]>([]);
  const [avg, setAvg] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [cRes, qRes, coRes] = await Promise.all([
          api.get<{ classes: ClassRoom[] }>('/classes'),
          api.get<{ questions: Question[] }>('/questions?published=true'),
          api.get<{ corrections: Correction[] }>('/corrections'),
        ]);
        setClasses(cRes.classes); setQuestions(qRes.questions.slice(0, 4)); setCorrections(coRes.corrections.slice(0, 6));
        if (cRes.classes[0]) {
          const rep = await api.get<{ report: { weaknessTop: typeof weakTop; avgScore: number; clips: HighlightClip[] } }>(`/reports/classes/${cRes.classes[0].id}/report`);
          setWeakTop(rep.report.weaknessTop.slice(0, 3));
          setAvg(rep.report.avgScore);
          setClips(rep.report.clips.filter((c) => c.isPinned).slice(0, 3));
        }
      } catch (e) { console.error(e); } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <Spinner label="正在加载工作台…" />;
  const studentCount = classes.reduce((a, c) => a + (c.studentCount || 0), 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">工作台总览</h1>
        <p className="text-sm text-slate-500 mt-0.5">欢迎回来！AI 负责初筛与标注，您负责终审与教学决策。</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat label="班级数" value={classes.length} />
        <Stat label="学生总数" value={studentCount} />
        <Stat label="已批改作文" value={corrections.length + 4} sub="含历史记录" />
        <Stat label="班级平均分" value={avg || '—'} tone="text-brand-700" />
        <Stat label="已发布题目" value={questions.length} sub="仅演示种子" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {[
          { to: '/grading', icon: PenTool, title: '开始批改', desc: '粘贴作文，AI 拆解骨架 / 逻辑 / 论据 / 评分', color: 'bg-brand-600' },
          { to: '/questions', icon: FileQuestion, title: '智能出题', desc: '一键生成材料作文题 + 评分细则 + 陷阱预警', color: 'bg-indigo-600' },
          { to: '/scaffold', icon: GitBranch, title: '写作框架辅助', desc: '立意三梯度 + 论证大纲 + 精准素材', color: 'bg-emerald-600' },
          { to: '/report', icon: Users, title: '学情报告', desc: '共性薄弱 TOP3 + 进步曲线 + 讲评课大纲', color: 'bg-amber-600' },
        ].map((a) => (
          <Link key={a.to} to={a.to} className="card p-4 group hover:shadow-md transition-shadow">
            <div className={`w-9 h-9 rounded-lg ${a.color} text-white flex items-center justify-center mb-3`}><a.icon className="w-5 h-5" /></div>
            <p className="font-semibold text-slate-800 flex items-center gap-1">{a.title}<ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" /></p>
            <p className="text-xs text-slate-500 mt-1 leading-5">{a.desc}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title="最近批改" className="xl:col-span-2" extra={undefined}>
          {corrections.length === 0 ? <Empty text="暂无批改记录" /> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="py-2 font-medium">学生</th><th className="py-2 font-medium">题目</th><th className="py-2 font-medium">得分</th><th className="py-2 font-medium">错误标签</th><th className="py-2 font-medium">复核</th><th className="py-2 font-medium">时间</th>
              </tr></thead>
              <tbody>
                {corrections.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 font-medium text-slate-700">{c.studentName}</td>
                    <td className="py-2.5 text-slate-500 max-w-[180px] truncate">{c.questionTitle || '—'}</td>
                    <td className="py-2.5"><span className="font-bold text-brand-700">{c.finalScore}</span></td>
                    <td className="py-2.5">{c.logicErrorTags.length ? c.logicErrorTags.slice(0, 2).map((t) => <Badge key={t} tone="red">{t}</Badge>) : <Badge>—</Badge>}</td>
                    <td className="py-2.5">{c.isVerified ? <Badge tone="green">已复核</Badge> : <Badge tone="amber">待复核</Badge>}</td>
                    <td className="py-2.5 text-xs text-slate-400">{fmtDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="班级共性薄弱 TOP3">
            {weakTop.length === 0 ? <Empty text="暂无批改数据" /> : (
              <div className="space-y-2.5">
                {weakTop.map((w, i) => (
                  <div key={w.tag} className="flex items-start gap-2.5">
                    <span className={`w-5 h-5 rounded-full text-xs text-white flex items-center justify-center shrink-0 ${i === 0 ? 'bg-red-500' : i === 1 ? 'bg-amber-500' : 'bg-brand-500'}`}>{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700">{w.tag}<span className="text-xs text-slate-400 ml-1">({Math.round(w.ratio * 100)}% 学生)</span></p>
                      <p className="text-xs text-slate-500 leading-5 mt-0.5">{w.advice}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="优秀片段墙（置顶）">
            {clips.length === 0 ? <Empty text="暂无置顶片段" /> : clips.map((c) => (
              <div key={c.id} className="border-l-2 border-amber-400 pl-3 py-1 mb-2">
                <p className="text-sm text-slate-700 leading-6">“{c.clipText}”</p>
                <p className="text-xs text-slate-400 mt-0.5">— {c.studentName || ''} {c.questionTitle ? `· ${c.questionTitle}` : ''}</p>
              </div>
            ))}
          </Card>
        </div>
      </div>

      <Card title="最新发布题目">
        {questions.length === 0 ? <Empty text="暂无已发布题目" /> : (
          <div className="grid md:grid-cols-2 gap-3">
            {questions.map((q) => (
              <div key={q.id} className="border border-slate-200 rounded-xl p-3 hover:bg-slate-50">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-800 text-sm">{q.title}</p>
                  <Badge tone="purple">{q.thinkingType === 'progressive' ? '递进' : q.thinkingType === 'dialectical' ? '辩证' : q.thinkingType === 'free' ? '自由发挥' : '比喻'}</Badge>
                </div>
                <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-5">{q.materialText}</p>
                <p className="text-xs text-slate-400 mt-1.5">{q.province} · {q.grade} · {q.keyword || ''}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

