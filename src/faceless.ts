/**
 * 【bcy 修改版】男性无脸:出图前对提示词做查找替换,不靠 AI 自觉。
 *
 * 在 generate.ts 的 generateImage 里统一生效 —— 楼层卡片、公开接口、自由生图同一条路,
 * 所以开关一开,所有新出的图(含重画)都会过一遍。只改发出去的内容,不改楼层里存的 tag。
 *
 * 匹配口径:
 * - 「标签」规则:按逗号拆开逐个比,整条 tag 相同(不分大小写)才替换;替换后去重。
 *   这样 `1boy` 不会误伤 `1boy_focus` 之类,`1boy, faceless male` 也不会被重复追加。
 * - 「描述」规则:在自然语言里按整词查找(不分大小写),`a man` 不会命中 `a manly`。
 * - 任意一条规则命中(即画面里确实有男性)才追加负面词;没男人的图一个字都不动。
 */
import type { ImageCharacterPrompt } from '@/autoTag/protocol';

export type FacelessScope = 'tag' | 'nl';

export interface FacelessRule {
  id: string;
  /** tag = 匹配逗号分隔的整条标签;nl = 匹配自然语言里的整词/短语。 */
  scope: FacelessScope;
  find: string;
  /** 替换成什么;留空 = 删掉。 */
  replace: string;
  enabled: boolean;
}

export interface FacelessSettings {
  enabled: boolean;
  rules: FacelessRule[];
  /** 命中时追加到本图负面词(ComfyUI 需工作流含 %negative_prompt%)。 */
  negative: string;
}

let seq = 0;
function ruleId(): string {
  seq += 1;
  return `fl_${Date.now().toString(36)}_${seq}`;
}

const DEFAULT_RULES: Array<Omit<FacelessRule, 'id' | 'enabled'>> = [
  { scope: 'tag', find: '1boy', replace: '1boy, faceless male' },
  { scope: 'tag', find: '2boys', replace: '2boys, faceless male' },
  { scope: 'tag', find: 'multiple boys', replace: 'multiple boys, faceless male' },
  { scope: 'tag', find: 'male focus', replace: '' },
  { scope: 'nl', find: 'a man', replace: 'a faceless man' },
  { scope: 'nl', find: 'the man', replace: 'the faceless man' },
  { scope: 'nl', find: 'a young man', replace: 'a faceless young man' },
  { scope: 'nl', find: 'the young man', replace: 'the faceless young man' },
  { scope: 'nl', find: 'a boy', replace: 'a faceless boy' },
  { scope: 'nl', find: 'the boy', replace: 'the faceless boy' },
  { scope: 'nl', find: 'his face', replace: 'his blank featureless face' },
];

export const DEFAULT_FACELESS_NEGATIVE = 'male face, detailed male face, male eyes';

export function facelessDefaults(): FacelessSettings {
  return {
    enabled: false,
    rules: DEFAULT_RULES.map(rule => ({ ...rule, id: ruleId(), enabled: true })),
    negative: DEFAULT_FACELESS_NEGATIVE,
  };
}

export function defaultFacelessRules(): FacelessRule[] {
  return facelessDefaults().rules;
}

export function newFacelessRule(scope: FacelessScope): FacelessRule {
  return { id: ruleId(), scope, find: '', replace: '', enabled: true };
}

export function normalizeFaceless(raw: unknown): FacelessSettings {
  const d = facelessDefaults();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<FacelessSettings>;
  const rules = Array.isArray(r.rules)
    ? r.rules
        .filter((x): x is FacelessRule => !!x && typeof x === 'object')
        .map(x => ({
          id: typeof x.id === 'string' && x.id ? x.id : ruleId(),
          scope: x.scope === 'nl' ? ('nl' as const) : ('tag' as const),
          find: typeof x.find === 'string' ? x.find : '',
          replace: typeof x.replace === 'string' ? x.replace : '',
          enabled: x.enabled !== false,
        }))
    : d.rules;
  return {
    enabled: r.enabled === true,
    rules,
    negative: typeof r.negative === 'string' ? r.negative : d.negative,
  };
}

function splitTags(text: string): string[] {
  return text
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/** 返回 [新文本, 是否命中]。 */
export function applyTagRules(text: string, rules: FacelessRule[]): [string, boolean] {
  const active = rules.filter(r => r.enabled && r.scope === 'tag' && r.find.trim());
  if (!active.length || !text.trim()) return [text, false];
  let hit = false;
  const out: string[] = [];
  for (const tag of splitTags(text)) {
    const rule = active.find(r => r.find.trim().toLowerCase() === tag.toLowerCase());
    if (rule) {
      hit = true;
      out.push(...splitTags(rule.replace));
    } else {
      out.push(tag);
    }
  }
  return hit ? [dedupeTags(out).join(', '), true] : [text, false];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 整词:前后不能紧挨字母/数字(中文、标点、空白都算边界)。 */
export function applyNlRules(text: string, rules: FacelessRule[]): [string, boolean] {
  const active = rules.filter(r => r.enabled && r.scope === 'nl' && r.find.trim());
  if (!active.length || !text.trim()) return [text, false];
  let hit = false;
  let out = text;
  // 长的先替换:"the young man" 要先于 "the man" 处理,免得被拆成两半
  for (const rule of [...active].sort((a, b) => b.find.trim().length - a.find.trim().length)) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(rule.find.trim())}(?![\\p{L}\\p{N}])`, 'giu');
    out = out.replace(pattern, match => {
      hit = true;
      return keepCase(match, rule.replace);
    });
  }
  if (!hit) return [text, false];
  return [out.replace(/ {2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim(), true];
}

/** 句首 "A man" → "A faceless man":原文首字母大写时替换文本也大写。 */
function keepCase(match: string, replacement: string): string {
  if (!replacement) return '';
  const first = match.charAt(0);
  if (first && first === first.toUpperCase() && first !== first.toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function appendNegative(negative: string, extra: string): string {
  const tags = dedupeTags([...splitTags(negative), ...splitTags(extra)]);
  return tags.join(', ');
}

export interface FacelessInput {
  prompt: string;
  nl?: string;
  negative?: string;
  characters?: ImageCharacterPrompt[];
}

export interface FacelessOutput<T extends FacelessInput> {
  value: T;
  /** 是否有任何规则命中(画面里有男性)。 */
  hit: boolean;
}

/** 对一次出图的输入应用无脸规则。关着或没命中时原样返回(同一个对象)。 */
export function applyFaceless<T extends FacelessInput>(input: T, options: FacelessSettings): FacelessOutput<T> {
  if (!options.enabled) return { value: input, hit: false };
  const [prompt, h1] = applyTagRules(input.prompt, options.rules);
  const [nl, h2] = applyNlRules(input.nl ?? '', options.rules);
  let hitChars = false;
  const characters = input.characters?.map(c => {
    const [tag, a] = applyTagRules(c.tag, options.rules);
    const [cnl, b] = applyNlRules(c.nl, options.rules);
    if (a || b) hitChars = true;
    return a || b ? { ...c, tag, nl: cnl } : c;
  });
  const hit = h1 || h2 || hitChars;
  if (!hit) return { value: input, hit: false };
  return {
    value: {
      ...input,
      prompt,
      nl: input.nl === undefined ? undefined : nl,
      characters,
      negative: options.negative.trim() ? appendNegative(input.negative ?? '', options.negative) : input.negative,
    },
    hit: true,
  };
}
