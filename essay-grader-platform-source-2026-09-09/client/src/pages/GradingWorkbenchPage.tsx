import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Mic, MicOff, Wand2, Save, FileText, CheckCircle2, ImagePlus, Camera, ClipboardPaste, Download } from 'lucide-react';
import { api } from '../api';
import type { Question, ClassRoom, Student, Correction, AIResponse, PigaiMark } from '../types';
import { Card, Badge, Empty, Alert, Modal } from '../components/ui';
import ColoredEssay, { PigaiLegend, MARK_COLOR_LABEL } from '../components/ColoredEssay';

export default function GradingWorkbenchPage() {
  const [params] = useSearchParams();
  const initQid = params.get('question') || '';
  const [questions, setQuestions] = useState<Question[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [questionId, setQuestionId] = useState(initQid);
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [essay, setEssay] = useState('');
  const [qMode, setQMode] = useState<'text' | 'image'>('text');
  const [qSub, setQSub] = useState<'paste' | 'voice'>('paste');
  const [questionText, setQuestionText] = useState('');
  const [qImg, setQImg] = useState('');
  const [qOcr, setQOcr] = useState(false);
  const [eMode, setEMode] = useState<'text' | 'image'>('text');
  const [eSub, setESub] = useState<'paste' | 'voice'>('paste');
  const [eImg, setEImg] = useState('');
  const [eOcr, setEOcr] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [analysis, setAnalysis] = useState<AIResponse | null>(null);
  const [metrics, setMetrics] = useState<{ lengthInfo: { chars: number; count: number; shortage: number; penalty: number } } | null>(null);
  const [finalScore, setFinalScore] = useState(0);
  const [comment, setComment] = useState('');
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [q, c] = await Promise.all([
          api.get<{ questions: Question[] }>('/questions'),
          api.get<{ classes: ClassRoom[] }>('/classes'),
        ]);
        setQuestions(q.questions); setClasses(c.classes);
        if (c.classes[0]) { setClassId(c.classes[0].id); }
      } catch (e) { setError((e as Error).message); }
    })();
  }, []);

  useEffect(() => {
    if (!classId) return;
    api.get<{ students: Student[] }>(`/classes/${classId}/students`).then((r) => setStudents(r.students)).catch(() => undefined);
  }, [classId]);

  const currentQuestion = questions.find((x) => x.id === questionId);

  const loadSample = async () => {
    if (!questionId) { setError('请先选择题目'); return; }
    setError('');
    const r = await api.get<{ corrections: Correction[] }>(`/corrections?questionId=${questionId}`);
    if (!r.corrections.length) { setError('该题目暂无示例范文（演示模式仅内置 q-1/q-2 两篇）'); return; }
    const c = r.corrections.find((x) => x.originalText.length > 300) || r.corrections[0];
    setEssay(c.originalText);
    if (c.studentId) { setStudentId(c.studentId); setClassId(c.className ? classes.find((k) => k.name === c.className)?.id || classId : classId); }
    setNotice('已载入历史学生范文，可点击「AI 批改」体验');
    window.setTimeout(() => setNotice(''), 3000);
  };

  const runAnalysis = async () => {
    setError(''); setNotice('');
    if (!essay.trim()) { setError('请先输入作文正文（文字粘贴/语音/图片导入均可）'); return; }
    setAnalyzing(true);
    try {
      const r = await api.post<{ analysis: AIResponse; question: Question | null; metrics: { lengthInfo: { chars: number; count: number; shortage: number; penalty: number } } }>('/corrections/analyze', {
        questionId: questionId || undefined,
        questionText: !questionId && questionText.trim() ? questionText.trim() : undefined,
        essay,
      });
      setAnalysis(r.analysis);
      setMetrics(r.metrics);
      setFinalScore(r.analysis.scoring.finalScore);
      setComment('');
      setVerified(false);
      setSavedOk(false);
    } catch (e) { setError((e as Error).message); } finally { setAnalyzing(false); }
  };

  const save = async () => {
    if (!analysis) return;
    setSaving(true); setError('');
    try {
      await api.post('/corrections', {
        questionId: questionId || '', studentId: studentId || '', originalText: essay,
        aiResponse: analysis, finalScore, teacherModifiedComment: comment || undefined,
        isVerified: verified,
      });
      setSavedOk(true);
      setSaveMsg({ ok: true, text: '批改记录已保存入库，可在「班级管理 → 班级学情报告」中查看。' });
    } catch (e) { setSaveMsg({ ok: false, text: (e as Error).message }); } finally { setSaving(false); }
  };

  const exportReport = async () => {
    if (!analysis) return;
    if (!studentId) { setError('请先在左侧“学生信息”中选择学生，导出报告将包含学生姓名'); return; }
    setExporting(true); setError('');
    try {
      const stu = students.find((s) => s.id === studentId);
      const klass = classes.find((k) => k.id === classId);
      const qTitle = currentQuestion?.title || (!questionId && questionText.trim() ? (questionText.trim().split('\n')[0] || '').slice(0, 30) : '');
      const pigai = analysis.pigai;
      const est = pigai?.estimate;
      const dims = pigai?.dimensions || [];
      const markCount = (pigai?.marks || []).length;
      const strengths = dims.flatMap((d) => d.strengths).slice(0, 3).join('\n');
      const lines = [
        '议论文批改学情报告（批改1.0）',
        '====================',
        `班级：${klass?.name || ''}（${klass?.gradeLevel || ''}）`,
        `学生：${stu?.name || ''}（学号 ${stu?.studentNo || ''}）`,
        `题目：${qTitle || '（未关联题库，自由批改）'}`,
        est ? `AI 估分：${est.main} / 60（区间 ${est.range}）` : `AI 参考得分：${analysis.scoring.finalScore} / 60（${analysis.scoring.grade}）`,
        `教师最终得分：${finalScore} / 60`,
        `复核状态：${verified ? '已复核通过' : '待复核'}`,
        '',
        `全文三色标注：${markCount} 处（红=错字/病句、蓝=逻辑错误、黄=引用待核）`,
        strengths ? `四维亮点摘录：\n${strengths}` : '四维亮点摘录：—',
        '',
        `导出时间：${new Date().toLocaleString('zh-CN')}`,
        '（本报告由“议论文智批系统·批改1.0”生成，仅作教学参考）',
      ].join('\n');
      try {
        await navigator.clipboard.writeText(lines);
        setNotice('学情报告已复制到剪贴板，可直接粘贴到文档 / PPT');
      } catch {
        const blob = new Blob(['\ufeff' + lines], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `学情报告_${stu?.name || '未命名'}_${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        setNotice('学情报告已下载为文本文件（也可点击“一键导出”复制）');
      }
      window.setTimeout(() => setNotice(''), 4000);
    } finally { setExporting(false); }
  };


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">批改工作台</h1>
          <p className="text-sm text-slate-500 mt-0.5">粘贴学生作文 → AI 批改（批改1.0：估分 / 三色标注全文 / 四维诊断）→ 教师终审修改后入库</p>
        </div>


      {saveMsg && (
        <Modal open onClose={() => setSaveMsg(null)} title={saveMsg.ok ? '保存成功' : '保存失败'}>
          <div className="text-sm">
            <p className={saveMsg.ok ? 'text-emerald-700' : 'text-red-600'}>{saveMsg.ok ? '✓ ' : '✗ '}{saveMsg.text}</p>
            <p className="text-xs text-slate-400 mt-2">批改结果仍保留，可继续点击「一键导出学情报告」或修改后再次保存。</p>
            <div className="flex justify-end mt-4"><button className="btn-primary text-xs" onClick={() => setSaveMsg(null)}>知道了</button></div>
          </div>
        </Modal>
      )}
      </div>

      <div className="space-y-4">
        {/* 左栏：输入 */}
        <div className="space-y-3">
          <Card title={<>学生信息 <span className="text-xs font-normal text-slate-400">（可不选，仅用于入库关联）</span></>}>
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">选择班级</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">选择学生</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </Card>
                    <Card title="题目信息（可留空自由批改）">
            <div className="mb-3">
              <ModeTabs options={[['text', '文字输入'], ['image', '图片导入']]} value={qMode} onChange={setQMode} />
            </div>
            <div className="space-y-2">
              <select className="input" value={questionId} onChange={(e) => setQuestionId(e.target.value)}>
                <option value="">— 从“我的题库”选择题目 —</option>
                {questions.map((q) => <option key={q.id} value={q.id}>{q.title}{q.published ? '' : '（草稿）'}</option>)}
              </select>
              {currentQuestion && <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5 leading-5">{currentQuestion.materialText}</div>}
            </div>
            {qMode === 'text' && (
              <div className="space-y-2 mt-3">
                <ModeTabs size="sm" options={[['paste', '文本粘贴', <ClipboardPaste className="w-3.5 h-3.5" />], ['voice', '语音输入', <Mic className="w-3.5 h-3.5" />]]} value={qSub} onChange={setQSub} />
                {qSub === 'voice' ? (
                  <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400">
                    <VoiceButton onText={(t) => setQuestionText((p) => (p ? p + '\n' + t : t))} />
                    <span>口述题目内容，将自动写入下方输入框</span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">手动输入题目文字 / 题干材料（不关联题库时供 AI 批改参考，可留空自由批改）</p>
                )}
                <textarea className="input min-h-[84px]" placeholder="输入 / 粘贴题目文字或题干材料…（可留空）" value={questionText} onChange={(e) => setQuestionText(e.target.value)} />
              </div>
            )}
            {qMode === 'image' && (
              <div className="space-y-2 mt-3">
                <OcrPanel image={qImg} setImage={setQImg} busy={qOcr} setBusy={setQOcr} onResult={(t) => setQuestionText((p) => (p ? p + '\n' + t : t))} onError={setError} />
                <textarea className="input min-h-[84px]" placeholder="识别出的题目文字将显示在这里，可修改后使用" value={questionText} onChange={(e) => setQuestionText(e.target.value)} />
              </div>
            )}
          </Card>

                    <Card title="作文正文" bodyClassName="p-0">
            <div className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap border-b border-slate-100">
              <ModeTabs size="sm" options={[['text', '文字输入'], ['image', '图片导入']]} value={eMode} onChange={setEMode} />
              <div className="flex items-center gap-2 flex-wrap">
                <button className="btn-outline text-xs" onClick={loadSample}><FileText className="w-3.5 h-3.5" /> 载入示例作文</button>
              </div>
            </div>
            {eMode === 'text' ? (
              <>
                <div className="px-4 pt-3 flex items-center gap-2 flex-wrap">
                  <ModeTabs size="sm" options={[['paste', '文本粘贴', <ClipboardPaste className="w-3.5 h-3.5" />], ['voice', '语音输入', <Mic className="w-3.5 h-3.5" />]]} value={eSub} onChange={setESub} />
                  {eSub === 'voice' ? (
                    <span className="text-xs text-slate-400 flex items-center gap-2"><VoiceButton onText={(t) => setEssay((p) => (p ? p + '\n' + t : t))} /> 口述作文内容，将自动写入正文</span>
                  ) : (
                    <span className="text-xs text-slate-400">直接在下方粘贴学生作文正文</span>
                  )}
                </div>
                <textarea className="w-full min-h-[300px] p-4 text-sm leading-6 focus:outline-none resize-y bg-transparent" placeholder={'在此粘贴学生作文正文，或切换“语音输入”口述转文字…'} value={essay} onChange={(e) => setEssay(e.target.value)} />
              </>
            ) : (
              <div className="p-4 space-y-2">
                <OcrPanel image={eImg} setImage={setEImg} busy={eOcr} setBusy={setEOcr} onResult={(t) => setEssay((p) => (p ? p + '\n' + t : t))} onError={setError} />
                <textarea className="input min-h-[240px]" placeholder="识别出的作文正文将显示在这里，可修改后点击 AI 批改…" value={essay} onChange={(e) => setEssay(e.target.value)} />
              </div>
            )}
            <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">{essay.length} 字（含标点）</div>
          </Card>
        </div>

        {/* 右栏：批改结果 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-base font-bold text-slate-800">批改结果</h2>
            <button className="btn-primary text-sm" onClick={runAnalysis} disabled={analyzing || !essay.trim()}>
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              {analyzing ? 'AI 批改中…' : 'AI 批改'}
            </button>
          </div>
          {!analysis ? (
            <Card bodyClassName="min-h-[420px]">
              <Empty text="等待批改…" hint="在左侧录入题目与作文（文字 / 语音 / 图片导入均可），点击右上角「AI 批改」。参考得分已并入报告①估分；流程：AI批改 → 批改1.0 报告（估分 / 三色标注全文 / 四维诊断）→ 教师终审。" />
            </Card>
          ) : (
            <>
              {/* 批改1.0 报告 */}
              {analysis.pigai ? (
                <Card title="批改1.0 报告（估分 → 三色标注全文 → 四维诊断）">
                  {/* ① 估分 */}
                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="text-xs font-semibold text-slate-500 mb-3">① 估分</p>
                    <div className="flex items-start gap-5 flex-wrap">
                      <div className="text-center">
                        <p className="text-5xl font-bold text-brand-700">{analysis.pigai.estimate.main}</p>
                        <p className="text-xs text-slate-400 mt-1">满分 60 · {analysis.scoring.grade}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-3 flex-1 min-w-[240px] text-center">
                        <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-500">内容（20）</p><p className="text-xl font-bold text-slate-800 mt-0.5">{analysis.pigai.estimate.blocks.content}</p></div>
                        <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-500">表达（20）</p><p className="text-xl font-bold text-slate-800 mt-0.5">{analysis.pigai.estimate.blocks.expression}</p></div>
                        <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-500">发展（20）</p><p className="text-xl font-bold text-slate-800 mt-0.5">{analysis.pigai.estimate.blocks.development}</p></div>
                      </div>
                      <div className="space-y-1.5 text-xs text-slate-500">
                        <div><Badge tone="blue">区间：{analysis.pigai.estimate.range}</Badge></div>
                      </div>
                    </div>
                    {metrics?.lengthInfo && metrics.lengthInfo.penalty > 0 && (
                      <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3">
                        ⚠ 字数扣分：全文约 {metrics.lengthInfo.count} 字，少于 800 字（缺 {metrics.lengthInfo.shortage} 字），已按规则额外扣 {metrics.lengthInfo.penalty} 分并计入主估。
                      </p>
                    )}
                    {(analysis.pigai.estimate.floorReasons.length > 0 || analysis.pigai.estimate.nextBandGaps.length > 0) && (
                      <div className="grid md:grid-cols-2 gap-3 mt-4">
                        <div className="rounded-lg bg-emerald-50/60 border border-emerald-200 p-3">
                          <p className="text-xs font-medium text-emerald-700 mb-1.5">✅ 守得住当前区间</p>
                          <ul className="space-y-1 text-sm text-slate-700 leading-6">
                            {analysis.pigai.estimate.floorReasons.map((r, i) => <li key={i}>· {r}</li>)}
                          </ul>
                        </div>
                        <div className="rounded-lg bg-amber-50/60 border border-amber-200 p-3">
                          <p className="text-xs font-medium text-amber-700 mb-1.5">📈 不足以进入上一区间</p>
                          <ul className="space-y-1 text-sm text-slate-700 leading-6">
                            {analysis.pigai.estimate.nextBandGaps.map((r, i) => <li key={i}>· {r}</li>)}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ② 作文全文三色标注 */}
                  <div className="rounded-xl border border-slate-200 p-4 mt-3">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                      <p className="text-xs font-semibold text-slate-500">② 作文全文（三色标注版）</p>
                      <PigaiLegend />
                    </div>
                    <ColoredEssay text={essay} marks={analysis.pigai.marks} />
                    {analysis.pigai.marks.length === 0 && <p className="text-xs text-slate-400 mt-2">未发现需标红的错字/病句、逻辑错误或待核引用。</p>}
                    {analysis.pigai.marks.length > 0 && (
                      <div className="border-t border-slate-100 pt-2 mt-2">
                        <p className="text-xs font-medium text-slate-500 mb-1.5">标注说明（{analysis.pigai.marks.length} 处）：</p>
                        <ul className="space-y-1.5">
                          {analysis.pigai.marks.map((m, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs leading-5">
                              <span className={'inline-block w-2.5 h-2.5 rounded-full mt-1 shrink-0 ' + (m.color === 'red' ? 'bg-red-500' : m.color === 'blue' ? 'bg-blue-500' : 'bg-yellow-500')} />
                              <span className="text-slate-400 shrink-0">第 {m.paragraph} 段·{MARK_COLOR_LABEL[m.color]}</span>
                              <span className="text-slate-500 line-through decoration-slate-400 shrink-0 max-w-[220px] truncate">{m.original}</span>
                              <span className="text-slate-600">{m.note}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* ③ 四维优点与不足 */}
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-slate-500 mb-2">③ 四维优点与不足</p>
                    <div className="grid md:grid-cols-2 gap-3">
                      {analysis.pigai.dimensions.map((d, i) => (
                        <div key={i} className="rounded-xl border border-slate-200 p-3">
                          <p className="text-sm font-semibold text-slate-800 mb-2">{d.name}</p>
                          <div className="space-y-1.5 text-xs leading-5">
                            {(d.strengths.length ? d.strengths : ['（暂无亮点摘录）']).map((s, j) => (
                              <p key={'s' + j} className="text-emerald-700 flex gap-1.5"><span className="shrink-0">✅</span><span>{s}</span></p>
                            ))}
                            {(d.weaknesses.length ? d.weaknesses : ['（暂无不足提示）']).map((s, j) => (
                              <p key={'w' + j} className="text-amber-700 flex gap-1.5"><span className="shrink-0">⚠</span><span>{s}</span></p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              ) : (
                <Card title="批改1.0 报告">
                  <p className="text-sm text-slate-400 leading-6">该分析为旧版数据，未包含批改1.0 报告。请点击右上角「AI 批改」重新生成。</p>
                </Card>
              )}

              {/* 教师终审 */}
              <Card title="教师终审">
                <div className="space-y-3">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-600 font-medium">最终得分（满分 60）：</span>
                      <input type="number" min={0} max={60} className="input !w-24" value={finalScore} onChange={(e) => setFinalScore(Number(e.target.value))} />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                      <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="rounded" />
                      复核通过
                    </label>
                    <span className="text-xs text-slate-400">默认取批改1.0 主估分，可修改后保存</span>
                  </div>
                  <textarea className="input min-h-[90px] leading-6" placeholder="教师总评语（可编辑，将随记录一起保存；留空则导出时取报告四维亮点）" value={comment} onChange={(e) => setComment(e.target.value)} />
                  <div className="flex gap-2 flex-wrap pt-1">
                    <button className="btn-primary" onClick={save} disabled={saving || savedOk}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : savedOk ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                      {savedOk ? '已保存' : '保存记录'}
                    </button>
                    <button className="btn-outline" onClick={exportReport} disabled={exporting}>
                      {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      一键导出学情报告
                    </button>
                  </div>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ModeTabs<T extends string>({ options, value, onChange, size = 'md' }: { options: [T, string, React.ReactNode?][]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map(([v, label, icon]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`rounded-lg border font-medium ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'} ${value === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
          <span className="inline-flex items-center gap-1">{icon}{label}</span>
        </button>
      ))}
    </div>
  );
}

