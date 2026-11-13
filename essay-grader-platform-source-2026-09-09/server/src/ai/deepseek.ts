import { config } from '../config.ts';
import type { CorrectionAI, ChecklistItem, ThinkingType } from '../types.ts';
import { makePigai, normalizePigai } from './pigai.ts';
import type {
  AIProvider, QuestionDraft, QuestionInput, CorrectInput, ScaffoldOutput, ScaffoldInput,
  LectureOutlineOutput, RecommendationOutput, CustomGenerateInput,
} from './types.ts';

interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; }

async function chatJSON(system: string, user: string): Promise<unknown> {
  const url = `${config.deepseekBaseUrl}/chat/completions`;
  const body = {
    model: config.deepseekModel,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ] as ChatMessage[],
    temperature: 0.7,
    response_format: { type: 'json_object' },
    stream: false,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.deepseekApiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DeepSeek API ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json() as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content || '';
  const cleaned = content.replace(/```(?:json)?/g, '').trim();
  return JSON.parse(cleaned);
}

const strip = (s: string, max = 600) => (s || '').slice(0, max);

const MONI_THINK_LABEL: Record<string, string> = {
  progressive: '逻辑递进型',
  dialectical: '关系辩证型',
  metaphoric: '比喻象征型',
  free: '自由发挥',
};

const customSystem = `你是资深高考作文命题专家，执行“自定义出题1.0”。用户给出话题关键词或具体想法（可另选思辨类型），严格按用户输入命题，不擅自改动话题与类型；本流程不依赖任何参考原题，直接按用户给定话题全新构建材料。

材料建构模式（题型）与默认抽取概率：
- 模式一：名人名言/文学摘录拼贴型（30%）：拼贴 2–4 句（通常 3 句）真实存在的名言或文学摘录，句末可标注“——作者《作品》”。铁律：摘录必须真实存在，人名/出处/原文不得有误，禁止虚构或张冠李戴，无法确认真实性时放弃该句或改用其它模式；各句须围绕同一话题且有内在逻辑联系（同题异答、意象呼应、层层递进、视角互补），不得拼凑无关句子；引用保持原文，不改写、不断章取义。模式一字数可放宽至不超过 150 字。
- 模式二：“有人说……有人说……”型（30%）：以“有人说/有人认为/有人选择……”并列呈现社会上不同的说法或做法；这些立场必须作为社会声音呈现，不得作为命题者自己的判断。
- 模式三：直接材料型（40%）：不借助“有人”框架，直接呈现情境、意象、现象、事件或一段叙述，接标准引导语。
用户未指定材料模式时按上述概率随机抽取；用户指定某模式时严格按其执行。

思辨类型（按用户选择）：关系辩证型＝呈现一对矛盾或互补关系（如“守”与“变”），让二者在情境/意象/现象中自然呈现，用开放设问留出辨析空间，不替学生下结论、不预设立场维度；逻辑递进型＝由现象到本质层层推进认知，材料呈现可感知层次，不点破每层该写什么；比喻象征型＝借物象/意象整体承载哲理，不直白说理；自由发挥＝自主选择最具思辨深度、最能激发写作欲的类型组织材料。

生成要点：
1) 字数：材料与引导语合计约140字（含标点，±5；模式一可至150字）。第一段为“材料＋引导语”，以“以上材料引发了你怎样的联想和思考？请写一篇文章。”收束；空一行；第二段为常规写作要求“要求：选准角度，确定立意，明确文体，自拟标题；不要套作，不得抄袭；不得泄露个人信息；不少于800字。”。
2) 语言风格：模仿高考真题句式节奏（情境/意象开篇、呈现社会现象或不同人的朴素做法、可落到青年），但逐句原创，不得照搬任何成句（模式一所引名言与摘录原文除外）。
3) 关键风格——只呈现，不代答：材料仅呈现情境、意象、现象、真实摘录或“有人说/有人认为”式社会声音，把思辨空间完全留给学生。严禁任何替学生立论的语句：直白判断句（如“若只守不新……传承将失其魂”）；假问句——用“是A，还是B？”“是……，抑或……？”把可写角度或分论点直接列出的设问；点明答案走向的表述（如“贵在平衡”“在于把握分寸”）以及任何泄露可写角度、结论或价值判断的提示语。不同立场只能作为社会声音呈现。如需设问收束，至多保留一个不带倾向、不预设立场维度的开放问题（如“它究竟意味着什么？”），能不用则不用。
4) 不加【】小标题，不附“命题策略说明”。
只输出 JSON，不要任何解释。`;

const imitateSystem = `你是资深高考作文命题专家，执行“模拟出题1.0”。用户提供【参考原题】并选定两个相互独立的维度，严格按用户的选择命题，不得擅自改动任一维度：维度一决定“写什么话题”，维度二决定“思辨骨架/逻辑走向”。

