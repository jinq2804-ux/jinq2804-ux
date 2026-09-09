import type { CorrectionAI, ThinkingType, ChecklistItem, PigaiMark, PigaiDimension } from '../types.ts';
import { makePigai } from './pigai.ts';
import { db } from '../db/store.ts';
import type {
  AIProvider, QuestionDraft, QuestionInput, CorrectInput, ScaffoldOutput, ScaffoldInput,
  LectureOutlineOutput, RecommendationOutput, CustomGenerateInput,
} from './types.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const pick = <T,>(arr: T[], seed: number) => arr[seed % arr.length];
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const THINKING_LABEL: Record<ThinkingType, string> = {
  progressive: '逻辑递进型', dialectical: '关系辩证型', metaphoric: '比喻象征型', free: '自由发挥',
};

function paragraphs(text: string): string[] {
  return text.split(/\n+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

function firstSentence(p: string): string {
  const m = p.match(/[^。！？；\n]{6,40}[。！？；]?/);
  return (m ? m[0] : p).trim();
}

// ---------------- 批改1.0 演示（启发式派生） ----------------

function detectRedIssues(ps: string[]): PigaiMark[] {
  const out: PigaiMark[] = [];
  const typoRules: [RegExp, string][] = [
    [/既使/g, '疑为“即使”之误。提示：区分“既（已然）/即（假设、立即）”。'],
    [/做为/g, '疑为“作为”之误，“做为”是常见错别字。'],
    [/必需品的/g, '提示辨析“必须/必需”：作定语“必需品”才写作“需”。'],
    [/渡过(了)?(高中|青春|难关|时光)/g, '提示辨析“渡过/度过”：渡多用于渡河或难关，度过用于时间。'],
  ];
  const grammarRules: [RegExp, string][] = [
    [/(通过|经过)[^。！？]{2,40}使(得)?[^。！？]{0,24}/g, '“通过……使……”主语残缺：删“使”补出真正主语，或把“通过”后的内容改为陈述。'],
    [/(由于)[^。！？]{2,30}的原因/g, '因果标记冗余：保留一处表因标记即可。'],
    [/(目的是为了)/g, '“目的是为了”语义重复，二者取其一。'],
    [/(之所以)[^。！？]{2,30}(是因为|的原因)/g, '因果标记冗余：删去重复的“因为/原因”。'],
  ];
  ps.forEach((p, i) => {
    for (const [re, note] of typoRules) {
      const rr = new RegExp(re.source, 'g');
      let m: RegExpExecArray | null;
      while ((m = rr.exec(p)) !== null) out.push({ paragraph: i + 1, original: m[0], color: 'red', note });
    }
    for (const [re, note] of grammarRules) {
      const rr = new RegExp(re.source, 'g');
      let m: RegExpExecArray | null;
      while ((m = rr.exec(p)) !== null) out.push({ paragraph: i + 1, original: m[0], color: 'red', note });
    }
  });
  const seen = new Set<string>();
  return out.filter((x) => { const k = x.paragraph + '|' + x.original; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 16);
}

function logicIssues(ps: string[]) {
  const out: { paragraph: number; original: string; type: string; description: string }[] = [];
  ps.forEach((p, i) => {
    const loc = `第${i + 1}段`;
    if (/只要(坚持|努力|认真|刻苦|拼搏).{0,26}(成功|做成|胜利|成就|获得)/.test(p)) {
      out.push({ paragraph: i + 1, original: firstSentence(p), type: '循环论证', description: `“${loc}”以“只要……就能成功”的套话直接得出结论，以结论证结论，缺少过程与机制分析。` });
    }
    if (/袁隆平|屠呦呦|张桂梅|王津|爱迪生|居里夫人/.test(p) && /成功|坚持|伟大/.test(p) && !/慢|快节奏|算法|技术|节奏/.test(p)) {
      out.push({ paragraph: i + 1, original: firstSentence(p), type: '论据偏离', description: `“${loc}”所举人物事例主要论证“坚持/奉献”，与本文核心话题关联不足，需检查论据是否服务分论点。` });
    }
  });
  return out.slice(0, 6);
}

function quoteIssues(essay: string, ps: string[]) {
  const out: { paragraph: number; original: string; note: string; ok: boolean }[] = [];
  const quoteRe = /([一-龥A-Za-z]{2,12})说[：:]["“]([^"”]{6,50})["”]/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = quoteRe.exec(essay)) !== null) {
    if (seen.has(m[0])) continue;
    seen.add(m[0]);
    const who = m[1];
    const quote = m[2];
    const known = [
      { who: '爱因斯坦', text: '想象力比知识更重要' },
      { who: '康德', text: '要有勇气运用你自己的理智' },
      { who: '鲁迅', text: '无穷的远方' },
      { who: '罗曼·罗兰', text: '世界上只有一种英雄主义' },
    ];
    const ok = known.some((x) => (who.includes(x.who) || x.who.includes(who)) && quote.includes(x.text.slice(0, 6)));
    const para = ps.findIndex((p) => p.includes(m![0])) + 1;
    out.push({ paragraph: para || 1, original: m[0], note: ok ? '与白名单知识库一致，引用可核验。' : '演示模式无法联网核验该引用，建议教师复核出处。', ok });
  }
  const dataRe = /(?:据统计|数据显示|有关数据表明)[^。！？]{4,80}/g;
  while ((m = dataRe.exec(essay)) !== null) {
    if (seen.has(m[0])) continue;
    seen.add(m[0]);
    const para = ps.findIndex((p) => p.includes(m![0])) + 1;
    out.push({ paragraph: para || 1, original: m[0], note: '缺少权威出处，建议补充数据来源后再使用。', ok: false });
  }
  return out.slice(0, 10);
}

function heuristicAnalysis(input: CorrectInput): CorrectionAI {
  const ps = paragraphs(input.essay);
  const essay = (input.essay || '').trim();
  const seed = hash(essay) || 7;
  const topic = input.question?.title || input.question?.materialText || '给定话题';
  const count = ps.join('').replace(/\s/g, '').length;

  const redMarks = detectRedIssues(ps);
  const logic = logicIssues(ps);
  const quotes = quoteIssues(essay, ps);
  const unknownQuotes = quotes.filter((q) => !q.ok);

  const lengthScore = clamp(Math.floor(count / 120), 0, 8);
  const content = clamp(58 + lengthScore + (seed % 9), 55, 92);
  const expression = clamp(60 + ((seed >> 3) % 9), 55, 92);
  const development = clamp(52 + ((seed >> 5) % 10), 50, 90);
  const final = clamp(Math.round((content * 0.4 + expression * 0.4 + development * 0.2 - Math.max(0, logic.length - 1) * 2 - (unknownQuotes.length ? 2 : 0)) * 0.6), 0, 60);
  const grade = final >= 54 ? 'A' : final >= 45 ? 'B' : final >= 36 ? 'C' : 'D';

  const sentences = ps.flatMap((p) => p.split(/(?<=[。！？])/).filter((s) => s.trim().length > 8));
  const highlightCandidates = sentences.filter((s) => /我认为|唯有|才能|不是|而是|因此/.test(s));
  const highlights = (highlightCandidates.length ? highlightCandidates : sentences).slice(0, 2).map((s) => s.trim());

  const marks: PigaiMark[] = [
    ...redMarks,
    ...logic.map((l) => ({ paragraph: l.paragraph, original: l.original, color: 'blue' as const, note: `${l.type}：${l.description} 方向：在事例后补一句“这说明……”的论证性转译，或补充机制分析。` })),
    ...unknownQuotes.map((q) => ({ paragraph: q.paragraph, original: q.original, color: 'orange' as const, note: q.note })),
  ];

  const first = ps[0] ? firstSentence(ps[0]) : '';
  const structureNote = ps.length >= 4 && ps.length <= 9 ? '结构较完整，可识别“引论—本论—结论”的分层。' : ps.length > 9 ? '分段偏多，部分段落偏短、论证易单薄。' : '段落偏少，论证层次可能不足。';
  const dims: PigaiDimension[] = [
    {
      name: '审题与立意',
      strengths: first && /(我认为|我觉得|因此|应该|需要|唯有|可见)/.test(ps[0] || '') ? [`开头能较快亮出观点（依据：“${first.slice(0, 40)}……”）。`] : ['能围绕所给话题展开论述，无明显偏题。'],
      weaknesses: [],
    },
    {
      name: '内容与论据',
      strengths: quotes.length ? [`文中引用/举例 ${quotes.length} 处（如“${quotes[0].original.slice(0, 26)}……”），有一定材料支撑。`] : ['以说理为主，行文较流畅。'],
      weaknesses: quotes.length === 0 ? ['缺少经核验的典型事例或数据，论证落地不足，建议补充“人物事例＋一句说明”。'] : unknownQuotes.length ? [`有 ${unknownQuotes.length} 处引用/数据出处待核（详见橙色标注）。`] : [],
    },
    {
      name: '结构与论证',
      strengths: [structureNote],
      weaknesses: logic.length ? [`检测到疑似逻辑问题 ${logic.length} 处：${logic.map((l) => l.type).join('、')}（详见蓝色标注）。`] : [],
    },
    {
      name: '语言与思辨性',
      strengths: highlights.length ? [`存在可圈点的表达，如“${highlights[0].slice(0, 30)}……”（可入优秀片段）。`] : ['语言通顺，表达基本清楚。'],
      weaknesses: redMarks.length ? [`检测到疑似错字/病句 ${redMarks.length} 处（详见红色标注）。`] : ['思辨多为断言式呈现，建议加入让步—反驳的回路，让观点“逼出”而非“闪出”。'],
    },
  ];
  dims.forEach((d) => { d.strengths = d.strengths.slice(0, 2); d.weaknesses = d.weaknesses.slice(0, 2); });

  const band = makePigai(final).estimate;
  const floorReasons = [
    `主估 ${final} 分（区间 ${band.range}）：${first ? `能扣住话题提出观点并成篇（“${first.slice(0, 24)}……”），具备基本议论文要素。` : '能围绕话题成篇，具备基本议论文要素。'}`,
    structureNote,
  ];
  const nextBandGaps = [];
  if (final < 56) nextBandGaps.push(logic.length ? `存在逻辑问题（${logic.map((l) => l.type).join('、')}），削弱论证力度。` : '论据多为概括说理，缺少“人物事例＋机制分析”的落地。');
  if (final < 56) nextBandGaps.push('结尾多为总结式复述，未在收束处再推进一层（如由个人上升至时代/群体）。');
  if (redMarks.length) nextBandGaps.push(`含错字/病句 ${redMarks.length} 处，高分区对硬伤零容忍。`);
  if (!nextBandGaps.length) nextBandGaps.push('距离上一区间的差距主要在于素材的新鲜度与思辨的纵深。');

  const pigai = makePigai(final, { marks, dimensions: dims, floorReasons: floorReasons.slice(0, 3), nextBandGaps: nextBandGaps.slice(0, 3) });
  return { scoring: { finalScore: final, grade }, highlights, pigai };
}

const TRAPS_BANK: Record<ThinkingType, string[]> = {
  progressive: ['只罗列现象，缺少“是什么—为什么—怎么办”的推进', '内涵阐释不透，成因与对策脱节', '把递进写成并列，层次不清'],
  dialectical: ['非此即彼、二元对立', '只谈一面，缺少统一视角', '把“辩证”写成“和稀泥”'],
  metaphoric: ['只解喻不联实，脱离现实', '类比对象与本体相似度不足', '比喻过度引申，脱离材料'],
  free: ['观点摇摆、没有稳定的思辨骨架', '只给态度不给过程，缺少推理', '材料与话题脱节'],
};

function generateQuestionMock(input: QuestionInput): QuestionDraft {
  const { province, grade, keyword, thinkingType } = input;
  const label = THINKING_LABEL[thinkingType];
  const kw = keyword && keyword.trim() ? keyword.trim() : '时代议题';
  const seed = hash(province + grade + kw + thinkingType);
  const difficulty = (['easy', 'medium', 'hard'] as const)[seed % 3];
  const kwFits: Record<ThinkingType, string> = {
    progressive: `“${kw}”的本质是什么？它为何值得关注，我们又该如何面对与践行？`,
    dialectical: `当“${kw}”的两面同时存在，我们该如何取舍与平衡？`,
    metaphoric: `“${kw}”像什么？它象征着怎样的精神或规律？`,
    free: `关于“${kw}”，什么才是值得你认真回答的问题？`,
  };
  const title = (() => {
    if (thinkingType === 'progressive') return `由表及里：${kw}`;
    if (thinkingType === 'dialectical') return `在${kw}的两端之间`;
    if (thinkingType === 'free') return `“${kw}”的自由之思`;
    return `从“${kw}”说开去`;
  })();
  const materialText = `近期，“${kw}”成为热议话题。有人认为它带来了前所未有的机遇，也有人忧心它暗藏风险与代价；有人主张顺应潮流，也有人呼吁保持警惕与定力。${kwFits[thinkingType]}请结合材料，联系现实，谈谈你的思考。`;
  const checklist: ChecklistItem[] = [
    { item: '观点鲜明，中心论点突出', score: 10 },
    { item: '结构完整：引论—本论—结论', score: 10 },
    { item: '论据典型、来源可靠', score: 10 },
    { item: '体现' + label + '的思维深度', score: 10 },
    { item: '语言表达与卷面书写', score: 10 },
  ];
  return {
    title,
    materialText,
    requirementText: `请结合上述材料，自拟标题，自选角度，写一篇不少于800字的议论文。要求：观点明确，能运用${label}展开深入论证；论据真实可靠；不得套作、抄袭。`,
    checklist,
    thinkingType,
    difficulty,
    province,
    grade,
    keyword: kw,
    traps: TRAPS_BANK[thinkingType].slice(0, 3),
    sourceNote: '本题目由演示模式 AI 生成（未联网）。接入 DeepSeek API 并开启联网搜索后，将实时检索公开信息校准材料。',
  };
}

// ---------------- 自定义出题（模仿风格 / 灵感 / 自定义输入） ----------------
function generateCustomQuestionMock(input: CustomGenerateInput): QuestionDraft {
  const style = input.styleQuestionId ? db.byId('questions', input.styleQuestionId) : null;
  const tt: ThinkingType = input.thinkingType || style?.thinkingType || 'dialectical';
  const kw = (input.keyword && input.keyword.trim()) || style?.keyword || '时代议题';
  const province = input.province || style?.province || '全国卷';
  const grade = input.grade || style?.grade || '高二';
  const label = THINKING_LABEL[tt];
  const difficulty = (['easy', 'medium', 'hard'] as const)[hash(kw + tt + province + grade) % 3];
  const styleNote = input.mode === 'imitate'
    ? `（演示）按“模拟出题1.0”口径生成：约140字、双维度独立命题${style ? `，参考《${style.title}》` : ''}；接入 DeepSeek 后按双维度严格执行。`
    : style
      ? `本题基于《${style.title}》的风格生成（演示模式）。`
      : undefined;

  let title: string;
  let materialText: string;
  let requirementText: string;
  if (input.mode === 'imitate') {
    materialText = `当下，“${kw}”正成为许多人共同面对的话题：它带来新的可能与机遇，也伴随困惑与犹疑；有人急于追赶，也有人主张先想清楚它的本质与边界。当关于“${kw}”的讨论越来越热烈，我们该如何定义它、理解它，并把它落到自己的生活与选择中？以上材料引发了你怎样的联想和思考？请写一篇文章。`;
    title = (input.rawTitle || '').trim() || `当“${kw}”成为时代命题`;
    requirementText = '要求：选准角度，确定立意，明确文体，自拟标题；不要套作，不得抄袭；不得泄露个人信息；不少于800字。';
  } else {
    const raw = (input.rawMaterial || '').trim();
    const idea = (input.inspiration || '').trim();
    materialText = raw
      ? raw
      : idea
        ? `最近你在思考“${kw}”：${idea.slice(0, 200)}。请把这份想法整理成一篇不少于800字的议论文，观点明确、论证充分。`
        : `近期，“${kw}”成为热议话题：有人认为它是机遇，也有人忧心其风险。请结合材料与现实，写一篇不少于800字的议论文，谈谈你的思考。`;
    title = (input.rawTitle || '').trim() || `围绕“${kw}”的思考与追问`;
    requirementText = `请结合上述材料（或你的构思），自拟标题，自选角度，写一篇不少于800字的议论文。要求：观点鲜明，能运用${label}展开论证；论据真实可靠；不得套作、抄袭。`;
  }

  return {
    title,
    materialText,
    requirementText,
    checklist: [
      { item: '观点鲜明，中心论点突出', score: 10 },
      { item: '结构完整：引论—本论—结论', score: 10 },
      { item: '论据典型、来源可靠', score: 10 },
      { item: `体现${label}的思维深度`, score: 10 },
      { item: '语言表达与卷面书写', score: 10 },
    ],
    thinkingType: tt,
    difficulty,
    province,
    grade,
    keyword: kw,
    traps: TRAPS_BANK[tt].slice(0, 3),
    sourceNote: style ? '由演示模式 AI 基于原题风格模仿生成（未联网），建议人工复核后发布。' : '由演示模式 AI 依据您的输入生成（未联网），建议人工复核后发布。',
    year: style?.year,
    examCategory: style?.examCategory,
    paperName: style?.paperName,
    styleNote,
  };
}

// ---------------- 写作支架 ----------------
function generateScaffoldMock(input: ScaffoldInput): ScaffoldOutput {
  const kw = input.keyword || input.title || '给定话题';
  const type = input.thinkingType || 'dialectical';
  const t = THINKING_LABEL[type];
  return {
    insights: [
      { level: '入门立意', title: `围绕“${kw}”谈清一个基本判断`, description: '先给“是什么/为什么/怎么办”下定义，选择一个稳妥角度立论，观点明确即可。' },
      { level: '进阶立意（批判性思维）', title: `对“${kw}”的流行共识提出反思`, description: `引入反方立场或隐藏前提，追问“流行的说法一定对吗”，体现${t}。` },
      { level: '高阶立意（哲学/社会学视角）', title: `把“${kw}”放进更长的时间与更大的结构`, description: '从技术伦理、社会结构、人的主体性等层面剖析，给出有原创性的价值判断。' },
    ],
    outline: {
      intro: `由“${kw}”的现实情境切入（一句话现象 + 一句设问），亮出中心论点。`,
      points: [
        { title: `分论点一：${kw}的价值与必要性`, type: '并列', detail: '用 1-2 个经核验的正面事例 + 机制分析支撑。' },
        { title: `分论点二：${kw}背后的代价与边界`, type: '递进', detail: '转向反面/代价分析，避免“一边倒”。' },
        { title: `分论点三：如何驾驭${kw}（对策与统一）`, type: '递进', detail: '提出可操作的标准或原则，完成辩证统一。' },
      ],
      conclusion: '回扣材料意象，重申论点并作价值升华（个人层面 + 时代层面）。',
    },
    materials: [
      { name: '袁隆平与杂交水稻', trait: '坚守与创新统一', appliesTo: '分论点一/三', source: '知识库' },
      { name: '屠呦呦与青蒿素', trait: '从古籍中创新', appliesTo: '分论点一', source: '知识库' },
      { name: '康德：“要有勇气运用你自己的理智”', trait: '独立思考', appliesTo: '分论点二/三', source: '知识库' },
      { name: '2024年全国研发经费投入超3.6万亿元', trait: '创新驱动的事实依据', appliesTo: '分论点一', source: '知识库（联网可补充最新数据）' },
    ],
    traps: TRAPS_BANK[type].slice(0, 3),
  };
}

// ---------------- 讲评课大纲 ----------------
function lectureOutlineMock(className: string, weaknesses: { tag: string; ratio: number }[], avgScore: number): LectureOutlineOutput {
  const top = weaknesses.length ? weaknesses[0].tag : '论证深度不足';
  return {
    title: `${className} · 议论文讲评课：聚焦“${top}”`,
    totalMinutes: 40,
    segments: [
      { phase: '情境导入（5分钟）', minutes: 5, content: `展示班级平均分 ${avgScore} 分与进步曲线，公布共性薄弱项 TOP3：${weaknesses.map((w) => `${w.tag}（${Math.round(w.ratio * 100)}%）`).join('、') || '暂无'}。`, examples: ['班级平均分与目标线对比图', '典型错题标签词云'] },
      { phase: '错误案例展示（10分钟）', minutes: 10, content: `选取 2-3 篇含“${top}”的匿名片段，请学生诊断问题所在。`, examples: ['片段 A：论据偏离实例', '片段 B：偷换概念实例', '诊断单（找论点/论据/论证）'] },
      { phase: '正确示范（10分钟）', minutes: 10, content: `以优秀片段墙上的置顶句段为范本，拆解“论点—论据—分析”的缝合技巧。`, examples: ['优秀片段 1（已置顶）', '教师示范改写一段错误片段'] },
      { phase: '当堂练习（10分钟）', minutes: 10, content: `给出 1 道同类思辨题，要求 8 分钟列提纲，重点检查是否规避“${top}”。`, examples: ['练习题目（推荐题库 #）', '互评清单'] },
      { phase: '总结与布置（5分钟）', minutes: 5, content: '汇总共性改进点，按个性化推荐列表布置分层作业。', examples: ['个性化学习任务清单', '错题本复习提示'] },
    ],
  };
}

// ---------------- 个性化推荐 ----------------
function recommendationsMock(profiles: { studentId: string; studentName: string; tags: string[]; avg: number }[]): RecommendationOutput[] {
  return profiles.map((p) => {
    const tag = p.tags[0] || '论证深度';
    const focus = tag;
    return {
      studentId: p.studentId,
      studentName: p.studentName,
      focus,
      reason: `该生近期批改中反复出现“${tag}”（共 ${Math.max(1, p.tags.length)} 类问题），当前平均分 ${p.avg}，建议优先突破 ${tag}。`,
      tasks: [
        { questionId: 'q-1', questionTitle: '快与慢：时代节奏下的生活选择', taskType: 'review', note: `重读既往批改中“${tag}”对应句段，对照修改建议完成一次改写。` },
        { questionId: 'q-2', questionTitle: '当算法越来越懂我们', taskType: 'practice', note: '完成一篇新题写作，重点自检是否规避“论据偏离/以偏概全”。' },
        { taskType: 'read', note: '精读优秀片段墙 2 篇置顶片段，摘抄其“缝合论据”的关键句。' },
      ],
    };
  });
}

export const mockProvider: AIProvider = {
  mode: 'mock',
  async generateQuestion(input) { await sleep(500 + Math.random() * 500); return generateQuestionMock(input); },
  async generateCustomQuestion(input) { await sleep(700); return generateCustomQuestionMock(input); },
  async correctEssay(input) {
    await sleep(900 + Math.random() * 700);
    return heuristicAnalysis(input);
  },
  async generateScaffold(input) { await sleep(600); return generateScaffoldMock(input); },
  async generateLectureOutline(className, weaknesses, avgScore) { await sleep(700); return lectureOutlineMock(className, weaknesses, avgScore); },
  async generateRecommendations(profiles) { await sleep(800); return recommendationsMock(profiles); },
};


