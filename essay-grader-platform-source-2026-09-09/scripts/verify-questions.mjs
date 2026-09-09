// 临时验证：出题中心三块结构 + 查找题库条件展开与搜索
import fs from 'node:fs';
const HOST = 'http://localhost:4000';
const CDP = 'http://127.0.0.1:' + (process.env.CDP_PORT || 9222);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const target = await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `${HOST}/login` }); await sleep(2200);

  const loginExpr = `(async()=>{const r=await fetch('${HOST}/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'teacher@demo.com',password:'123456'})});const d=await r.json();localStorage.setItem('eg_token',d.token);localStorage.setItem('eg_user',JSON.stringify(d.user));location.href='${HOST}/questions';return 'ok';})()`;
  await send('Runtime.evaluate', { expression: loginExpr, awaitPromise: true }); await sleep(3500);

  const grab = async () => (await send('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true })).result?.result?.value || '';
  const clickText = async (txt) => {
    const res = await send('Runtime.evaluate', { expression: `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().includes('${txt}'));if(b){b.click();return true;}return false;})()`, returnByValue: true });
    return res.result?.result?.value === true;
  };

  let text = await grab();
  for (const c of ['查找题库', '自定义出题', '我的题库', '高考真题查询', '模拟卷考题查询', '话题关键词', '思辨类型']) console.log(`questions page contains「${c}」:`, text.includes(c));

  // 点击 查找（默认 全部×全部，按关键词思辨类型搜索） → 应出现“查找结果”
  await send('Runtime.evaluate', { expression: "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='查找');if(b){b.click();return true;}return false;})()", returnByValue: true });
  await sleep(2500);
  text = await grab();
  console.log('search executed, contains「查找结果」:', text.includes('查找结果'));
  const hasSaved = text.includes('存入我的题库');
  console.log('result item has 存入我的题库:', hasSaved);

  // 切到 我的题库
  await clickText('我的题库'); await sleep(2500);
  text = await grab();
  console.log('mine tab contains「导入新题」:', text.includes('导入新题'));
  console.log('mine tab contains「全部话题」:', text.includes('全部话题'));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('D:/Backup/Documents/ChatGPT/New project/docs/screenshots/question-center.png', Buffer.from(shot.result.data, 'base64'));
  console.log('screenshot saved');
  await send('Browser.close').catch(() => undefined);
  ws.close(); process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

