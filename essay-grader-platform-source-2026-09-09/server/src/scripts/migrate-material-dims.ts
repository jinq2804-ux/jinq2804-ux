import fs from 'node:fs';
import { config } from '../config.ts';
import { guessDims, FORM_OPTIONS, FIELD_OPTIONS, MOTIF_OPTIONS, ERA_OPTIONS } from '../materials/dims.ts';

// 素材库四维筛选体系改造——存量迁移脚本（幂等，可重复执行）：
// 1) 备份 db.json
// 2) 为每条缺少/非法 dims 的素材用 guessDims 补齐四维（基于旧 category/tags/标题/正文/来源启发式打标）
// 3) 从存储中彻底删除 category / tags 字段
const file = config.dataFile;
if (!fs.existsSync(file)) {
  console.error(`[migrate-material-dims] 未找到数据文件: ${file}`);
  process.exit(1);
}

const dryRun = process.env.DRY_RUN === '1';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = `${file}.bak-${stamp}`;

const db = JSON.parse(fs.readFileSync(file, 'utf-8')) as any;
const materials: any[] = Array.isArray(db.materials) ? db.materials : [];

const validDims = (d: any) =>
  !!d && FORM_OPTIONS.includes(d.form) && FIELD_OPTIONS.includes(d.field) &&
  MOTIF_OPTIONS.includes(d.motif) && ERA_OPTIONS.includes(d.era);

let added = 0;
let kept = 0;
let stripped = 0;
const count = { form: {} as Record<string, number>, field: {} as Record<string, number>, motif: {} as Record<string, number>, era: {} as Record<string, number> };
for (const m of materials) {
  if (!validDims(m.dims)) {
    const guessed = guessDims(m);
    m.dims = { form: guessed.form, field: guessed.field, motif: guessed.motif, era: guessed.era };
    added += 1;
  } else {
    kept += 1;
  }
  if ('category' in m || 'tags' in m) {
    delete m.category;
    delete m.tags;
    stripped += 1;
  }
  for (const key of ['form', 'field', 'motif', 'era'] as const) {
    const v: string = m.dims?.[key] || '(缺失)';
    count[key][v] = (count[key][v] || 0) + 1;
  }
}

if (!dryRun) {
  fs.copyFileSync(file, backup);
  fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf-8');
  console.log(`[migrate-material-dims] 已备份: ${backup}`);
} else {
  console.log('[migrate-material-dims] DRY-RUN 模式，未写盘');
}
console.log(`[migrate-material-dims] 素材总数: ${materials.length} | 新打标: ${added} | 已含合法dims保留: ${kept} | 删除category/tags条数: ${stripped}`);
for (const key of ['form', 'field', 'motif', 'era'] as const) {
  const entries = Object.entries(count[key]).sort((a, b) => b[1] - a[1]);
  console.log(`[${key}] ` + entries.map(([k, v]) => `${k}=${v}`).join(' | '));
}
