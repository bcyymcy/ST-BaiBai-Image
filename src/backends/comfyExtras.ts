/**
 * 【bcy 修改版】自定义工作流的「插件侧接管」：前缀 / 后缀开关、LoRA 开关与触发词、出图后预览。
 *
 * 背景：用户在 ComfyUI 里用 PromptSelector(爱丽丝词库) 拼前后缀、用 LoRA 管理器开关 LoRA、
 * 用 TriggerWord Toggle 加触发词。这些值都写死在导出的 API JSON 里，手机上改不了，
 * 每改一次都得回电脑重新导出粘贴。这里把它们搬进插件：
 *
 * - 前缀/后缀：插件按开关拼到 %prompt% 所在输入的前后；同时把工作流里所有 PromptSelector
 *   的选择清空，避免重复（不用回 ComfyUI 改节点）。
 * - LoRA：改写 LoRA 管理器节点的 loras 列表（开关 + 强度）；触发词由插件按开着的 LoRA 拼到最前，
 *   同时把 TriggerWord Toggle 节点的输出替换成空串，避免重复。
 * - 预览：出图完成后从 /history 里读文本类输出（PreviewAny 的 ui.text），即 ComfyUI 实际使用的提示词。
 *
 * 纯函数模块，只依赖类型；不 import settings（settings 反过来 import 这里的默认值/清洗函数）。
 */

type JsonObject = Record<string, unknown>;
type Workflow = Record<string, JsonObject>;

/** 一条前缀/后缀。 */
export interface PromptSnippet {
  id: string;
  name: string;
  text: string;
  enabled: boolean;
  /** 来自 ComfyUI 爱丽丝词库的条目 id；同步时据此更新而不是重复添加。手动添加的为空。 */
  sourceId?: string;
}

/** 一个 LoRA 开关。 */
export interface LoraToggle {
  name: string;
  strength: number;
  enabled: boolean;
  /** 触发词（插件拼到正向最前）；空 = 无。 */
  trigger: string;
}

/** 存起来的一套 LoRA 组合（只记开关与强度，触发词跟着 LoRA 本身走）。 */
export interface LoraCombo {
  id: string;
  name: string;
  loras: { name: string; strength: number; enabled: boolean }[];
}

export interface ComfyExtras {
  /** 前缀/后缀由插件接管。开着时工作流里 PromptSelector 的选择会被清空。 */
  snippetsEnabled: boolean;
  prefixes: PromptSnippet[];
  suffixes: PromptSnippet[];
  /** LoRA 由插件接管。开着时改写 LoRA 管理器节点、屏蔽触发词节点。 */
  lorasEnabled: boolean;
  loras: LoraToggle[];
  combos: LoraCombo[];
}

export const LORA_LOADER_CLASS = 'Lora Loader (LoraManager)';
export const TRIGGER_TOGGLE_CLASS = 'TriggerWord Toggle (LoraManager)';
export const PROMPT_SELECTOR_CLASS = 'PromptSelector';

export function extrasDefaults(): ComfyExtras {
  return { snippetsEnabled: false, prefixes: [], suffixes: [], lorasEnabled: false, loras: [], combos: [] };
}

