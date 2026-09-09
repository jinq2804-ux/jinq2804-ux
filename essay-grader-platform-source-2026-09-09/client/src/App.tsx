import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { getSessionUser, getToken } from './api';
import type { User } from './types';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import QuestionCenterPage from './pages/QuestionCenterPage';
import GradingWorkbenchPage from './pages/GradingWorkbenchPage';
import ScaffoldPage from './pages/ScaffoldPage';
import ClassesPage from './pages/ClassesPage';
import ReportPage from './pages/ReportPage';
import StudentsPage from './pages/StudentsPage';
import MaterialsPage from './pages/MaterialsPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (getToken() && !getSessionUser()) {
      // token 存在但本地用户缺失时拉取一次
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${getToken()}` } })
        .then((r) => r.json())
        .then((d) => { if (d.user) localStorage.setItem('eg_user', JSON.stringify(d.user)); })
        .catch(() => undefined)
        .finally(() => setReady(true));
    } else setReady(true);
  }, []);
  if (!ready) return null;
  if (!getToken()) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="/questions" element={<RequireAuth><QuestionCenterPage /></RequireAuth>} />
      <Route path="/grading" element={<RequireAuth><GradingWorkbenchPage /></RequireAuth>} />
      <Route path="/scaffold" element={<RequireAuth><ScaffoldPage /></RequireAuth>} />
      <Route path="/classes" element={<RequireAuth><ClassesPage /></RequireAuth>} />
      <Route path="/report" element={<RequireAuth><ReportPage /></RequireAuth>} />
      <Route path="/students" element={<RequireAuth><StudentsPage /></RequireAuth>} />
      <Route path="/materials" element={<RequireAuth><MaterialsPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

