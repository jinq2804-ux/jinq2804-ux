import bcrypt from 'bcryptjs';
import type { DatabaseShape, Question, Correction, Material, User, PigaiReport } from '../types.ts';
import { makePigai } from '../ai/pigai.ts';
import { guessDims } from '../materials/dims.ts';
import { BANK_QUESTIONS } from './bank-seed.ts';

const daysAgo = (n: number, hour = 9) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 30, 0, 0);
  return d.toISOString();
};

const essay1 = [
  '当今社会，一切似乎都在提速：地铁越修越快，外卖越送越急，连看剧都要“倍速”。与此同时，也有人选择慢下来，去露营、练字、做饭。快与慢，究竟该如何取舍？我认为，快与慢并非对立，而是应当张弛有度、快慢结合。',
  '首先，快是时代发展的必然要求。改革开放以来，中国用几十年的时间走完了发达国家上百年的工业化历程，深圳从一个小渔村变成国际化大都市，“深圳速度”正是快的写照。高铁飞驰、5G 覆盖、移动支付普及，这些“快”让生活更加高效便捷，也让国家更有竞争力。没有快的积累，就没有今天的中国。',
  '然而，一味求快也会带来问题。当“3分钟读完一本书”成为风尚，当人们习惯用倍速追完一部剧，我们可能正在失去深度思考的能力。慢下来，才能让思想沉淀。正如爱因斯坦所说：“想象力比知识更重要。”真正有价值的创造，往往诞生于慢的沉思之中。因此，慢不是停滞，而是为了积蓄力量，所谓“磨刀不误砍柴工”。但也要警惕：有人把“慢生活”理解成拖延与懒惰，把“慢”等同于“躺平”，这其实是对慢的误读——慢是一种主动的节奏选择，而非被动的消极逃避。',
  '不仅如此，我还想用袁隆平院士的例子说明坚持的意义。袁老数十年如一日扎根稻田，最终培育出杂交水稻，解决了亿万人的吃饭问题。可见，只要坚持不懈，就一定能获得成功，所以我们也要学会在快节奏中保持一份坚持。',
  '综上所述，快与慢并非水火不容。于个人，我们应在快节奏中保留慢的清醒；于国家，我们既要有只争朝夕的干劲，也要有久久为功的定力。张弛有度，方能在时代洪流中行稳致远。',
].join('\n');

const essay2 = [
  '每天早晨，手机里的 App 似乎比我自己更清楚我想看什么。算法推送着相似的资讯，短视频一个接一个。有人说这是便利，我却隐隐担忧：当我们的一切都被算法安排，我们是否正在失去独立思考的能力？我认为，算法应当成为工具，而不能成为我们的“大脑”。',
  '算法确实带来了前所未有的效率。它帮我们筛选信息、规划路线、推荐音乐，把我们从琐碎中解放出来，让我们有更多时间去做真正想做的事。从这个角度看，算法是人的延伸，是人类智慧的结晶。',
  '但效率的另一面是思维的同质化。据统计，超过 70% 的年轻人每天刷短视频超过 2 小时，其中相当一部分时间是在算法“喂养”下被动度过的。长此以往，人们接触的信息越来越单一，观点越来越趋同，“信息茧房”随之形成。更值得警惕的是，当 AI 能替我们写邮件、写作业、做决定时，如果事事依赖，人的主体性就会被一点点侵蚀。',
  '有人说，既然算法这么强大，我们干脆把选择权都交给它好了。这种想法看似省事，实则危险：把决策权让渡给机器，等于放弃了作为人的责任与自由。康德说：“要有勇气运用你自己的理智。”这正是在提醒我们，工具可以升级，思考不能外包。',
  '因此，面对越来越“懂我们”的算法，我们既不必因噎废食，也不能全盘托付。保持清醒的自我，善用技术而不役于技术，才能在算法时代守护人的尊严与自由。',
].join('\n');

function seedPigai(score: number, highlights: string[]): PigaiReport {
  const tip = highlights[0] ? `文中“${highlights[0].slice(0, 26)}……”等句有表达亮点。` : '结构完整、层次清楚，能围绕话题展开说理。';
  return makePigai(score, {
    dimensions: [
      { name: '审题与立意', strengths: ['立意切题，能回应话题核心并亮出明确观点。'], weaknesses: [] },
      { name: '内容与论据', strengths: [tip], weaknesses: ['论据以概括说理为主，建议补充典型事例并做“这说明……”式转译。'] },
      { name: '结构与论证', strengths: ['具备“引论—本论—结论”的基本框架，层次清楚。'], weaknesses: [] },
      { name: '语言与思辨性', strengths: [], weaknesses: ['思辨多为断言式，可增加让步—反驳回路，让观点被“逼出”而非“闪出”。'] },
    ],
    floorReasons: [`主估 ${score} 分落在“${makePigai(score).estimate.tier}”档区间，论点与结构达到该档基本要求。`],
    nextBandGaps: ['论据论证化转译不足；结尾多在收束处复述，未再推进一层。'],
  });
}

