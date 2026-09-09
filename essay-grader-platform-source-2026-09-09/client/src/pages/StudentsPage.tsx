import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles, CheckCircle2, BookOpenCheck, Target } from 'lucide-react';
import { api, fmtDate } from '../api';
import type { ClassRoom, Student, Weakness, Correction, LearningTask } from '../types';
import { Card, Badge, Spinner, Empty, Alert } from '../components/ui';

interface Recommendation {
  studentId: string; studentName: string; focus: string; reason: string;
  tasks: { questionId?: string; questionTitle?: string; taskType: string; note: string }[];
}

export default function StudentsPage() {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [weaknesses, setWeaknesses] = useState<Weakness[]>([]);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [tasks, setTasks] = useState<LearningTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [recLoading, setRecLoading] = useState(false);

  useEffect(() => {
    api.get<{ classes: ClassRoom[] }>('/classes').then((r) => { setClasses(r.classes); if (r.classes[0]) setClassId(r.classes[0].id); }).catch(() => undefined);
  }, []);

  const loadStudents = async (id: string) => {
    if (!id) return;
    const r = await api.get<{ students: Student[] }>(`/classes/${id}/students`);
    setStudents(r.students);
    if (r.students[0]) setStudentId(r.students[0].id);
    else setStudentId('');
  };
  useEffect(() => { loadStudents(classId); /* eslint-disable-next-line */ }, [classId]);

  const loadDetail = async (id: string) => {
    if (!id) return;
    setLoading(true); setRec(null);
    try {
      const r = await api.get<{ weaknesses: Weakness[]; corrections: Correction[]; tasks: LearningTask[] }>(`/students/${id}`);
      setWeaknesses(r.weaknesses); setCorrections(r.corrections); setTasks(r.tasks);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };
  useEffect(() => { loadDetail(studentId); /* eslint-disable-next-line */ }, [studentId]);

  const genRec = async () => {
    if (!studentId) return;
    setRecLoading(true); setError('');
    try {
      const r = await api.post<{ recommendation: Recommendation }>(`/students/${studentId}/recommendations`);
      setRec(r.recommendation);
    } catch (e) { setError((e as Error).message); } finally { setRecLoading(false); }
  };

  const assignTask = async (t: Recommendation['tasks'][number]) => {
    if (!studentId) return;
    await api.post(`/students/${studentId}/tasks`, { questionId: t.questionId, questionTitle: t.questionTitle, taskType: t.taskType, note: t.note });
    setNotice('学习任务已布置 ✓'); window.setTimeout(() => setNotice(''), 2500);
    await loadDetail(studentId);
  };

  const completeTask = async (t: LearningTask) => {
    await api.put(`/students/tasks/${t.id}`, { status: t.status === 'completed' ? 'pending' : 'completed' });
    await loadDetail(studentId);
  };

  const student = students.find((s) => s.id === studentId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">错题本与个性化学习路径</h1>
        <p className="text-sm text-slate-500 mt-0.5">查看每位学生的逻辑错误标签汇总，AI 基于错题本与得分趋势生成专属学习建议，一键布置。</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
        <Card title="选择学生" bodyClassName="p-2">
          <select className="input mb-3" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">选择班级</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
            {students.map((s) => (
              <button key={s.id} onClick={() => setStudentId(s.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm ${studentId === s.id ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-300' : 'hover:bg-slate-50 text-slate-600'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-slate-400">{s.avgScore || '—'}分</span>
                </div>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">{s.tags?.length ? s.tags.slice(0, 3).join('、') : '暂无错题标签'}</p>
              </button>
            ))}
          </div>
        </Card>

        <div className="lg:col-span-3 space-y-4">
          {!student ? <Card><Empty text="请先选择班级与学生" /></Card> : loading ? <Spinner /> : (
            <>
              <div className="grid md:grid-cols-3 gap-3">
                <Card title="个人错题本">
                  {weaknesses.length === 0 ? <Empty text="暂无错题记录" /> : (
                    <div className="space-y-2">
                      {weaknesses.map((w) => (
                        <div key={w.id} className="rounded-lg border border-red-200 bg-red-50/40 p-2.5">
                          <Badge tone="red">{w.errorTag}</Badge>
                          <p className="text-xs text-slate-500 mt-1.5 leading-5 line-clamp-2">{w.exampleSentence}</p>
                          <p className="text-[10px] text-slate-300 mt-1">{fmtDate(w.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
                <Card title="个人学习任务">
                  {tasks.length === 0 ? <Empty text="暂无任务" /> : (
                    <div className="space-y-2">
                      {tasks.map((t) => (
                        <button key={t.id} onClick={() => completeTask(t)} className={`w-full text-left rounded-lg border p-2.5 ${t.status === 'completed' ? 'border-emerald-200 bg-emerald-50/40 opacity-70' : 'border-slate-200 hover:bg-slate-50'}`}>
                          <div className="flex items-center gap-1.5">
                            <Badge tone={t.status === 'completed' ? 'green' : 'blue'}>{t.taskType === 'practice' ? '练习' : t.taskType === 'review' ? '复习' : '阅读'}</Badge>
                            {t.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                          </div>
                          <p className="text-xs text-slate-600 mt-1.5 leading-5">{t.note || t.questionTitle || ''}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </Card>
                <Card title="AI 个性化推荐"
                  extra={<button className="btn-outline text-xs" onClick={genRec} disabled={recLoading}>{recLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} 生成</button>}>
                  {rec ? (
                    <div className="space-y-2">
                      <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-2.5">
                        <p className="text-xs font-medium text-brand-700 flex items-center gap-1"><Target className="w-3 h-3" /> 本周重点：{rec.focus}</p>
                        <p className="text-xs text-slate-600 mt-1 leading-5">{rec.reason}</p>
                      </div>
                      {rec.tasks.map((t, i) => (
                        <button key={i} onClick={() => assignTask(t)} className="w-full text-left rounded-lg border border-slate-200 p-2 hover:bg-slate-50">
                          <div className="flex items-center justify-between"><Badge tone="blue">{t.taskType === 'practice' ? '练习' : t.taskType === 'review' ? '复习' : '阅读'}</Badge><span className="text-xs text-brand-600">一键布置 +</span></div>
                          <p className="text-xs text-slate-600 mt-1.5 leading-5">{t.note}</p>
                        </button>
                      ))}
                    </div>
                  ) : <Empty text="点击「生成」获取学习建议" hint="基于错题本与得分趋势" />}
                </Card>
              </div>

              <Card title={`最近批改（${student.name}）`}>
                {corrections.length === 0 ? <Empty text="暂无批改记录" /> : (
                  <div className="space-y-2">
                    {corrections.map((c) => (
                      <div key={c.id} className="flex items-center justify-between border border-slate-100 rounded-lg p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{c.questionTitle || '自由作文'}</p>
                          <div className="flex gap-1 mt-1 flex-wrap">{c.logicErrorTags.map((t) => <Badge key={t} tone="red">{t}</Badge>)}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-brand-700">{c.finalScore}</p>
                          <p className="text-[10px] text-slate-400">{fmtDate(c.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
