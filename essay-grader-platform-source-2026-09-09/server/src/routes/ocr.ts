import { createHmac, createHash } from 'node:crypto';
import { Router } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { authRequired, ah } from '../middleware/auth.ts';
import { config } from '../config.ts';

const router = Router();
router.use(authRequired);

const PS1 = fileURLToPath(new URL('../scripts/ocr.ps1', import.meta.url));
const ENDPOINT = 'ocr.tencentcloudapi.com';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function parseImage(raw: unknown): { b64: string; ext: string } {
  const source = String(raw || '');
  const match = /^data:image\/(png|jpe?g|webp|bmp);base64,(.+)$/i.exec(source);
  const b64 = match ? match[2] : source;
  if (!b64) throw new Error('缺少图片数据');
  const bytes = Buffer.from(b64, 'base64');
  if (!bytes.length) throw new Error('图片数据为空');
  if (bytes.length > 7 * 1024 * 1024) throw new Error('单张图片过大（上限 7MB）');
  return { b64, ext: match ? (match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase()) : 'png' };
}

async function tencentHandwritingOcr(b64: string): Promise<string> {
  if (!config.tencentSecretId || !config.tencentSecretKey) {
    throw new Error('答题卡识别尚未配置腾讯云 OCR：请在 Render 设置 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY');
  }
  const payload = JSON.stringify({ ImageBase64: b64, Scene: 'only_hw', EnableWordPolygon: false });
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const contentType = 'application/json; charset=utf-8';
  const canonicalHeaders = `content-type:${contentType}\nhost:${ENDPOINT}\n`;
  const signedHeaders = 'content-type;host';
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, sha256(payload)].join('\n');
  const credentialScope = `${date}/ocr/tc3_request`;
  const stringToSign = ['TC3-HMAC-SHA256', timestamp, credentialScope, sha256(canonicalRequest)].join('\n');
  const secretDate = hmac(`TC3${config.tencentSecretKey}`, date);
  const secretService = hmac(secretDate, 'ocr');
  const secretSigning = hmac(secretService, 'tc3_request');
  const signature = createHmac('sha256', secretSigning).update(stringToSign).digest('hex');
  const authorization = `TC3-HMAC-SHA256 Credential=${config.tencentSecretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const response = await fetch(`https://${ENDPOINT}`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': contentType,
      Host: ENDPOINT,
      'X-TC-Action': 'GeneralHandwritingOCR',
      'X-TC-Version': '2018-11-19',
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Region': config.tencentRegion,
    },
    body: payload,
    signal: AbortSignal.timeout(45_000),
  });
  const json = await response.json() as any;
  if (!response.ok || json.Response?.Error) {
    const error = json.Response?.Error;
    throw new Error(`腾讯云 OCR 失败：${error?.Message || response.statusText || response.status}`);
  }
  const detections = Array.isArray(json.Response?.TextDetections) ? json.Response.TextDetections : [];
  return detections.map((item: any) => String(item.DetectedText || '').trim()).filter(Boolean).join('\n');
}

function windowsOcr(imagePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ps = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
    const args = process.platform === 'win32'
      ? ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-ImagePath', imagePath]
      : ['-NoProfile', '-File', PS1, '-ImagePath', imagePath];
    const child = spawn(ps, args, { windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('图片识别超时，请稍后重试')); }, 30_000);
    child.stdout.on('data', (data) => { out += String(data); });
    child.stderr.on('data', (data) => { err += String(data); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) return resolve(out.trim());
      reject(new Error((err || out || `图片识别失败(${code})`).slice(0, 300)));
    });
  });
}

async function recognize(image: { b64: string; ext: string }): Promise<{ text: string; provider: string }> {
  const useTencent = config.ocrProvider === 'tencent'
    || (config.ocrProvider === 'auto' && Boolean(config.tencentSecretId && config.tencentSecretKey));
  if (useTencent) return { text: await tencentHandwritingOcr(image.b64), provider: 'tencent-handwriting' };
  if (config.ocrProvider !== 'tencent' && process.platform === 'win32') {
    const tmp = path.join(os.tmpdir(), `ocr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${image.ext}`);
    fs.writeFileSync(tmp, Buffer.from(image.b64, 'base64'));
    try {
      return { text: await windowsOcr(tmp), provider: 'windows-media-ocr' };
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
  throw new Error('当前服务器未配置手写 OCR。Render 部署请设置 OCR_PROVIDER=tencent 及腾讯云密钥');
}

// 普通图片或答题卡分区 OCR。答题卡由前端按左、中、右三栏裁切后依次提交。
router.post('/', ah(async (req, res) => {
  const body = (req.body || {}) as any;
  const sources = Array.isArray(body.images) && body.images.length ? body.images : [body.image];
  if (sources.length > 3) return void res.status(400).json({ error: '一次最多识别答题卡的三个作文区域' });
  const regions: string[] = [];
  let provider = '';
  for (const source of sources) {
    const result = await recognize(parseImage(source));
    provider = result.provider;
    regions.push(result.text.trim());
  }
  const text = regions.filter(Boolean).join('\n');
  res.json({ text, regions, provider, mode: sources.length > 1 ? 'answer-sheet' : 'single-image' });
}));

export default router;
