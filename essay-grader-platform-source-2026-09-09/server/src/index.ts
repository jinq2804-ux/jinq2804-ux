import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.ts';
import authRoutes from './routes/auth.ts';
import questionRoutes from './routes/questions.ts';
import ocrRoutes from './routes/ocr.ts';
import correctionRoutes from './routes/corrections.ts';
import scaffoldRoutes from './routes/scaffold.ts';
import classRoutes from './routes/classes.ts';
import reportRoutes from './routes/reports.ts';
import studentRoutes from './routes/students.ts';
import materialRoutes from './routes/materials.ts';
import { collectMaterials } from './materials/collector.ts';

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true, service: 'essay-grader-platform', time: new Date().toISOString(),
    aiMode: config.aiMode, provider: config.deepseekApiKey ? (config.aiMode === 'mock' ? 'mock' : 'deepseek') : 'mock (未配置 DEEPSEEK_API_KEY)',
    storage: 'json-file (可切换 PostgreSQL，见 db/schema.sql)',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/ocr', ocrRoutes);
app.use('/api/corrections', correctionRoutes);
app.use('/api/scaffold', scaffoldRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/materials', materialRoutes);

// 生产模式：托管前端构建产物
const dist = config.clientDist;
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// 404 & 错误处理
app.use((_req, res) => res.status(404).json({ error: '接口不存在' }));
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[error]', err);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

app.listen(config.port, () => {
  console.log(`\n  议论文智能批改系统 API 已启动: http://localhost:${config.port}`);
  console.log(`  AI 提供方: ${config.deepseekApiKey ? (config.aiMode === 'mock' ? '演示模式(mock)' : 'DeepSeek') : '演示模式(mock)（设置 DEEPSEEK_API_KEY 后自动切换真实模型）'}`);
  console.log(`  数据文件: ${config.dataFile}\n`);
  // 素材自动采集（人民网等公开 RSS）：启动后延时采集一次，此后每 6 小时一次；结果默认进入“待审核”
  const COLLECT_MS = Math.max(60 * 60 * 1000, Number(process.env.MATERIAL_COLLECT_INTERVAL_MS || 6 * 60 * 60 * 1000));
  setTimeout(() => { collectMaterials().then((s) => console.log('[materials] 首次自动采集完成，新增', s.lastAdded, '待审核')).catch(() => undefined); }, 15 * 1000);
  setInterval(() => { collectMaterials().then((s) => console.log('[materials] 定时采集完成，新增', s.lastAdded, '待审核')).catch(() => undefined); }, COLLECT_MS);
});

