import fs from 'node:fs';
import { config } from '../config.ts';
import { BANK_QUESTIONS } from '../db/bank-seed.ts';

// 幂等同步：把内置题库(真题/模拟卷)合并进运行中的 db.json，删除旧的“示例占位”题，
// 保留用户数据（批改记录/我的题库等）。可重复执行。
const file = config.dataFile;
if (!fs.existsSync(file)) {
  console.error(`[sync-bank] 未找到数据文件: ${file}`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = `${file}.bak-${stamp}`;
fs.copyFileSync(file, backup);

const db = JSON.parse(fs.readFileSync(file, 'utf-8')) as { questions?: any[] };
const questions = Array.isArray(db.questions) ? db.questions : [];
const isPlaceholder = (q: any) =>
  String(q?.id || '').startsWith('bk-') && String(q?.paperName || '').includes('示例占位');

const removed = questions.filter(isPlaceholder);
const kept = questions.filter((q) => !isPlaceholder(q));
const byId = new Map(kept.map((q) => [q.id, q]));
const added: string[] = [];
const updated: string[] = [];
for (const q of BANK_QUESTIONS) {
  if (!byId.has(q.id)) {
    kept.push(q as any);
    byId.set(q.id, q);
    added.push(q.id);
  } else {
    // 内置题内容以 BANK_QUESTIONS 为准（幂等更新，便于修正文字后同步）
    const i = kept.findIndex((x) => x.id === q.id);
    kept[i] = q as any;
    updated.push(q.id);
  }
}
db.questions = kept;
fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf-8');

console.log(`[sync-bank] 备份: ${backup}`);
console.log(`[sync-bank] 移除占位题: ${removed.length}${removed.length ? ' (' + removed.map((q) => q.id).join(', ') + ')' : ''}`);
console.log(`[sync-bank] 新增内置题: ${added.length}${added.length ? ' (' + added.join(', ') + ')' : ''}`);
console.log(`[sync-bank] 更新内置题: ${updated.length}${updated.length ? ' (' + updated.join(', ') + ')' : ''}`);
console.log(`[sync-bank] 题目总数: ${db.questions.length}`);
