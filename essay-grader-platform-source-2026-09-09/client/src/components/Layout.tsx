import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileQuestion, PenTool, Lightbulb, Library, LogOut, GraduationCap, ChevronDown,
} from 'lucide-react';
import { getSessionUser, clearSession } from '../api';
import type { User } from '../types';

interface NavChild { to: string; label: string; }
interface NavItem { to?: string; key?: string; label: string; icon: React.ElementType; end?: boolean; children?: NavChild[]; }

const NAV: NavItem[] = [
  { to: '/', label: '工作台总览', icon: LayoutDashboard, end: true },
  {
    key: 'classes', label: '班级管理', icon: Users,
    children: [
      { to: '/classes', label: '班级与学生' },
      { to: '/report', label: '班级学情报告' },
      { to: '/students', label: '错题本与个性化' },
    ],
  },
  { to: '/questions', label: '智能出题中心', icon: FileQuestion },
  { to: '/grading', label: '批改工作台', icon: PenTool },
  { to: '/scaffold', label: '写作框架辅助', icon: Lightbulb },
  { to: '/materials', label: '素材库', icon: Library },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getSessionUser<User>();
  const logout = () => { clearSession(); navigate('/login'); };

  const classChildren = NAV.find((n) => n.key === 'classes')?.children || [];
  const classActive = classChildren.some((c) => location.pathname.startsWith(c.to));
  const [openClasses, setOpenClasses] = useState(classActive);
  const effectiveOpen = openClasses || classActive;

  return (
    <div className="flex h-full">
      <aside className="w-60 shrink-0 bg-slate-900 text-slate-200 flex flex-col">
        <div className="flex items-center gap-2 px-4 h-16 border-b border-slate-700/60">
          <GraduationCap className="w-6 h-6 text-brand-300" />
          <div>
            <p className="text-sm font-semibold text-white leading-tight">议论文智批系统</p>
            <p className="text-[10px] text-slate-400">Essay Grader Platform</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV.map((item) => {
            if (item.children) {
              return (
                <div key={item.key}>
                  <div className={`flex items-center rounded-lg ${classActive ? 'bg-slate-800 text-white' : ''}`}>
                    <button onClick={() => navigate('/classes')}
                      className={`flex items-center gap-2.5 flex-1 px-3 py-2 text-sm text-left transition-colors ${classActive ? 'text-white' : 'text-slate-300 hover:text-white'}`}>
                      <item.icon className="w-4 h-4" /> {item.label}
                    </button>
                    <button onClick={() => setOpenClasses(!openClasses)}
                      className="px-2 py-2 text-slate-400 hover:text-white" title={effectiveOpen ? '收起' : '展开'}>
                      <ChevronDown className={`w-4 h-4 transition-transform ${effectiveOpen ? '' : '-rotate-90'}`} />
                    </button>
                  </div>
                  {effectiveOpen && (
                    <div className="mt-0.5 mb-1 ml-4 pl-3 border-l border-slate-700/60 space-y-0.5">
                      {item.children.map((c) => (
                        <NavLink key={c.to} to={c.to}
                          className={({ isActive }) => `block rounded-lg px-3 py-1.5 text-sm transition-colors ${isActive ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                          {c.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <NavLink key={item.to} to={item.to!} end={item.end}
                className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>
                <item.icon className="w-4 h-4" /> {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-700/60">
          <div className="flex items-center gap-2 px-1 mb-2">
            <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-sm font-semibold">{user?.name?.[0] || '师'}</div>
            <div className="min-w-0">
              <p className="text-sm text-white truncate">{user?.name || '教师'}</p>
              <p className="text-[10px] text-slate-400">{user?.role === 'admin' ? '管理员' : '教师'} · {user?.email || ''}</p>
            </div>
          </div>
          <button onClick={logout} className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white">
            <LogOut className="w-4 h-4" /> 退出登录
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto p-5">{children}</div>
      </main>
    </div>
  );
}
