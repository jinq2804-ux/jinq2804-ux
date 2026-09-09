import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DatabaseShape } from '../types.ts';
import { config } from '../config.ts';
import { buildSeed } from './seed.ts';

function emptyDb(): DatabaseShape {
  return {
    users: [], teacherStyles: [], classes: [], students: [], questions: [],
    corrections: [], materials: [], highlightClips: [], myMaterials: [], studentWeakness: [], learningTasks: [],
  };
}

export class DBStore {
  data: DatabaseShape;
  private file: string;

  constructor(file = config.dataFile) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.data = this.load();
  }

  private load(): DatabaseShape {
    try {
      if (fs.existsSync(this.file)) {
        const raw = fs.readFileSync(this.file, 'utf-8');
        const parsed = JSON.parse(raw);
        return { ...emptyDb(), ...parsed };
      }
    } catch (err) {
      console.warn('[db] 读取失败，重建种子数据：', err);
    }
    const seed = buildSeed();
    this.data = seed;
    this.save();
    return seed;
  }

  save() {
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  resetToSeed() {
    this.data = buildSeed();
    this.save();
  }

  insert<K extends keyof DatabaseShape>(table: K, row: DatabaseShape[K][number]) {
    (this.data[table] as unknown[]).push(row);
    this.save();
    return row;
  }

  update<K extends keyof DatabaseShape>(
    table: K,
    id: string,
    patch: Partial<DatabaseShape[K][number]>,
  ): DatabaseShape[K][number] | undefined {
    const rows = this.data[table] as unknown as Array<Record<string, any>>;
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return undefined;
    rows[idx] = { ...rows[idx], ...(patch as Record<string, any>), id: rows[idx].id };
    this.save();
    return rows[idx] as DatabaseShape[K][number];
  }

  remove<K extends keyof DatabaseShape>(table: K, id: string): boolean {
    const rows = this.data[table] as unknown as Array<{ id: string }>;
    const before = rows.length;
    const next = rows.filter((r) => r.id !== id);
    (this.data[table] as unknown[]) = next;
    if (next.length !== before) { this.save(); return true; }
    return false;
  }

  find<K extends keyof DatabaseShape>(table: K, predicate: (r: DatabaseShape[K][number]) => boolean) {
    return (this.data[table] as DatabaseShape[K][number][]).filter(predicate);
  }

  findOne<K extends keyof DatabaseShape>(table: K, predicate: (r: DatabaseShape[K][number]) => boolean) {
    return (this.data[table] as DatabaseShape[K][number][]).find(predicate);
  }

  byId<K extends keyof DatabaseShape>(table: K, id: string) {
    return (this.data[table] as unknown as Array<{ id: string }>).find((r) => r.id === id) as DatabaseShape[K][number] | undefined;
  }

  newId() { return randomUUID(); }
}

export const db = new DBStore();

