import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Loader2 } from 'lucide-react';
import { api, setSession } from '../api';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('teacher@demo.com');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

const submit = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);
  setError('');
  try {
    if (mode === 'login') {
      const res = await api.post<{ token: string; user: unknown }>('/auth/login', { email, password });
      setSession(res.token, res.user);
      navigate('/');
    } else {
      setError("演示版暂不支持注册");
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : "请求失败");
  } finally {
    setLoading(false);
  }
};

  const fill = (mail: string, pwd: string) => { setEmail(mail); setPassword(pwd); setMode('login'); };

  return (
    <div className="min-h-full flex items-center justify-center bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-700 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 text-white">
          <GraduationCap className="w-12 h-12 mx-auto mb-2" />
          <h1 className="text-2xl font-bold">议论文智能批改与教学辅助系统</h1>
          <p className="text-brand-100 text-sm mt-1">AI 初筛与标注 · 教师终审与决策</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-6">
          <div className="flex rounded-lg bg-slate-100 p-1 mb-5">
            {(['login', 'register'] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setError(''); }}
                className={`flex-1 py-2 text-sm rounded-md font-medium transition-colors ${mode === m ? 'bg-white shadow text-brand-700' : 'text-slate-500'}`}>
                {m === 'login' ? '登录' : '注册'}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-3">
            {mode === 'register' && (
              <div>
                <label className="label">姓名</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="请输入姓名" required />
              </div>
            )}
            <div>
              <label className="label">邮箱</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.com" required />
            </div>
            <div>
              <label className="label">密码</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? '至少 6 位' : '请输入密码'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="btn-primary w-full py-2.5" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'login' ? '登 录' : '注册并登录'}
            </button>
          </form>
          <div className="mt-5 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-400 mb-2">演示账号（点击快速填入）：</p>
            <div className="flex gap-2">
              <button onClick={() => fill('teacher@demo.com', '123456')} className="flex-1 text-xs rounded-lg border border-slate-200 px-2 py-1.5 hover:bg-slate-50">教师 · 王老师</button>
              <button onClick={() => fill('admin@demo.com', '123456')} className="flex-1 text-xs rounded-lg border border-slate-200 px-2 py-1.5 hover:bg-slate-50">管理员</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
