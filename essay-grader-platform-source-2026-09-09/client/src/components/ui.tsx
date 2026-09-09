import React, { useEffect } from 'react';
import { Loader2, X } from 'lucide-react';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
      <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
      <span>{label || '加载中…'}</span>
    </div>
  );
}

export function Empty({ text = '暂无数据', hint }: { text?: string; hint?: string }) {
  return (
    <div className="text-center py-10 text-slate-400">
      <p className="text-sm">{text}</p>
      {hint && <p className="text-xs mt-1">{hint}</p>}
    </div>
  );
}

export function Card({ title, extra, children, className, bodyClassName }: {
  title?: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string;
}) {
  return (
    <div className={cx('card', className)}>
      {(title || extra) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {extra}
        </div>
      )}
      <div className={cx('p-4', bodyClassName)}>{children}</div>
    </div>
  );
}

export function Badge({ tone = 'gray', children }: { tone?: 'gray' | 'green' | 'red' | 'amber' | 'blue' | 'purple'; children: React.ReactNode }) {
  const map = {
    gray: 'bg-slate-100 text-slate-600', green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-brand-50 text-brand-700', purple: 'bg-violet-50 text-violet-700',
  };
  return <span className={cx('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', map[tone])}>{children}</span>;
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'success' | 'warn' | 'error'; children: React.ReactNode }) {
  const map = {
    info: 'bg-brand-50 text-brand-800 border-brand-200',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    warn: 'bg-amber-50 text-amber-800 border-amber-200',
    error: 'bg-red-50 text-red-800 border-red-200',
  };
  return <div className={cx('rounded-lg border px-3 py-2 text-sm', map[tone])}>{children}</div>;
}

export function Modal({ open, onClose, title, children, width = 'max-w-2xl' }: {
  open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 overflow-y-auto" onClick={onClose}>
      <div className={cx('bg-white rounded-2xl shadow-xl mt-8 w-full', width)} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cx('text-2xl font-bold mt-1', tone || 'text-slate-800')}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export const VERDICT_TONE: Record<string, 'green' | 'red' | 'amber'> = { 正确: 'green', 有误: 'red', 存疑: 'amber' };
export const CONF_TONE: Record<string, 'green' | 'amber' | 'gray'> = { 高: 'green', 中: 'amber', 低: 'gray' };
