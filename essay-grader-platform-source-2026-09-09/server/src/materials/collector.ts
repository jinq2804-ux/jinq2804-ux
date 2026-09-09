import { db } from '../db/store.ts';
import { guessDims } from './dims.ts';
import type { Material } from '../types.ts';

export interface MaterialSource { id: string; name: string; publisher: string; url: string; defaultTag: string; }
export const MATERIAL_SOURCES: MaterialSource[] = [
  { id: 'people-politics', name: '人民网·时政频道', publisher: '人民网', url: 'http://www.people.com.cn/rss/politics.xml', defaultTag: '时政' },
  { id: 'people-society', name: '人民网·社会频道', publisher: '人民网', url: 'http://www.people.com.cn/rss/society.xml', defaultTag: '社会民生' },
  { id: 'people-edu', name: '人民网·教育频道', publisher: '人民网', url: 'http://www.people.com.cn/rss/edu.xml', defaultTag: '教育' },
  { id: 'people-culture', name: '人民网·文化频道', publisher: '人民网', url: 'http://www.people.com.cn/rss/culture.xml', defaultTag: '文化' },
];
type FeedItem = { title: string; link: string; description: string; publishedAt: string };
type CollectionStatus = { running: boolean; lastStartedAt?: string; lastFinishedAt?: string; lastAdded: number; lastSkipped: number; lastErrors: string[] };
const status: CollectionStatus = { running: false, lastAdded: 0, lastSkipped: 0, lastErrors: [] };
function decodeXml(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
}
function stripHtml(value: string) { return decodeXml(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function tag(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decodeXml(match[1]).trim() : '';
}
export function parseRss(xml: string): FeedItem[] {
  const blocks = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];
  return blocks.map((block) => {
    const rawDate = tag(block, 'pubDate') || tag(block, 'date');
    const date = rawDate ? new Date(rawDate) : null;
    return {
      title: stripHtml(tag(block, 'title')),
      link: stripHtml(tag(block, 'link')),
      description: stripHtml(tag(block, 'description') || tag(block, 'content:encoded')),
      publishedAt: date && !Number.isNaN(date.valueOf()) ? date.toISOString() : '',
    };
  }).filter((item) => item.title && /^https?:\/\//i.test(item.link));
}
export function getCollectionStatus() {
  return { ...status, sources: MATERIAL_SOURCES.map(({ id, name, publisher, url }) => ({ id, name, publisher, url })) };
}
export async function collectMaterials(fetcher: typeof fetch = fetch) {
  if (status.running) return { ...getCollectionStatus(), alreadyRunning: true };
  status.running = true; status.lastStartedAt = new Date().toISOString();
  status.lastAdded = 0; status.lastSkipped = 0; status.lastErrors = [];
  const collected: Material[] = [];
  const knownLinks = new Set(db.data.materials.map((item) => item.sourceUrl).filter(Boolean));
  try {
    for (const source of MATERIAL_SOURCES) {
      try {
        const response = await fetcher(source.url, { headers: { 'User-Agent': 'ZhuoyuMaterialBot/1.0 (educational material review)' }, signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const items = parseRss(await response.text()).slice(0, 12);
        for (const item of items) {
          if (knownLinks.has(item.link)) { status.lastSkipped += 1; continue; }
          knownLinks.add(item.link);
          const now = new Date().toISOString();
          const text = item.description.slice(0, 800) || `官方来源发布：${item.title}。请教师打开原文核对并补充可引用的要点。`;
          collected.push({
            id: db.newId(), title: item.title, content: text, gradeLevels: ['通用'],
            dims: guessDims({ title: item.title, content: text, sourcePublisher: source.publisher, debateDimension: source.defaultTag }),
            debateDimension: source.defaultTag, source: source.publisher, sourceTitle: item.title,
            sourceUrl: item.link, sourcePublisher: source.publisher, sourcePublishedAt: item.publishedAt,
            sourceVerified: false, teacherComment: '自动采集，待教师核对原文、评价适用角度后发布。',
            applicableArguments: '待教师审核', status: 'pending', origin: 'automatic',
            collectionSourceId: source.id, collectedAt: now, createdBy: 'system-collector',
            createdAt: now, updatedAt: now,
          });
        }
      } catch (error) {
        status.lastErrors.push(`${source.name}：${error instanceof Error ? error.message : '采集失败'}`);
      }
    }
    for (const item of collected) db.insert('materials', item);
    status.lastAdded = collected.length;
  } finally {
    status.running = false; status.lastFinishedAt = new Date().toISOString();
  }
  return getCollectionStatus();
}
