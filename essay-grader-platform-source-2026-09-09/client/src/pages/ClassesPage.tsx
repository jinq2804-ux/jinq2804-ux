import React, { useEffect, useState } from 'react';
import { Plus, Users, Trash2, Upload, X } from 'lucide-react';
import { api, fmtDate } from '../api';
import type { ClassRoom, Student } from '../types';
import { Card, Badge, Spinner, Empty, Modal, Alert } from '../components/ui';

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('高一');
  const [active, setActive] = useState<ClassRoom | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [newName, setNewName] = useState('');
  const [newNo, setNewNo] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');

  const load = async () => {
    try {
      const r = await api.get<{ classes: ClassRoom[] }>('/classes');
      setClasses(r.classes);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const loadStudents = async (c: ClassRoom) => {
    setActive(c);
    const r = await api.get<{ students: Student[] }>(`/classes/${c.id}/students`);
    setStudents(r.students);
  };

  const saveClass = async () => {
    setError('');
    try {
      if (editId) await api.put(`/classes/${editId}`, { name, gradeLevel });
      else await api.post('/classes', { name, gradeLevel });
      setCreateOpen(false); setEditId(null); setName(''); await load();
    } catch (e) { setError((e as Error).message); }
  };

  const removeClass = async (c: ClassRoom) => {
    if (!window.confirm(`删除班级「${c.name}」及其全部学生？（批改记录保留）`)) return;
    await api.del(`/classes/${c.id}`);
    if (active?.id === c.id) setActive(null);
    await load();
  };

  const addStudent = async () => {
    if (!active || !newName.trim()) return;
    await api.post(`/classes/${active.id}/students`, { name: newName, studentNo: newNo });
    setNewName(''); setNewNo('');
    await loadStudents(active);
  };

  const doImport = async () => {
    if (!active) return;
    const r = await api.post<{ added: number; errors: string[]; total: number }>(`/classes/${active.id}/students/import`, { text: importText });
    setNotice(`导入成功 ${r.added} 人（班级现有 ${r.total} 人）`);
    setImportOpen(false); setImportText('');
    await loadStudents(active);
    window.setTimeout(() => setNotice(''), 3000);
  };

  const removeStudent = async (s: Student) => {
    if (!window.confirm(`确定删除学生「${s.name}」？`)) return;
    await api.del(`/students/${s.id}`);
    await loadStudents(active!);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">班级管理</h1>
          <p className="text-sm text-slate-500 mt-0.5">创建班级、批量导入学生名单、查看学生列表与学习概览</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditId(null); setName(''); setCreateOpen(true); }}><Plus className="w-4 h-4" /> 新建班级</button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {classes.map((c) => (
          <div key={c.id} className={`card p-4 cursor-pointer transition-shadow ${active?.id === c.id ? 'ring-2 ring-brand-400' : 'hover:shadow-md'}`} onClick={() => loadStudents(c)}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2"><Users className="w-4 h-4 text-brand-600" /><p className="font-semibold">{c.name}</p><Badge tone="blue">{c.gradeLevel}</Badge></div>
              <button onClick={(e) => { e.stopPropagation(); removeClass(c); }} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="flex gap-4 mt-3 text-xs text-slate-500">
              <span>学生 <b className="text-slate-800">{c.studentCount || 0}</b></span>
              <span>批改 <b className="text-slate-800">{c.correctionCount || 0}</b></span>
              <span>均分 <b className="text-brand-700">{c.avgScore || '—'}</b></span>
            </div>
          </div>
        ))}
      </div>

      {active && (
        <Card title={`${active.name} · 学生列表`}
          extra={<div className="flex gap-2">
            <button className="btn-outline text-xs" onClick={() => setImportOpen(true)}><Upload className="w-3.5 h-3.5" /> 批量导入</button>
          </div>}>
          <div className="flex gap-2 mb-3">
            <input className="input !w-40" placeholder="姓名" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <input className="input !w-32" placeholder="学号" value={newNo} onChange={(e) => setNewNo(e.target.value)} />
            <button className="btn-primary text-xs" onClick={addStudent}><Plus className="w-3.5 h-3.5" /> 添加学生</button>
          </div>
          {students.length === 0 ? <Empty text="还没有学生" hint="手动添加或批量导入（每行：姓名,学号）" /> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="py-2 font-medium">姓名</th><th className="py-2 font-medium">学号</th><th className="py-2 font-medium">平均分</th><th className="py-2 font-medium">批改次数</th><th className="py-2 font-medium">高频问题</th><th className="py-2 font-medium">加入时间</th><th></th>
              </tr></thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="py-2.5 font-medium text-slate-700">{s.name}</td>
                    <td className="py-2.5 text-slate-400">{s.studentNo || '—'}</td>
                    <td className="py-2.5 font-bold text-brand-700">{s.avgScore || '—'}</td>
                    <td className="py-2.5 text-slate-500">{s.correctionCount || 0}</td>
                    <td className="py-2.5">{s.tags?.length ? s.tags.slice(0, 3).map((t) => <Badge key={t} tone="red">{t}</Badge>) : <span className="text-xs text-slate-300">暂无</span>}</td>
                    <td className="py-2.5 text-xs text-slate-400">{fmtDate(s.createdAt)}</td>
                    <td className="py-2.5 text-right"><button onClick={() => removeStudent(s)} className="text-slate-300 hover:text-red-500"><X className="w-4 h-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={editId ? '编辑班级' : '新建班级'}>
        <div className="space-y-3">
          <div><label className="label">班级名称</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：高二(3)班" /></div>
          <div><label className="label">年级</label>
            <select className="input" value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)}>{['高一', '高二', '高三'].map((g) => <option key={g}>{g}</option>)}</select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-outline" onClick={() => setCreateOpen(false)}>取消</button>
            <button className="btn-primary" onClick={saveClass}>保存</button>
          </div>
        </div>
      </Modal>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="批量导入学生名单">
        <p className="text-xs text-slate-500 mb-2">每行一个学生：<code className="bg-slate-100 px-1 rounded">姓名,学号</code>（学号可省略），支持从 Excel 复制粘贴。</p>
        <textarea className="input min-h-[180px] font-mono text-xs" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={'李思远,2024001\n张明轩,2024002'} />
        <div className="flex justify-end gap-2 pt-3">
          <button className="btn-outline" onClick={() => setImportOpen(false)}>取消</button>
          <button className="btn-primary" onClick={doImport}>导入</button>
        </div>
      </Modal>
    </div>
  );
}