function OcrPanel({ image, setImage, busy, setBusy, onResult, onError }: {
  image: string; setImage: (v: string) => void; busy: boolean; setBusy: (v: boolean) => void;
  onResult: (text: string) => void; onError: (msg: string) => void;
}) {
  const upRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const readFile = async (file?: File | null) => {
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error('读取图片失败'));
      fr.readAsDataURL(file);
    });
    setImage(dataUrl);
    setBusy(true);
    try {
      const r = await api.post<{ text: string }>('/ocr', { image: dataUrl });
      if (r.text.trim()) onResult(r.text.trim());
      else onError('未从图片中识别到文字，请换一张更清晰的图片');
    } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 flex-wrap">
        <button type="button" onClick={() => upRef.current?.click()} className="btn-outline text-xs"><ImagePlus className="w-3.5 h-3.5" /> 选择图片上传</button>
        <button type="button" onClick={() => camRef.current?.click()} className="btn-outline text-xs"><Camera className="w-3.5 h-3.5" /> 拍照上传</button>
      </div>
      <input ref={upRef} type="file" accept="image/*" className="hidden" onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
      {image && (
        <div className="flex gap-3 items-start">
          <img src={image} alt="待识别图片" className="max-h-32 rounded-lg border border-slate-200" />
          <div className="text-xs text-slate-500 space-y-1.5">
            {busy ? <p className="flex items-center gap-1 text-brand-600"><Loader2 className="w-3.5 h-3.5 animate-spin" /> 正在识别图片文字…</p> : <p>已选图片，识别文字见下方输入框（可修改）。</p>}
          </div>
        </div>
      )}
      {!image && <p className="text-xs text-slate-400">支持 JPG / PNG / WebP，选择后将自动识别图片中的中文文字并填入下方输入框。</p>}
    </div>
  );
}

function VoiceButton({ onText }: { onText: (t: string) => void }) {
  const [listening, setListening] = useState(false);
  const supported = typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const recRef = useRef<any>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  if (!supported) {
    return (
      <button className="btn-outline text-xs opacity-60" title="当前浏览器不支持 Web Speech API，建议使用 Chrome/Edge">
        <MicOff className="w-3.5 h-3.5" /> 语音输入
      </button>
    );
  }
  const toggle = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!listening) {
      const rec = new SR();
      rec.lang = 'zh-CN'; rec.continuous = true; rec.interimResults = true;
      rec.onresult = (e: any) => {
        let text = '';
        for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript;
        onTextRef.current(text);
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      rec.start();
      recRef.current = rec;
      setListening(true);
    } else {
      recRef.current?.stop();
      setListening(false);
    }
  };
  return (
    <button onClick={toggle} className={listening ? 'btn bg-red-600 text-white text-xs' : 'btn-outline text-xs'}>
      {listening ? <Mic className="w-3.5 h-3.5 animate-pulse" /> : <Mic className="w-3.5 h-3.5" />}
      {listening ? '停止录音' : '语音输入'}
    </button>
  );
}