规则：
1) 话题维度（二选一）：A 模仿原题话题＝保留参考材料的核心讨论对象，但更换切入角度、材料情境或表述方式，严禁整句照搬原题句子（引导语“以上材料引发了你怎样的联想和思考？请写一篇文章。”可原样保留）；B 创新全新话题＝完全抛弃原题话题，按用户给的新话题方向构建材料。
2) 思辨维度：沿用原类型，或按用户指定类型组织思辨内核——逻辑递进型＝层层设问、由浅入深（是什么→为什么→怎么办）；关系辩证型＝呈现一对矛盾或互补的关系，用设问逼出对立统一的辨析；比喻象征型＝借物象或意象整体承载哲理，不直白说理。
3) 材料与引导语合计约140字（含标点，允许±5字）：第一段为“材料＋引导语”，以“以上材料引发了你怎样的联想和思考？请写一篇文章。”收束；空一行；第二段为常规写作要求“要求：选准角度，确定立意，明确文体，自拟标题；不要套作，不得抄袭；不得泄露个人信息；不少于800字。”。
4) 不加【】小标题、不附“命题策略说明”；可模仿原题语言风格，但必须逐句重写。
只输出 JSON，不要任何解释。`;


const questionSystem = '你是资深中学语文命题专家。请按要求生成一道材料作文题（含评分细则与偏题陷阱），只输出 JSON。';
const correctSystem = `你是资深高中语文阅卷教师，熟悉全国高考作文评分体系（基础等级＋发展等级，满分60、议论文为主），执行“批改1.0”：
1) 严格“先判区间、再区间内定分”：先独立判断作文属于50分及以上／45—49分／40—44分／39分及以下中的哪一区间，再在该区间内比较立意、论据、论证、表达和发展等级后确定整数分。定档仅作内部推理，输出中一律不使用“一类文/二类文/一类上/中/下”等档位表述。
2) 四维诊断缺一不可，每条判断必须引用原文作依据：审题与立意、内容与论据、结构与论证、语言与思辨性（发展等级：深刻/丰富/有文采/有创意）。
3) 估分：主估为60分制整数（不含字数扣分，由平台另行扣分），显示为“主估/60（固定区间）”。固定区间只有四个：50分及以上／45—49分／40—44分／39分及以下（映射：主估≥50→“50分及以上”；45—49→“45—49分”；40—44→“40—44分”；≤39→“39分及以下”）。
4) 临界分析（floorReasons/nextBandGaps）：各2—4条并引用原文，说明“为什么守得住当前区间”与“差在哪、不足以进入上一区间”；措辞用“当前区间/上一区间”，不得出现档位词。
5) 全文三色标注：marks 数组，红=错别字/病句（仅定位提示，不代改整句）；蓝=逻辑错误（归因单一、以偏概全、时代错位、前后矛盾等）；橙=引用待核。
6) 字数规则由平台另行按“少于800字每缺100字扣1分；≤300字不高于30”自动执行，模型给出不含该扣分的质量主估即可，但可把“字数不足/结构未展开”写进四维不足。
7) 只输出 JSON，不要任何解释。输出结构：
{
  "scoring": { "finalScore": 60制主估分, "grade": "A|B|C|D" },
  "highlights": ["1-2句可入优秀片段墙的句子"],
  "pigai": {
    "estimate": { "main": 与finalScore一致, "range": "固定区间之一（50分及以上/45—49分/40—44分/39分及以下）", "tier": 空字符串,
      "blocks": { "content": 0-20, "expression": 0-20, "development": 0-20 },
      "floorReasons": ["2-3条：守得住当前区间的理由，引用原文，不用档位词"],
      "nextBandGaps": ["2-3条：不足以进入上一区间的差距，引用原文，不用档位词"] },
    "marks": [ { "paragraph": 自然段号从1起（按换行分段；整篇无换行则为1）, "original": 必须逐字摘自原文、不得改写, "color": "red|blue|orange", "note": "提示/修改建议" } ],
    "dimensions": [ { "name": "审题与立意|内容与论据|结构与论证|语言与思辨性",
      "strengths": ["判断句＋原文依据"], "weaknesses": ["编号，给依据"] } ]
  }
}`;

async function correctEssay(input: CorrectInput): Promise<CorrectionAI> {
  const out = await chatJSON(correctSystem, JSON.stringify({
    question: input.question || null,
    essay: input.essay,
    humanScoreAnchors: input.scoreAnchors?.length ? {
      instruction: '以下均为同题且由教师人工核定的校准样本。它们只用于比较评分尺度；不得照搬其内容、句子或评语。先独立判区间，再与相邻样本比较后在区间内定分。',
      samples: input.scoreAnchors,
    } : undefined,
    note: '若材料本身含明显错字（OCR 痕迹），不追究材料，只评判学生作文本身。',
  }));
  const o = (out || {}) as Record<string, any>;
  const rawMain = Math.round(Number(o.scoring?.finalScore) || Number(o.pigai?.estimate?.main) || 0);
  const main = rawMain > 0 && rawMain <= 60 ? rawMain : 48;
  const gradeRaw = String(o.scoring?.grade || '');
  const grade = ['A', 'B', 'C', 'D'].includes(gradeRaw)
    ? gradeRaw
    : main >= 54 ? 'A' : main >= 45 ? 'B' : main >= 36 ? 'C' : 'D';
  const highlights = Array.isArray(o.highlights)
    ? o.highlights.map((h: any) => String(h)).filter(Boolean).slice(0, 3)
    : [];
  const pigai = normalizePigai(o.pigai) || makePigai(main);
  pigai.estimate.main = main;
  return { scoring: { finalScore: main, grade }, highlights, pigai };
}

async function generateQuestion(input: QuestionInput): Promise<QuestionDraft> {
  const out = await chatJSON(questionSystem, JSON.stringify({
    task: '生成材料作文题',
    province: input.province, grade: input.grade, keyword: input.keyword || '',
    thinkingType: input.thinkingType,
    webSearch: config.enableWebSearch ? '已开启联网检索，可使用最新公开事实校准材料' : '未开启',
    output: { title: '标题', materialText: '约150字争议性材料', requirementText: '写作要求', checklist: [{ item: '评分点', score: 10 }], thinkingType: input.thinkingType, difficulty: 'easy|medium|hard', province: input.province, grade: input.grade, keyword: input.keyword, traps: ['偏题陷阱1', '陷阱2', '陷阱3'], sourceNote: '来源说明' },
  }));
  const o = out as Record<string, unknown>;
  return {
    title: strip(String(o.title || '未命名题目'), 80),
    materialText: strip(String(o.materialText || ''), 1200),
    requirementText: strip(String(o.requirementText || ''), 600),
    checklist: Array.isArray(o.checklist) ? (o.checklist as ChecklistItem[]).slice(0, 8) : [],
    thinkingType: input.thinkingType,
    difficulty: (['easy', 'medium', 'hard'].includes(String(o.difficulty)) ? String(o.difficulty) : 'medium') as 'easy' | 'medium' | 'hard',
    province: input.province,
    grade: input.grade,
    keyword: input.keyword,
    traps: Array.isArray(o.traps) ? (o.traps as string[]).slice(0, 5) : [],
    sourceNote: String(o.sourceNote || '').slice(0, 200),
  };
}

async function generateCustomQuestion(input: CustomGenerateInput): Promise<QuestionDraft> {
  const style = input.style;
  const styleDesc = style
    ? `参考原题：标题《${style.title || ''}》，${[style.province, style.year, style.examCategory].filter(Boolean).join(' · ')}，材料：${(style.materialText || '').slice(0, 300)}`
    : '无参考原题';
  const ttLabel = (v?: string) => MONI_THINK_LABEL[v || ''] || v || '自由发挥';
  const isImitate = input.mode === 'imitate';
  const styleType = style?.thinkingType;
  const userDesc = isImitate
    ? `维度一（话题/内容处理）：${input.keyword ? `B 创新全新话题（新话题方向：${input.keyword}）` : 'A 模仿原题话题（保留核心讨论对象，更换角度/情境/表述，逐句重写）'}；维度二（思辨类型）：${input.thinkingType ? `B 转换为「${ttLabel(input.thinkingType)}」` : `A 沿用原类型（${ttLabel(styleType)}）`}。请按“模拟出题1.0”标准：生成题目标题 + 约140字材料（含引导语） + 常规写作要求。`
    : `请基于用户提供的内容生成一道完整材料作文题：${input.rawTitle ? `自拟标题「${input.rawTitle}」，` : ''}${input.rawMaterial ? `材料/引导语：${input.rawMaterial}，` : ''}${input.inspiration ? `用户灵感/想法：${input.inspiration}，` : ''}话题关键词：${input.keyword || ''}（思辨类型：${ttLabel(input.thinkingType)}）。（若未指定则按“自由发挥”，由你自主选择最有思辨深度的骨架。）`;
  const out = await chatJSON(
    isImitate ? imitateSystem : customSystem,
    JSON.stringify({
      styleDesc,
      userDesc,
      output: { title: '标题', materialText: '约140字材料（含引导语）', requirementText: '常规写作要求', checklist: [{ item: '评分点', score: 10 }], difficulty: 'easy|medium|hard', traps: ['陷阱1', '陷阱2', '陷阱3'], sourceNote: '说明', styleNote: '命题口径说明' },
    }),
  );
  const o = out as Record<string, any>;
  return {
    title: strip(String(o.title || ''), 80),
    materialText: strip(String(o.materialText || ''), 1200),
    requirementText: strip(String(o.requirementText || ''), 600),
    checklist: Array.isArray(o.checklist) ? (o.checklist as any[]).map((x: any) => ({ item: String(x.item || ''), score: Number(x.score) || 10 })) : [],
    thinkingType: (input.thinkingType || style?.thinkingType || 'free') as ThinkingType,
    difficulty: (['easy', 'medium', 'hard'].includes(String(o.difficulty)) ? String(o.difficulty) : 'medium') as 'easy' | 'medium' | 'hard',
    province: input.province || style?.province || '全国卷',
    grade: input.grade || style?.grade || '高二',
    keyword: input.keyword || style?.keyword,
    traps: Array.isArray(o.traps) ? o.traps.map(String).slice(0, 5) : [],
    sourceNote: String(o.sourceNote || '').slice(0, 200),
    year: style?.year,
    examCategory: style?.examCategory,
    paperName: style?.paperName,
    styleNote: String(o.styleNote || '').slice(0, 300),
  };
}
async function generateScaffold(input: ScaffoldInput): Promise<ScaffoldOutput> {
  const out = await chatJSON(
    '你是写作教学专家。基于题目生成“立意三梯度+论证大纲+精准素材推荐”，只输出 JSON。',
    JSON.stringify({ title: input.title, materialText: input.materialText, keyword: input.keyword, thinkingType: input.thinkingType, output: { insights: [{ level: '入门立意|进阶立意|高阶立意', title: '', description: '' }], outline: { intro: '', points: [{ title: '', type: '并列|递进|对比', detail: '' }], conclusion: '' }, materials: [{ name: '', trait: '', appliesTo: '', source: '知识库|联网检索' }], traps: [] } }),
  );
  const o = out as any;
  return {
    insights: Array.isArray(o.insights) ? o.insights.slice(0, 3).map((i: any) => ({ level: String(i.level || ''), title: String(i.title || ''), description: String(i.description || '') })) : [],
    outline: {
      intro: String(o.outline?.intro || ''),
      points: Array.isArray(o.outline?.points) ? o.outline.points.slice(0, 4).map((p: any) => ({ title: String(p.title || ''), type: (['并列', '递进', '对比'].includes(p.type) ? p.type : '并列'), detail: String(p.detail || '') })) : [],
      conclusion: String(o.outline?.conclusion || ''),
    },
    materials: Array.isArray(o.materials) ? o.materials.slice(0, 8).map((m: any) => ({ name: String(m.name || ''), trait: String(m.trait || ''), appliesTo: String(m.appliesTo || ''), source: String(m.source || '') })) : [],
    traps: Array.isArray(o.traps) ? o.traps.slice(0, 4).map((t: any) => String(t)) : [],
  };
}

async function generateLectureOutline(className: string, weaknesses: { tag: string; ratio: number }[], avgScore: number): Promise<LectureOutlineOutput> {
  const out = await chatJSON('你是教研专家，生成一节40分钟议论文讲评课的PPT大纲，只输出 JSON。', JSON.stringify({
    className, weaknesses, avgScore,
    output: { title: '', totalMinutes: 40, segments: [{ phase: '', minutes: 5, content: '', examples: [] }] },
  }));
  const o = out as any;
  return {
    title: String(o.title || `${className} 议论文讲评课`),
    totalMinutes: Number(o.totalMinutes) || 40,
    segments: Array.isArray(o.segments) ? o.segments.slice(0, 6).map((s: any) => ({ phase: String(s.phase || ''), minutes: Number(s.minutes) || 5, content: String(s.content || ''), examples: Array.isArray(s.examples) ? s.examples.map((e: any) => String(e)) : [] })) : [],
  };
}

async function generateRecommendations(profiles: { studentId: string; studentName: string; tags: string[]; avg: number }[]): Promise<RecommendationOutput[]> {
  const out = await chatJSON('你是学习诊断专家，为每位学生生成个性化学习建议，只输出 JSON 数组。', JSON.stringify({
    profiles,
    output: [{ studentId: '', studentName: '', focus: '', reason: '', tasks: [{ questionId: '', questionTitle: '', taskType: 'practice|review|read', note: '' }] }],
  }));
  const arr = Array.isArray(out) ? out : (out as any)?.output;
  return Array.isArray(arr) ? arr.map((r: any) => ({
    studentId: String(r.studentId || ''), studentName: String(r.studentName || ''), focus: String(r.focus || ''), reason: String(r.reason || ''),
    tasks: Array.isArray(r.tasks) ? r.tasks.map((t: any) => ({ questionId: t.questionId ? String(t.questionId) : undefined, questionTitle: t.questionTitle ? String(t.questionTitle) : undefined, taskType: (['practice', 'review', 'read'].includes(t.taskType) ? t.taskType : 'practice'), note: String(t.note || '') })) : [],
  })) : [];
}

export const deepseekProvider: AIProvider = {
  mode: 'deepseek',
  generateQuestion,
  generateCustomQuestion,
  correctEssay,
  generateScaffold,
  generateLectureOutline,
  generateRecommendations,
};



