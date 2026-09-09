// 临时 UI 验证脚本：通过 CDP 驱动 Edge headless 登录并检查工作台渲染
import fs from 'node:fs';

const HOST = 'http://localhost:4000';
const CDP = 'http://127.0.0.1:' + (process.env.CDP_PORT || 9222);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const version = await fetch(`${CDP}/json/version`).then((r) => r.json());
  const target = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: `${HOST}/login` });
  await sleep(2500);

  const loginExpr = `(async () => {
    const r = await fetch('${HOST}/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'teacher@demo.com', password: '123456' }) });
    const d = await r.json();
    if (!d.token) return 'LOGIN_FAIL:' + JSON.stringify(d);
    localStorage.setItem('eg_token', d.token);
    localStorage.setItem('eg_user', JSON.stringify(d.user));
    location.href = '${HOST}/';
    return 'OK:' + d.user.name;
  })()`;
  const loginRes = await send('Runtime.evaluate', { expression: loginExpr, awaitPromise: true, returnByValue: true });
  console.log('login eval:', loginRes.result?.result?.value ?? JSON.stringify(loginRes));

  await sleep(4500);
  const txtRes = await send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
  const text = txtRes.result?.result?.value || '';
    const checks = ['工作台总览', '班级管理', '智能出题中心', '批改工作台', '写作框架辅助', '素材库', '退出登录'];
  const forbidden = ['作文查重', '批改历史', '写作支架生成器'];
  for (const c of checks) console.log(`dashboard contains「${c}」:`, text.includes(c));
  for (const c of forbidden) console.log(`dashboard NOT contains「${c}」:`, !text.includes(c));

  // 展开 班级管理 子功能并检查
  await send('Runtime.evaluate', { expression: `location.href='${HOST}/report'`, returnByValue: true });
  await sleep(3000);
  const txt2 = await send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true });
  const text2 = txt2.result?.result?.value || '';
  for (const c of ['班级与学生', '班级学情报告', '错题本与个性化']) console.log(`submenu contains「${c}」:`, text2.includes(c));
  for (const c of checks) console.log(`dashboard contains「${c}」:`, text.includes(c));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const out = 'D:/Backup/Documents/ChatGPT/New project/docs/screenshots/dashboard.png';
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log('screenshot ->', out);

  await send('Browser.close').catch(() => undefined);
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });



