import { Router } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { authRequired, ah } from '../middleware/auth.ts';

const router = Router();
router.use(authRequired);

const PS1 = fileURLToPath(new URL('../scripts/ocr.ps1', import.meta.url));

function runOcr(imagePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ps = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
    const args = process.platform === 'win32'
      ? ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-ImagePath', imagePath]
      : ['-NoProfile', '-File', PS1, '-ImagePath', imagePath];
    const child = spawn(ps, args, { windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('图片识别超时，请稍后重试')); }, 30000);
    child.stdout.on('data', (d) => { out += String(d); });
    child.stderr.on('data', (d) => { err += String(d); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) return resolve(out.trim());
      if (out.includes('__NO_OCR_ENGINE__')) return reject(new Error('当前系统缺少可用的 OCR 中文识别引擎'));
      reject(new Error((err || out || `图片识别失败(${code})`).slice(0, 300)));
    });
  });
}

// 图片 OCR（文字识别）：接收 base64/dataURL 图片，返回识别文本
router.post('/', ah(async (req, res) => {
  const b = (req.body || {}) as any;
  const raw = String(b.image || '');
  const m = /^data:image\/(png|jpe?g|webp|bmp);base64,(.+)$/i.exec(raw);
  const b64 = m ? m[2] : raw;
  if (!b64) return void res.status(400).json({ error: '缺少图片数据' });
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) return void res.status(400).json({ error: '图片数据为空' });
  if (buf.length > 10 * 1024 * 1024) return void res.status(400).json({ error: '图片过大（上限 10MB）' });
  const ext = m ? (m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase()) : 'png';
  const tmp = path.join(os.tmpdir(), `ocr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
  fs.writeFileSync(tmp, buf);
  try {
    const text = await runOcr(tmp);
    res.json({ text });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}));

export default router;