let idSeq = 0;
export function newExtraId(prefix = 'sn'): string {
  idSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSeq}`;
}

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function str(value: unknown, def = ''): string {
  return typeof value === 'string' ? value : def;
}

function num(value: unknown, def: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : def;
}

function normalizeSnippet(raw: unknown): PromptSnippet {
  const o = isObject(raw) ? raw : {};
  return {
    id: str(o.id) || newExtraId(),
    name: str(o.name),
    text: str(o.text),
    enabled: o.enabled !== false,
    ...(str(o.sourceId) ? { sourceId: str(o.sourceId) } : {}),
  };
}

function normalizeLora(raw: unknown): LoraToggle {
  const o = isObject(raw) ? raw : {};
  return {
    name: str(o.name),
    strength: num(o.strength, 1),
    enabled: o.enabled === true,
    trigger: str(o.trigger),
  };
}

function normalizeCombo(raw: unknown): LoraCombo {
  const o = isObject(raw) ? raw : {};
  const loras = Array.isArray(o.loras) ? o.loras : [];
  return {
    id: str(o.id) || newExtraId('combo'),
    name: str(o.name),
    loras: loras.map(item => {
      const l = isObject(item) ? item : {};
      return { name: str(l.name), strength: num(l.strength, 1), enabled: l.enabled === true };
    }),
  };
}

/** 设置清洗：缺字段一律回默认，老配置没有 extras 时得到全关的空配置（行为与原版完全一致）。 */
export function normalizeExtras(raw: unknown): ComfyExtras {
  const o = isObject(raw) ? raw : {};
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  return {
    snippetsEnabled: o.snippetsEnabled === true,
    prefixes: list(o.prefixes).map(normalizeSnippet),
    suffixes: list(o.suffixes).map(normalizeSnippet),
    lorasEnabled: o.lorasEnabled === true,
    loras: list(o.loras).map(normalizeLora),
    combos: list(o.combos).map(normalizeCombo),
  };
}

export function cloneExtras(extras: ComfyExtras): ComfyExtras {
  return JSON.parse(JSON.stringify(extras)) as ComfyExtras;
}

/* ============ 拼接 ============ */

/** 开着的触发词，按 LoRA 顺序，逗号连接。 */
export function activeTriggers(extras: ComfyExtras): string {
  if (!extras.lorasEnabled) return '';
  return extras.loras
    .filter(l => l.enabled && l.name.trim() && l.trigger.trim())
    .map(l => l.trigger.trim())
    .join(', ');
}

function joinSnippets(list: PromptSnippet[]): string {
  return list
    .filter(s => s.enabled && s.text.trim())
    .map(s => s.text.trim())
    .join('\n');
}

/** 拼到 %prompt% 所在输入前面的内容：触发词 + 开着的前缀。 */
export function headText(extras: ComfyExtras): string {
  return [activeTriggers(extras), extras.snippetsEnabled ? joinSnippets(extras.prefixes) : '']
    .filter(Boolean)
    .join('\n');
}

/** 拼到 %prompt% 所在输入后面的内容：开着的后缀。 */
export function tailText(extras: ComfyExtras): string {
  return extras.snippetsEnabled ? joinSnippets(extras.suffixes) : '';
}

/** 插件是否对工作流做任何改写（全关时工作流原样提交，等同原版）。 */
export function extrasActive(extras: ComfyExtras | undefined): extras is ComfyExtras {
  return !!extras && (extras.snippetsEnabled || extras.lorasEnabled);
}

/** 不改 LoRA 文件名里的特殊字符，强度保留两位（LoRA 管理器存的就是 "0.80" 这种字符串）。 */
function strengthText(value: number): string {
  return value.toFixed(2);
}

/**
 * 在**未替换占位符**的工作流上施加插件侧改写（就地修改传入对象）：
 * 1. 含 %prompt% 的字符串输入：前面接触发词+前缀，后面接后缀；
 * 2. 接管前后缀时：清空所有 PromptSelector 的选择；
 * 3. 接管 LoRA 时：改写 LoRA 管理器节点 loras/text，并把 TriggerWord Toggle 的输出连线替换成空串。
 */
export function applyExtras(workflow: Workflow, extras: ComfyExtras): void {
  const head = headText(extras);
  const tail = tailText(extras);
  // 只包第一个含 %prompt% 的输入：多处引用时重复拼前缀会让前缀出现两遍
  let wrapped = false;

  for (const node of Object.values(workflow)) {
    if (!isObject(node) || !isObject(node.inputs)) continue;
    const inputs = node.inputs;

    // 1. 包 %prompt%
    if ((head || tail) && !wrapped) {
      for (const [key, value] of Object.entries(inputs)) {
        if (typeof value === 'string' && value.includes('%prompt%')) {
          inputs[key] = [head, value, tail].filter(Boolean).join('\n');
          wrapped = true;
          break;
        }
      }
    }

    // 2. 清空词库选择
    if (extras.snippetsEnabled && node.class_type === PROMPT_SELECTOR_CLASS) {
      const raw = inputs.selection_payload_json;
      if (typeof raw === 'string') {
        try {
          const payload = JSON.parse(raw) as JsonObject;
          payload.selections = [];
          inputs.selection_payload_json = JSON.stringify(payload);
        } catch {
          /* 格式不认识就不动 */
        }
      }
    }

    // 3. LoRA 管理器
    if (extras.lorasEnabled && node.class_type === LORA_LOADER_CLASS) {
      const list = extras.loras
        .filter(l => l.name.trim())
        .map(l => ({
          name: l.name.trim(),
          strength: strengthText(l.strength),
          active: l.enabled,
          expanded: false,
          clipStrength: strengthText(l.strength),
          selected: false,
          locked: false,
        }));
      inputs.loras = { __value__: list };
      inputs.text = list.map(l => `<lora:${l.name}:${l.strength}>`).join(' ');
    }
  }

  // 3b. 屏蔽触发词节点：把引用它输出的连线换成空串
  if (extras.lorasEnabled) {
    const toggles = new Set(
      Object.entries(workflow)
        .filter(([, node]) => isObject(node) && node.class_type === TRIGGER_TOGGLE_CLASS)
        .map(([id]) => id),
    );
    if (toggles.size) {
      for (const node of Object.values(workflow)) {
        if (!isObject(node) || !isObject(node.inputs)) continue;
        for (const [key, value] of Object.entries(node.inputs)) {
          if (Array.isArray(value) && value.length === 2 && toggles.has(String(value[0]))) {
            node.inputs[key] = '';
          }
        }
      }
    }
  }
}

/* ============ 从工作流导入 ============ */

export interface ImportedExtras {
  prefixes: PromptSnippet[];
  suffixes: PromptSnippet[];
  loras: LoraToggle[];
}

function nodeTitle(node: JsonObject): string {
  return isObject(node._meta) ? str(node._meta.title) : '';
}

function snippetName(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 18 ? `${flat.slice(0, 18)}…` : flat;
}

function selectorSnippets(node: JsonObject): PromptSnippet[] {
  const inputs = isObject(node.inputs) ? node.inputs : {};
  try {
    const payload = JSON.parse(str(inputs.selection_payload_json, '{}')) as JsonObject;
    const selections = Array.isArray(payload.selections) ? payload.selections : [];
    return selections
      .filter(isObject)
      .map(sel => str(sel.text).trim())
      .filter(Boolean)
      .map(text => ({ id: newExtraId(), name: snippetName(text), text, enabled: true }));
  } catch {
    return [];
  }
}

/**
 * 从粘贴的 API 工作流里读出前后缀与 LoRA 现状。
 * 前缀/后缀按节点标题里的「前缀」「后缀」区分；标题认不出时第一个 PromptSelector 当前缀、其余当后缀。
 */
export function importExtrasFromWorkflow(workflow: Workflow): ImportedExtras {
  const result: ImportedExtras = { prefixes: [], suffixes: [], loras: [] };
  const selectors = Object.entries(workflow)
    .filter(([, node]) => isObject(node) && node.class_type === PROMPT_SELECTOR_CLASS)
    .sort(([a], [b]) => Number(a) - Number(b));
  selectors.forEach(([, node], index) => {
    const title = nodeTitle(node);
    const isSuffix = title.includes('后缀') || /suffix/i.test(title) || (!title.includes('前缀') && !/prefix/i.test(title) && index > 0);
    (isSuffix ? result.suffixes : result.prefixes).push(...selectorSnippets(node));
  });

  for (const node of Object.values(workflow)) {
    if (!isObject(node) || node.class_type !== LORA_LOADER_CLASS || !isObject(node.inputs)) continue;
    const raw = node.inputs.loras;
    const list = isObject(raw) && Array.isArray(raw.__value__) ? raw.__value__ : Array.isArray(raw) ? raw : [];
    for (const item of list) {
      if (!isObject(item) || !str(item.name)) continue;
      result.loras.push({
        name: str(item.name),
        strength: num(item.strength, 1),
        enabled: item.active === true,
        trigger: '',
      });
    }
  }
  return result;
}

/* ============ 与爱丽丝词库同步前缀/后缀 ============ */

export interface PromptLibraryEntry {
  id: string;
  title: string;
  text: string;
  categoryId: string | null;
  position: number;
}

export interface PromptLibraryCategory {
  id: string;
  name: string;
}

/** GET /aaalice/prompt-library/snapshot 的有用部分。 */
export interface PromptLibrarySnapshot {
  categories: PromptLibraryCategory[];
  entries: PromptLibraryEntry[];
}

export function parsePromptLibrary(raw: unknown): PromptLibrarySnapshot {
  const o = isObject(raw) ? raw : {};
  const categories = (Array.isArray(o.categories) ? o.categories : [])
    .filter(isObject)
    .map(c => ({ id: str(c.id), name: str(c.name) }))
    .filter(c => c.id);
  const entries = (Array.isArray(o.entries) ? o.entries : [])
    .filter(isObject)
    .map(e => ({
      id: str(e.id),
      title: str(e.title),
      text: str(e.text),
      categoryId: str(e.categoryId) || null,
      position: num(e.position, 0),
    }))
    .filter(e => e.id);
  return { categories, entries };
}

interface Selection {
  entryId: string;
  text: string;
  weight: number;
}

function selectorSelections(node: JsonObject): Selection[] {
  const inputs = isObject(node.inputs) ? node.inputs : {};
  try {
    const payload = JSON.parse(str(inputs.selection_payload_json, '{}')) as JsonObject;
    const selections = Array.isArray(payload.selections) ? payload.selections : [];
    return selections.filter(isObject).map(sel => ({
      entryId: str(sel.entryId),
      text: str(sel.text).trim(),
      weight: num(sel.weight, 1),
    }));
  } catch {
    return [];
  }
}

/** 与 PromptSelector 同口径：权重 1 原样，否则 (text:w)。 */
function weightedText(text: string, weight: number): string {
  if (weight === 1) return text;
  return `(${text}:${Number(weight.toFixed(2))})`;
}

type Side = 'prefix' | 'suffix';

function selectorSide(title: string, index: number): Side {
  if (title.includes('后缀') || /suffix/i.test(title)) return 'suffix';
  if (title.includes('前缀') || /prefix/i.test(title)) return 'prefix';
  return index > 0 ? 'suffix' : 'prefix';
}

function categorySide(name: string): Side | null {
  if (name.includes('后缀') || /suffix/i.test(name)) return 'suffix';
  if (name.includes('前缀') || /prefix/i.test(name)) return 'prefix';
  return null;
}

export interface SnippetSyncResult {
  prefixes: PromptSnippet[];
  suffixes: PromptSnippet[];
  /** 是否读到了词库（false = 只按工作流里选中的条目同步）。 */
  fromLibrary: boolean;
}

/**
 * 同步前缀/后缀：**替换**而不是追加。
 * - 有词库：「前缀」「后缀」分类里的全部条目都列出来；工作流里选中的按选中顺序排前面并打开，其余关闭。
 * - 没词库：只列工作流里选中的条目（打开）。
 * - 用户手动加的条目（没有 sourceId、内容又不和同步来的重复）保留在末尾；
 *   旧版导入留下的重复条目按内容去重。
 */
export function syncSnippets(
  workflow: Workflow,
  library: PromptLibrarySnapshot | null,
  current: { prefixes: PromptSnippet[]; suffixes: PromptSnippet[] },
): SnippetSyncResult {
  const selected: Record<Side, Selection[]> = { prefix: [], suffix: [] };
  Object.entries(workflow)
    .filter(([, node]) => isObject(node) && node.class_type === PROMPT_SELECTOR_CLASS)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([, node], index) => {
      selected[selectorSide(nodeTitle(node), index)].push(...selectorSelections(node));
    });

  const byId = new Map((library?.entries ?? []).map(e => [e.id, e]));
  const sideOfCategory = new Map<string, Side>();
  for (const c of library?.categories ?? []) {
    const side = categorySide(c.name);
    if (side) sideOfCategory.set(c.id, side);
  }

  const build = (side: Side, existing: PromptSnippet[]): PromptSnippet[] => {
    const oldIds = new Map(existing.filter(s => s.sourceId).map(s => [s.sourceId!, s.id]));
    const out: PromptSnippet[] = [];
    const used = new Set<string>();
    const push = (sourceId: string, name: string, text: string, enabled: boolean) => {
      const key = sourceId || `text:${text}`;
      if (!text || used.has(key)) return;
      used.add(key);
      out.push({ id: oldIds.get(sourceId) ?? newExtraId(), name: name || snippetName(text), text, enabled, ...(sourceId ? { sourceId } : {}) });
    };
    for (const sel of selected[side]) {
      const entry = byId.get(sel.entryId);
      const text = (entry?.text ?? sel.text).trim();
      push(sel.entryId, entry?.title ?? '', weightedText(text, sel.weight), true);
    }
    if (library) {
      library.entries
        .filter(e => e.categoryId && sideOfCategory.get(e.categoryId) === side)
        .sort((a, b) => a.position - b.position)
        .forEach(e => push(e.id, e.title, e.text.trim(), false));
    }
    const syncedTexts = new Set(out.flatMap(s => [s.text, s.text.replace(/^\((.*):[\d.]+\)$/s, '$1')]));
    const seenManual = new Set<string>();
    for (const s of existing) {
      if (s.sourceId) continue;
      const text = s.text.trim();
      if (syncedTexts.has(text) || seenManual.has(text)) continue;
      seenManual.add(text);
      out.push({ ...s });
    }
    return out;
  };

  return {
    prefixes: build('prefix', current.prefixes),
    suffixes: build('suffix', current.suffixes),
    fromLibrary: !!library,
  };
}

/* ============ 出图后预览 ============ */

export interface ComfyTextOutput {
  nodeId: string;
  title: string;
  text: string;
}

/** 从 /history 的任务条目里取所有文本输出（PreviewAny / ShowText 等的 ui.text）。 */
export function extractTextOutputs(item: unknown, workflow?: Workflow): ComfyTextOutput[] {
  if (!isObject(item) || !isObject(item.outputs)) return [];
  const out: ComfyTextOutput[] = [];
  for (const [nodeId, output] of Object.entries(item.outputs)) {
    if (!isObject(output)) continue;
    const text = output.text ?? output.string;
    const values = Array.isArray(text) ? text : typeof text === 'string' ? [text] : [];
    const joined = values.filter(v => typeof v === 'string').join('\n');
    if (!joined) continue;
    const node = workflow?.[nodeId];
    out.push({ nodeId, title: (node && nodeTitle(node)) || `节点 ${nodeId}`, text: joined });
  }
  return out;
}

/** 渲染完的工作流里，含 %prompt% / %negative_prompt% 的那些输入最终发出去的文本。 */
export interface SentTexts {
  positive: string;
  negative: string;
}

/**
 * 记下模板里哪些输入含 %prompt% / %negative_prompt%（在改写、替换之前调用），
 * 替换完成后据此从成品工作流里把它们取出来。
 */
export function locatePromptInputs(workflow: Workflow): { positive: [string, string][]; negative: [string, string][] } {
  const positive: [string, string][] = [];
  const negative: [string, string][] = [];
  for (const [id, node] of Object.entries(workflow)) {
    if (!isObject(node) || !isObject(node.inputs)) continue;
    for (const [key, value] of Object.entries(node.inputs)) {
      if (typeof value !== 'string') continue;
      if (value.includes('%prompt%') || value.includes('%nl%')) positive.push([id, key]);
      if (value.includes('%negative_prompt%')) negative.push([id, key]);
    }
  }
  return { positive, negative };
}

export function readInputs(workflow: Workflow, refs: [string, string][]): string {
  return refs
    .map(([id, key]) => {
      const node = workflow[id];
      const value = isObject(node) && isObject(node.inputs) ? node.inputs[key] : undefined;
      return typeof value === 'string' ? value : '';
    })
    .filter(Boolean)
    .join('\n');
}