function mkAI(score: number, highlights: string[]): Correction['aiResponse'] {
  const s = Math.max(0, Math.min(60, Math.round(score)));
  return {
    scoring: { finalScore: s, grade: s >= 54 ? 'A' : s >= 45 ? 'B' : s >= 36 ? 'C' : 'D' },
    highlights,
    pigai: seedPigai(s, highlights),
  };
}

export function buildSeed(): DatabaseShape {
  const pw = bcrypt.hashSync('123456', 10);

  const teacher: User = {
    id: 'u-teacher-1', email: 'teacher@demo.com', passwordHash: pw,
    name: '王老师', role: 'teacher', createdAt: daysAgo(90),
  };
  const admin: User = {
    id: 'u-admin-1', email: 'admin@demo.com', passwordHash: pw,
    name: '系统管理员', role: 'admin', createdAt: daysAgo(90),
  };

  const klass = {
    id: 'c-1', teacherId: teacher.id, name: '高二(3)班', gradeLevel: '高二', createdAt: daysAgo(60),
  };

  const students = [
    { id: 's-1', classId: klass.id, name: '李思远', studentNo: '2024001', createdAt: daysAgo(60) },
    { id: 's-2', classId: klass.id, name: '张明轩', studentNo: '2024002', createdAt: daysAgo(60) },
    { id: 's-3', classId: klass.id, name: '陈雨桐', studentNo: '2024003', createdAt: daysAgo(60) },
    { id: 's-4', classId: klass.id, name: '刘子涵', studentNo: '2024004', createdAt: daysAgo(60) },
    { id: 's-5', classId: klass.id, name: '赵一诺', studentNo: '2024005', createdAt: daysAgo(60) },
    { id: 's-6', classId: klass.id, name: '孙浩然', studentNo: '2024006', createdAt: daysAgo(60) },
  ];

  const questions: Question[] = [
    {
      id: 'q-1', teacherId: teacher.id,
      title: '快与慢：时代节奏下的生活选择',
      materialText: '当下，“倍速追剧”“3分钟读完一本书”成为很多人的习惯；也有人主动“慢下来”，去山野间露营、静心练字、亲手做一顿饭。有人感叹：我们被时代裹挟着奔跑，忘了生活本来的样子。对此，你有怎样的思考？',
      requirementText: '请结合材料，联系现实生活，写一篇不少于800字的议论文。要求：观点明确，论据充分，论证严谨；不得套作、抄袭。',
      checklist: [
        { item: '观点明确，中心论点清晰', score: 10 },
        { item: '结构完整：引论—本论—结论', score: 10 },
        { item: '论据典型且与论点契合', score: 10 },
        { item: '论证充分：因果/对比/辩证分析', score: 10 },
      ],
      thinkingType: 'dialectical', difficulty: 'medium', province: '全国卷', grade: '高二',
      keyword: '快与慢', traps: ['将“慢生活”偷换为“懒惰躺平”', '全篇只谈快或只谈慢，缺乏辩证统一', '堆砌名言却未与“时代节奏”建立联系'],
      published: true, source: 'ai_generated', createdAt: daysAgo(45),
    },
    {
      id: 'q-2', teacherId: teacher.id,
      title: '当算法越来越懂我们',
      materialText: '推荐算法能精准推送你爱看的内容，AI 助手能替你安排行程、代写邮件。有人说，这是效率的解放；也有人说，当算法比我们自己更懂我们时，我们正在失去“自己思考”的能力。对此，请谈谈你的看法。',
      requirementText: '自拟标题，自选角度，写一篇不少于800字的议论文。要求观点鲜明，能够对“技术便利”与“主体性”展开辩证分析。',
      checklist: [
        { item: '标题与中心论点切题', score: 10 },
        { item: '对技术与人的关系有辩证分析', score: 10 },
        { item: '论据新颖、来源可靠', score: 10 },
        { item: '语言表达与卷面', score: 10 },
      ],
      thinkingType: 'dialectical', difficulty: 'hard', province: '新高考Ⅰ卷', grade: '高二',
      keyword: '算法与自我', traps: ['片面否定技术，唱“技术原罪论”', '把“算法”与“人工智能”混为一谈', '只谈现象，缺少价值判断'],
      published: true, source: 'ai_generated', createdAt: daysAgo(20),
    },
    {
      id: 'q-3', teacherId: teacher.id,
      title: '坚守与创新',
      materialText: '故宫文物修复师王津，四十余年坚守在钟表修复台前，让数百年前的钟表重新转动；与此同时，数字化让故宫文物“活”了起来，观众足不出户即可云游故宫。坚守传统与拥抱创新，看似矛盾，实则相辅相成。对此你有怎样的思考？',
      requirementText: '结合材料，联系实际，写一篇不少于800字的议论文。',
      checklist: [
        { item: '论点明确，角度集中', score: 10 },
        { item: '论证有层次，逻辑严密', score: 10 },
        { item: '素材典型、与论点匹配', score: 10 },
        { item: '语言与书写', score: 10 },
      ],
      thinkingType: 'progressive', difficulty: 'easy', province: '北京卷', grade: '高二',
      keyword: '坚守与创新', traps: ['把“坚守”等同于“守旧”', '只举成功案例，缺乏对“为何二者统一”的因果分析'],
      published: false, source: 'ai_generated', createdAt: daysAgo(3),
    },
  ];

  // ===== 内置题库：近年高考真题与模拟卷作文题（见 bank-seed.ts）=====
  questions.push(...BANK_QUESTIONS);

  const demoAI = (score: number): Correction['aiResponse'] => mkAI(score, [
    '善用积累、张弛有度，观点表达较有力。',
    '能在说理中结合时代现象，具有一定的现实针对性。',
  ]);
  const corr = (id: string, questionId: string, studentId: string, originalText: string, score: number, verified: boolean, days: number, hour: number): Correction => ({
    id,
    questionId,
    studentId,
    teacherId: teacher.id,
    originalText,
    aiResponse: demoAI(score),
    finalScore: score,
    logicErrorTags: [],
    isVerified: verified,
    confidenceAvg: 0,
    createdAt: daysAgo(days, hour),
    updatedAt: daysAgo(Math.max(1, days - 1), hour),
  });
  const c1 = corr('corr-1', 'q-1', 's-1', essay1, 47, true, 12, 15);
  const c2 = corr('corr-2', 'q-2', 's-3', essay2, 51, true, 8, 14);
  const c3 = corr('corr-3', 'q-1', 's-2', essay1, 44, false, 6, 9);
  const c4 = corr('corr-4', 'q-1', 's-4', essay1, 42, false, 2, 10);

  const materialsRaw: any[] = [

    { id: 'm-1', title: '袁隆平与杂交水稻', category: '人物', content: '袁隆平数十年扎根稻田，研发杂交水稻，让中国人把饭碗牢牢端在自己手中。', tags: ['坚守', '创新', '科技报国'], debateDimension: '坚守与创新/个人与时代', source: '教研组知识库', sourceVerified: true, createdBy: teacher.id, createdAt: daysAgo(80) },
    { id: 'm-2', title: '屠呦呦与青蒿素', category: '人物', content: '屠呦呦从古籍《肘后备急方》中获得启发，历经190次失败提取青蒿素，获诺贝尔生理学或医学奖。', tags: ['坚守', '创新', '科学精神'], debateDimension: '坚守与创新', source: '教研组知识库', sourceVerified: true, createdBy: teacher.id, createdAt: daysAgo(80) },
    { id: 'm-3', title: '王津与故宫钟表修复', category: '人物', content: '故宫钟表修复师王津四十年如一日，让数百年前的钟表重新转动，被称为“大国工匠”。', tags: ['坚守', '匠心', '传统'], debateDimension: '坚守与创新/快与慢', source: '教研组知识库', sourceVerified: true, createdBy: teacher.id, createdAt: daysAgo(70) },
    { id: 'm-4', title: '张桂梅与华坪女高', category: '人物', content: '张桂梅扎根云南山区，创办全国第一所免费女子高中，帮助两千多名女孩走出大山。', tags: ['奉献', '教育', '坚守'], debateDimension: '个人价值', source: '教研组知识库', sourceVerified: true, createdBy: teacher.id, createdAt: daysAgo(70) },
    { id: 'm-5', title: '中国航天“北斗”组网', category: '事件', content: '北斗三号全球卫星导航系统正式开通，中国成为世界上第三个独立拥有全球卫星导航系统的国家。', tags: ['创新', '科技', '自立自强'], debateDimension: '坚守与创新/科技伦理', source: '教研组知识库', sourceVerified: true, createdBy: teacher.id, createdAt: daysAgo(65) },
    { id: 'm-6', title: '杭州亚运会“无废”办赛', category: '事件', content: '杭州亚运会践行“绿色、智能、节俭、文明”理念，场馆赛后惠民开放，废旧物资循环利用。', tags: ['环保', '可持续发展', '文明'], debateDimension: '发展与环保', source: '教研组知识库', sourceVerified: true, createdBy: teacher.id, createdAt: daysAgo(50) },
    { id: 'm-7', title: '鲁迅：“无穷的远方，无数的人们，都和我有关”', category: '名言', content: '鲁迅《且介亭杂文末集·这也是生活》。', tags: ['责任', '共情', '青年'], debateDimension: '个人与集体', source: '教研组知识库', sourceVerified: true, createdBy: teacher.id, createdAt: daysAgo(90) },
    { id: 'm-8', title: '康德：“要有勇气运用你自己的理智”', category: '名言', content: '康德《答复这个问题：“什么是启蒙运动？”》，启蒙运动口号。', tags: ['理性', '独立思考', '启蒙'], debateDimension: '技术与人/独立思考', source: '教研组知识库', sourceVerified: true, createdBy: teacher.id, createdAt: daysAgo(90) },
    { id: 'm-9', title: '2024年全国研发经费投入超3.6万亿元', category: '数据', content: '国家统计局数据：全社会研究与试验发展经费投入强度持续提升，居世界第二。', tags: ['科技', '创新', '数据'], debateDimension: '创新驱动', source: '国家统计局（教研组摘录）', sourceVerified: true, createdBy: teacher.id, createdAt: daysAgo(40) },
  
];

const materials: Material[] = materialsRaw.map((raw: any) => {
  const { category, tags, ...rest } = raw;
  return { ...rest, dims: guessDims(raw) };
});


  const clips = [
    { id: 'h-1', correctionId: 'corr-1', clipText: c1.aiResponse.highlights[0], topicTags: ['快与慢'], classId: klass.id, isPinned: true, createdAt: daysAgo(11) },
    { id: 'h-2', correctionId: 'corr-1', clipText: c1.aiResponse.highlights[1], topicTags: ['快与慢'], classId: klass.id, isPinned: false, createdAt: daysAgo(11) },
    { id: 'h-3', correctionId: 'corr-2', clipText: c2.aiResponse.highlights[0], topicTags: ['算法与自我'], classId: klass.id, isPinned: true, createdAt: daysAgo(7) },
    { id: 'h-4', correctionId: 'corr-2', clipText: c2.aiResponse.highlights[1], topicTags: ['算法与自我'], classId: klass.id, isPinned: false, createdAt: daysAgo(7) },
    { id: 'h-5', correctionId: 'corr-3', clipText: c3.aiResponse.highlights[0], topicTags: ['快与慢'], classId: klass.id, isPinned: false, createdAt: daysAgo(6) },
  ];

  const weaknesses = [
    { id: 'w-1', studentId: 's-1', errorTag: '论据偏离', correctionId: 'corr-1', exampleSentence: '袁老数十年如一日扎根稻田……', createdAt: daysAgo(11) },
    { id: 'w-2', studentId: 's-1', errorTag: '偷换概念', correctionId: 'corr-1', exampleSentence: '当人们习惯用倍速追完一部剧……', createdAt: daysAgo(11) },
    { id: 'w-3', studentId: 's-2', errorTag: '循环论证', correctionId: 'corr-3', exampleSentence: '可见，只要慢下来、静下心，就能把事情做成……', createdAt: daysAgo(6) },
    { id: 'w-4', studentId: 's-2', errorTag: '逻辑重叠', correctionId: 'corr-3', exampleSentence: '第3段已论述慢的意义，第4段再次论证同一观点。', createdAt: daysAgo(6) },
    { id: 'w-5', studentId: 's-3', errorTag: '以偏概全', correctionId: 'corr-2', exampleSentence: '超过 70% 的年轻人每天刷短视频超过 2 小时……', createdAt: daysAgo(7) },
    { id: 'w-6', studentId: 's-4', errorTag: '论据偏离', correctionId: 'corr-4', exampleSentence: '袁隆平事例证明坚持而非节奏选择。', createdAt: daysAgo(2) },
  ];

  const tasks = [
    { id: 't-1', studentId: 's-1', questionId: 'q-2', taskType: 'practice' as const, status: 'pending' as const, recommendedBy: teacher.id, createdAt: daysAgo(1) },
    { id: 't-2', studentId: 's-2', questionId: 'q-1', taskType: 'review' as const, status: 'pending' as const, recommendedBy: teacher.id, createdAt: daysAgo(1) },
    { id: 't-3', studentId: 's-3', questionId: 'q-1', taskType: 'practice' as const, status: 'pending' as const, recommendedBy: teacher.id, createdAt: daysAgo(1) },
    { id: 't-4', studentId: 's-4', questionId: 'q-2', taskType: 'review' as const, status: 'pending' as const, recommendedBy: teacher.id, createdAt: daysAgo(1) },
  ];

  return {
    users: [teacher, admin],
    teacherStyles: [],
    classes: [klass],
    students,
    questions,
    corrections: [c1, c2, c3, c4],
    materials,
    highlightClips: clips,
    myMaterials: [],
    studentWeakness: weaknesses,
    learningTasks: tasks,
  };
}

// 供前端“一键载入示例作文”使用
export const SAMPLE_ESSAYS: Record<string, string> = { 'q-1': essay1, 'q-2': essay2 };

