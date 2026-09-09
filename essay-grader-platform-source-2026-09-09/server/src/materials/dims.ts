// 素材四维分类：枚举与启发式打标
export const FORM_OPTIONS = ['时政热点/现象', '历史事件/典故', '核心人物', '学术理论/社科概念', '名言金句', '文艺作品'] as const;
export const FIELD_OPTIONS = ['科技·数字', '文化·传统', '社会·民生', '经济·商业', '哲学·思辨', '生态·自然'] as const;
export const MOTIF_OPTIONS = ['个人与时代', '物质与精神', '传统与现代', '科技与人文', '快与慢', '自我认知', '批判与反思', '信念与坚守', '其他'] as const;
export const ERA_OPTIONS = ['中国古代', '中国近现代/当代', '世界经典', '全球当代'] as const;

export interface MaterialDims { form: string; field: string; motif: string; era: string; }
interface GuessInput {
  title?: string; content?: string; source?: string; sourceTitle?: string; sourcePublisher?: string;
  debateDimension?: string; applicableArguments?: string; category?: string; tags?: string[];
}
const TEXT = (i: GuessInput, ...extra: string[]) => [i.title, i.content, i.source, i.sourceTitle, i.sourcePublisher, i.debateDimension, i.applicableArguments, ...extra].filter(Boolean).join(' ').toLowerCase();

const PEOPLE = ['袁隆平','张桂梅','樊锦诗','钱学森','苏炳添','史铁生','屠呦呦','邓稼先','王津','雷锋','张桂梅','黄文秀'];
const SCHOLAR = ['齐美尔','本雅明','韩炳哲','韦伯','马尔库塞','鲍德里亚','戈夫曼','德波','库利','布迪厄','尼采','马克思','萨特','福柯','托克维尔'];
const KEEPERS = ['坚守','匠心','信念','理想','长期主义','使命','担当','奋斗','坚持'];
const MOTIF_MAP: Array<[string, string[]]> = [
  ['科技与人文', ['算法','人工智能','ai','数字','技术','工具理性','异化','科技','机器','信息茧房','人文']],
  ['传统与现代', ['传统','传承','创新','现代','经典','文化','灵光','返魅','守正','活化','创新']],
  ['物质与精神', ['物质','精神','消费','金钱','货币','义利','物欲','丰盈','贫困','财富']],
  ['快与慢', ['快','慢','内卷','躺平','节奏','效率','幸福','倍速','张弛']],
  ['自我认知', ['身份','认同','标签','表演','真实','自我','镜子','巴纳姆','焦虑','扮演','人格']],
  ['批判与反思', ['批判','反思','独立思考','茧房','盲从','祛魅','质疑','清醒','流行']],
  ['个人与时代', ['个人','时代','青年','担当','角色','社会','个体','群体','责任','洪流']],
  ['信念与坚守', ['坚守','信念','理想','长期','使命','匠心','坚持','奋斗','奉献']],
];
export function guessDims(input: GuessInput): MaterialDims {
  const t = TEXT(input);
  const tags = (input.tags || []).map((x) => x.toLowerCase());
  const has = (kw: string) => t.includes(kw.toLowerCase());
  // form
  let form: string = '时政热点/现象';
  if (input.category === '概念' || input.tags?.some((x) => x.includes('社科概念'))) form = '学术理论/社科概念';
  else if (input.category === '名言' || input.tags?.some((x) => x.includes('名言'))) form = '名言金句';
  else if (input.category === '典故' || has('典故') || has('寓言') || has('南柯') || has('望洋')) form = '历史事件/典故';
  else if (input.category === '人物' || PEOPLE.some((n) => has(n))) form = '核心人物';
  else if (SCHOLAR.some((n) => has(n)) || has('理论') || has('效应') || has('主义') || has('拟剧') || has('景观')) form = '学术理论/社科概念';
  else if (has('等待戈多') || has('电影') || has('小说') || has('戏剧') || has('画作') || has('舞台')) form = '文艺作品';
  else if (input.category === '数据' || has('统计') || has('调查') || has('发布')) form = '时政热点/现象';
  // field
  let field: string = '社会·民生';
  if (['科技','数字','算法','ai','人工智能','网络','信息','技术','代码','5g','芯片','算法'].some((k) => has(k))) field = '科技·数字';
  else if (['文化','非遗','传统','古籍','国潮','经典','传承','文物','敦煌','故宫','青绿','文字','典籍'].some((k) => has(k))) field = '文化·传统';
  else if (['经济','市场','资本','商业','货币','消费社会','财富','品牌','企业','产业'].some((k) => has(k))) field = '经济·商业';
  else if (['哲学','意义','存在','理性','异化','虚无','思辨','理论','主义','祛魅','灵光','倦怠','拟剧','景观','单向度','认知'].some((k) => has(k))) field = '哲学·思辨';
  else if (['生态','自然','环保','绿色','碳','森林','湿地','塞罕坝','环境'].some((k) => has(k))) field = '生态·自然';
  // motif
  let motif: string = '其他';
  for (const [name, kws] of MOTIF_MAP) if (kws.some((k) => has(k))) { motif = name; break; }
  // era
  let era: string = '全球当代';
  if (SCHOLAR.some((n) => has(n))) era = '世界经典';
  else if (['《论语》','先秦','古代','唐代','宋代','清代','汉代','寓言','东坡','韩愈','李白','杜甫'].some((k) => has(k))) era = '中国古代';
  else if (['人民网','当代','今年','近年来','本届','数字时代','互联网'].some((k) => has(k))) era = '全球当代';
  else if (['中国','国家','青年'].some((k) => has(k))) era = '中国近现代/当代';
  return { form, field, motif, era };
}
export const EMPTY_DIMS: MaterialDims = { form: '', field: '', motif: '', era: '' };
