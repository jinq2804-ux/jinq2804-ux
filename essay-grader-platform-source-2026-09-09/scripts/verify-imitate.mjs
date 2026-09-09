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
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
  const clickExact = (t) => ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='${t}');if(b){b.click();return true;}return false;})()`);
  const clickFirstIncludes = (t) => ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().includes('${t}'));if(b){b.click();return true;}return false;})()`);

  await clickExact('查找'); await sleep(2500);
  let text = await ev('document.body.innerText');
  console.log('result contains 模仿出题:', text.includes('模仿出题'));

  // 打开第一个“模仿出题”
  await ev(`(()=>{const bs=[...document.querySelectorAll('button')].filter(x=>x.textContent.trim()==='模仿出题');if(bs[0]){bs[0].click();return true;}return false;})()`);
  await sleep(1200);
  text = await ev('document.body.innerText');
  for (const c of ['模仿该题生成一道新题', '话题处理', '思辨类型', '模仿原题话题', '替换为新话题', '换成其他思辨类型']) console.log('modal contains「' + c + '」:', text.includes(c));

  // 生成新题
  await clickExact('按此风格生成新题'); await sleep(2600);
  text = await ev('document.body.innerText');
  console.log('generated draft inside modal:', text.includes('保存并发布') && text.includes('偏题陷阱'));

  // 关闭弹窗，切到自定义出题
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='关闭'||x.getAttribute('aria-label')==='close');if(b){b.click();return true;}return false;})()`);
  await clickFirstIncludes('自定义出题'); await sleep(1800);
  text = await ev('document.body.innerText');
  console.log('custom tab NOT contains 模仿真题风格出题:', !text.includes('模仿真题风格出题'));
  console.log('custom tab contains 自定义创作:', text.includes('自定义创作'));

  await send('Browser.close').catch(() => undefined); ws.close(); process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
