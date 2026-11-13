<script setup lang="ts">
/**
 * 【bcy 修改版】自定义工作流的「前缀/后缀」「LoRA」「工作流预览」三个折叠区。
 * 数据都挂在当前工作流预设的 extras 上(见 backends/comfyExtras.ts),随预设切换/复制。
 */
import {
  activeTriggers,
  headText,
  importExtrasFromWorkflow,
  newExtraId,
  parsePromptLibrary,
  readNegativeText,
  applyExtras,
  cloneExtras,
  extrasActive,
  syncSnippets,
  type PromptLibrarySnapshot,
  tailText,
  type LoraToggle,
  type PromptSnippet,
} from '@/backends/comfyExtras';
import { fetchComfyModelLists } from '@/backends/comfyObjectInfo';
import { parseWorkflowTemplate, renderWorkflowTemplate } from '@/backends/comfyui';
import { cachedTranslation, translatePrompt, type TranslateDirection } from '@/api/translate';
import BbiCombo from '@/components/BbiCombo.vue';
import BbiTextarea from '@/components/BbiTextarea.vue';
import Collapsible from '@/components/Collapsible.vue';
import Icon from '@/components/Icon.vue';
import { lastActual, records } from '@/state/history';
import { activeComfyPreset, settings } from '@/state/settings';
import { copyText } from '@/st/clipboard';
import { computed, ref } from 'vue';

const active = computed(() => activeComfyPreset());
const extras = computed(() => active.value.extras);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* ============ 从工作流导入 ============ */

/** 读 ComfyUI 爱丽丝词库(只读);连不上返回 null,退回只按工作流里选中的同步。 */
async function fetchPromptLibrary(): Promise<PromptLibrarySnapshot | null> {
  const base = settings.comfyui.url.trim().replace(/\/+$/, '');
  if (!base) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${base}/aaalice/prompt-library/snapshot`, { signal: controller.signal });
    if (!response.ok) return null;
    return parsePromptLibrary(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const syncingSnippets = ref(false);

async function syncSnippetsFromComfy() {
  if (syncingSnippets.value) return;
  syncingSnippets.value = true;
  try {
    const workflow = parseWorkflowTemplate(active.value.workflow);
    const library = await fetchPromptLibrary();
    const result = syncSnippets(workflow, library, extras.value);
    if (!result.prefixes.length && !result.suffixes.length) {
      toastr.info('工作流里没找到前缀/后缀词库节点（PromptSelector），也没读到词库', '柏宝绘');
      return;
    }
    extras.value.prefixes = result.prefixes;
    extras.value.suffixes = result.suffixes;
    extras.value.snippetsEnabled = true;
    const on = (list: PromptSnippet[]) => list.filter(s => s.enabled).length;
    const summary = `前缀 ${result.prefixes.length} 条（开 ${on(result.prefixes)}）、后缀 ${result.suffixes.length} 条（开 ${on(result.suffixes)}）`;
    if (result.fromLibrary) {
      toastr.success(`已同步词库：${summary}`, '柏宝绘');
    } else {
      toastr.warning(`连不上 ComfyUI 词库，只同步了工作流里选中的：${summary}`, '柏宝绘');
    }
  } catch (error) {
    toastr.error(errorMessage(error), '同步失败');
  } finally {
    syncingSnippets.value = false;
  }
}

function importFromWorkflow(kind: 'loras') {
  try {
    const imported = importExtrasFromWorkflow(parseWorkflowTemplate(active.value.workflow));
    {
      if (!imported.loras.length) {
        toastr.info('工作流里没找到 LoRA 管理器节点（Lora Loader (LoraManager)）', '柏宝绘');
        return;
      }
      // 已有同名的保留触发词，只更新开关与强度
      for (const lora of imported.loras) {
        const existing = extras.value.loras.find(l => l.name === lora.name);
        if (existing) {
          existing.enabled = lora.enabled;
          existing.strength = lora.strength;
        } else {
          extras.value.loras.push(lora);
        }
      }
      extras.value.lorasEnabled = true;
      toastr.success(`已导入 ${imported.loras.length} 个 LoRA，并开启接管；记得给需要的 LoRA 填触发词`, '柏宝绘');
    }
  } catch (error) {
    toastr.error(errorMessage(error), '导入失败');
  }
}

/* ============ 前缀 / 后缀 ============ */

/** 展开中的条目 id(只显示名字,点开才看内容)。不存设置,刷新后全部收起。 */
const expanded = ref(new Set<string>());

function toggleExpand(id: string) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

const allSnippetIds = computed(() => [...extras.value.prefixes, ...extras.value.suffixes].map(s => s.id));
const allExpanded = computed(
  () => allSnippetIds.value.length > 0 && allSnippetIds.value.every(id => expanded.value.has(id)),
);

function toggleAll() {
  expanded.value = allExpanded.value ? new Set() : new Set(allSnippetIds.value);
}

function addSnippet(list: PromptSnippet[]) {
  const id = newExtraId();
  list.push({ id, name: '', text: '', enabled: true });
  expanded.value = new Set([...expanded.value, id]);
}

/* ============ 翻译(调用「生成 tag 使用」的 API;只给人看,不改发送内容) ============ */

const translating = ref(new Set<string>());
/** 点过「翻译」的位置;译文在 translate.ts 的缓存里,原文变了就自然失配、不再显示。 */
const shownTranslations = ref(new Set<string>());

function isTranslating(slot: string): boolean {
  return translating.value.has(slot);
}

function translationFor(slot: string, text: string): string {
  return shownTranslations.value.has(slot) ? cachedTranslation(text) : '';
}

async function runTranslate(slot: string, text: string, direction: TranslateDirection = 'toZh'): Promise<string> {
  if (!text.trim() || translating.value.has(slot)) return '';
  if (direction === 'toZh' && translationFor(slot, text)) {
    // 再点一次 = 收起译文
    const next = new Set(shownTranslations.value);
    next.delete(slot);
    shownTranslations.value = next;
    return '';
  }
  translating.value = new Set([...translating.value, slot]);
  try {
    const result = await translatePrompt(text, direction);
    if (direction === 'toZh') shownTranslations.value = new Set([...shownTranslations.value, slot]);
    return result;
  } catch (error) {
    toastr.error(errorMessage(error), '翻译失败');
    return '';
  } finally {
    const next = new Set(translating.value);
    next.delete(slot);
    translating.value = next;
  }
}

/** 中文写的前后缀 → 英文提示词,直接替换内容(名字为空时把中文原文当名字)。 */
async function snippetToEnglish(item: PromptSnippet) {
  const source = item.text;
  const result = await runTranslate(`en:${item.id}`, source, 'toEn');
  if (!result) return;
  if (!item.name.trim()) item.name = source.trim().slice(0, 18);
  item.text = result;
  toastr.success('已翻成英文并替换内容', '柏宝绘');
}

function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function move<T>(list: T[], index: number, delta: number) {
  const target = index + delta;
  if (target < 0 || target >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(target, 0, item);
}

function remove<T>(list: T[], index: number) {
  list.splice(index, 1);
}

/* ============ LoRA ============ */

const loraFiles = ref<string[]>([]);
const fetchingLoras = ref(false);
const newLoraName = ref('');

/** LoRA 管理器用的名字 = 文件名去掉目录与扩展名。 */
function loraBaseName(file: string): string {
  const base = file.split(/[\\/]/).pop() ?? file;
  return base.replace(/\.(safetensors|ckpt|pt|bin)$/i, '');
}

async function fetchLoraFiles() {
  if (fetchingLoras.value) return;
  fetchingLoras.value = true;
  try {
    const lists = await fetchComfyModelLists(settings.comfyui.url, { force: true });
    loraFiles.value = lists.loras.map(loraBaseName);
    if (!loraFiles.value.length) {
      toastr.info('没拿到 LoRA 列表（经 ST 转发时拿不到），可以直接手输名字', '柏宝绘');
    } else {
      toastr.success(`已读取 ${loraFiles.value.length} 个 LoRA 文件名`, '柏宝绘');
    }
  } catch (error) {
    toastr.error(errorMessage(error), '读取 LoRA 列表失败');
  } finally {
    fetchingLoras.value = false;
  }
}

function addLora() {
  const name = loraBaseName(newLoraName.value.trim());
  if (!name) return;
  if (extras.value.loras.some(l => l.name === name)) {
    toastr.info('这个 LoRA 已经在列表里了', '柏宝绘');
    return;
  }
  extras.value.loras.push({ name, strength: 0.8, enabled: true, trigger: '' });
  newLoraName.value = '';
}

/** 从 LoRA 管理器取触发词(直连 ComfyUI;失败就让用户手填)。 */
async function fetchTrigger(lora: LoraToggle) {
  try {
    const base = settings.comfyui.url.trim().replace(/\/+$/, '');
    const response = await fetch(`${base}/api/lm/loras/get-trigger-words?name=${encodeURIComponent(lora.name)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { trigger_words?: unknown };
    const words = Array.isArray(data.trigger_words) ? data.trigger_words.filter(w => typeof w === 'string') : [];
    if (!words.length) {
      toastr.info(`「${lora.name}」在 LoRA 管理器里没有记录触发词`, '柏宝绘');
      return;
    }
    lora.trigger = words.join(', ');
  } catch (error) {
    toastr.error(`${errorMessage(error)}（需要电脑上 ComfyUI 开着且允许跨域）`, '读取触发词失败');
  }
}

/* LoRA 组合 */
const comboName = ref('');

function saveCombo() {
  const name = comboName.value.trim() || `组合 ${extras.value.combos.length + 1}`;
  const snapshot = extras.value.loras.map(l => ({ name: l.name, strength: l.strength, enabled: l.enabled }));
  const existing = extras.value.combos.find(c => c.name === name);
  if (existing) existing.loras = snapshot;
  else extras.value.combos.push({ id: newExtraId('combo'), name, loras: snapshot });
  comboName.value = '';
  toastr.success(`已保存 LoRA 组合「${name}」`, '柏宝绘');
}

function applyCombo(id: string) {
  const combo = extras.value.combos.find(c => c.id === id);
  if (!combo) return;
  for (const lora of extras.value.loras) {
    const hit = combo.loras.find(c => c.name === lora.name);
    lora.enabled = !!hit?.enabled;
    if (hit) lora.strength = hit.strength;
  }
  // 组合里有、列表里已删的 LoRA 补回来
  for (const hit of combo.loras) {
    if (!extras.value.loras.some(l => l.name === hit.name)) {
      extras.value.loras.push({ ...hit, trigger: '' });
    }
  }
}

function removeCombo(id: string) {
  const index = extras.value.combos.findIndex(c => c.id === id);
  if (index >= 0) extras.value.combos.splice(index, 1);
}

/* ============ 预览 ============ */

/** 出图前预计:插件侧拼接(触发词 + 前缀 / 主提示词 / 后缀)。主提示词用最近一张图的 AI 输出代入。 */
const predicted = computed(() => {
  const last = records.find(r => r.kind === 'image');
  const main = last && last.kind === 'image'
    ? [last.nl, last.prompt].filter(Boolean).join('\n')
    : '（这里是 AI 写的自然语言 + 标签）';
  return [headText(extras.value), main, tailText(extras.value)].filter(Boolean).join('\n');
});

/**
 * 出图前预计的负面:按插件同样的方式改写工作流、代入最近一张图的 AI 负面词,
 * 再顺着采样器的 negative 口读出最终文字。
 */
const predictedNegative = computed(() => {
  try {
    const template = parseWorkflowTemplate(active.value.workflow);
    if (extrasActive(extras.value)) applyExtras(template, cloneExtras(extras.value));
    const last = records.find(r => r.kind === 'image');
    const rendered = renderWorkflowTemplate(template, {
      prompt: '',
      nl: '',
      negative_prompt: last && last.kind === 'image' ? last.negative : '',
      seed: 0,
      width: 832,
      height: 1216,
    });
    return readNegativeText(rendered).replace(/(,\s*)+$/, '');
  } catch {
    return '';
  }
});

const triggersText = computed(() => activeTriggers(extras.value));

const actual = computed(() => lastActual.value);

function time(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}
</script>

<template>
  <template v-if="active.mode === 'custom'">
    <Collapsible title="前缀 / 后缀" :open="false">
      <label class="bbi-switch-row">
        <span class="bbi-field-label">由插件管理前缀/后缀</span>
        <input v-model="extras.snippetsEnabled" type="checkbox" class="bbi-checkbox" />
      </label>
      <p class="bbi-field-hint ex-hint">
        开启后，打开的前缀拼在主提示词前面、后缀拼在后面；工作流里词库节点（PromptSelector）的选择会自动清空，不会重复。同步会替换列表（手动添加的条目保留）。
      </p>
      <div class="ex-tools">
        <button
          class="bbi-btn bbi-btn-sm"
          type="button"
          :disabled="!active.workflow.trim() || syncingSnippets"
          title="读取电脑 ComfyUI 爱丽丝词库里「前缀」「后缀」分类的全部条目；工作流里选中的打开，其余关闭。重复点只会更新，不会重复添加"
          @click="syncSnippetsFromComfy"
        >
          <Icon name="plus" :size="12" />
          {{ syncingSnippets ? '同步中…' : '从 ComfyUI 同步' }}
        </button>
        <button v-if="allSnippetIds.length" class="bbi-btn bbi-btn-sm" type="button" @click="toggleAll">
          {{ allExpanded ? '全部收起' : '全部展开' }}
        </button>
      </div>

      <section v-for="group in ([['前缀', extras.prefixes], ['后缀', extras.suffixes]] as const)" :key="group[0]" class="ex-group">
        <div class="ex-group-head">
          <span class="bbi-field-label">{{ group[0] }}（开 {{ group[1].filter(s => s.enabled).length }} / 共 {{ group[1].length }}）</span>
          <button class="bbi-icon-btn ex-op" type="button" :title="`添加${group[0]}`" @click="addSnippet(group[1])">
            <Icon name="plus" :size="14" />
          </button>
        </div>
        <p v-if="!group[1].length" class="bbi-field-hint">还没有{{ group[0] }}。</p>
        <div v-for="(item, index) in group[1]" :key="item.id" class="ex-snippet">
          <div class="ex-snippet-head">
            <input v-model="item.enabled" type="checkbox" class="bbi-checkbox" :title="item.enabled ? '已开启' : '已关闭'" />
            <button
              class="ex-name-btn"
              :class="{ 'is-off': !item.enabled }"
              type="button"
              :title="expanded.has(item.id) ? '收起' : item.text"
              @click="toggleExpand(item.id)"
            >
              <span class="ex-caret">{{ expanded.has(item.id) ? '▾' : '▸' }}</span>
              <span class="ex-name-text">{{ item.name || item.text || '（未命名）' }}</span>
            </button>
            <button class="bbi-icon-btn ex-op" type="button" title="上移" :disabled="index === 0" @click="move(group[1], index, -1)">↑</button>
            <button class="bbi-icon-btn ex-op" type="button" title="下移" :disabled="index === group[1].length - 1" @click="move(group[1], index, 1)">↓</button>
            <button class="bbi-icon-btn ex-op ex-remove" type="button" title="删除" @click="remove(group[1], index)">
              <Icon name="trash" :size="14" />
            </button>
          </div>
          <div v-if="expanded.has(item.id)" class="ex-snippet-body">
            <input v-model="item.name" class="bbi-input" type="text" placeholder="名字（只用于显示）" />
            <BbiTextarea v-model="item.text" :rows="2" :max-rows="6" placeholder="内容，例如 masterpiece, best quality；也可以写中文再点「翻成英文」" />
            <div class="ex-tools ex-tools-tight">
              <button
                class="bbi-btn bbi-btn-sm"
                type="button"
                :disabled="!item.text.trim() || isTranslating(`zh:${item.id}`)"
                @click="runTranslate(`zh:${item.id}`, item.text)"
              >
                {{ isTranslating(`zh:${item.id}`) ? '翻译中…' : translationFor(`zh:${item.id}`, item.text) ? '收起译文' : '译成中文' }}
              </button>
              <button
                v-if="hasChinese(item.text)"
                class="bbi-btn bbi-btn-sm"
                type="button"
                :disabled="isTranslating(`en:${item.id}`)"
                title="把中文描述翻成英文提示词，替换内容"
                @click="snippetToEnglish(item)"
              >
                {{ isTranslating(`en:${item.id}`) ? '翻译中…' : '翻成英文' }}
              </button>
            </div>
            <p v-if="translationFor(`zh:${item.id}`, item.text)" class="ex-translation">{{ translationFor(`zh:${item.id}`, item.text) }}</p>
          </div>
        </div>
      </section>
    </Collapsible>

    <Collapsible title="LoRA" :open="false">
      <label class="bbi-switch-row">
        <span class="bbi-field-label">由插件管理 LoRA</span>
        <input v-model="extras.lorasEnabled" type="checkbox" class="bbi-checkbox" />
      </label>
      <p class="bbi-field-hint ex-hint">
        开启后，出图时按下面的开关和强度改写工作流里的 LoRA 管理器节点；打开的 LoRA 的触发词拼在最前面，工作流里的触发词节点自动失效，不会重复。
      </p>
      <div class="ex-tools">
        <button class="bbi-btn bbi-btn-sm" type="button" :disabled="!active.workflow.trim()" @click="importFromWorkflow('loras')">
          <Icon name="plus" :size="12" />
          从工作流导入
        </button>
        <button class="bbi-btn bbi-btn-sm" type="button" :disabled="fetchingLoras" @click="fetchLoraFiles">
          {{ fetchingLoras ? '读取中…' : '读取电脑上的 LoRA' }}
        </button>
      </div>

      <div class="ex-add-row">
        <BbiCombo v-model="newLoraName" :options="loraFiles" placeholder="LoRA 名字（可从列表选）" aria-label="新 LoRA" />
        <button class="bbi-btn bbi-btn-sm" type="button" :disabled="!newLoraName.trim()" @click="addLora">添加</button>
      </div>

      <p v-if="!extras.loras.length" class="bbi-field-hint">还没有 LoRA。</p>
      <div v-for="(lora, index) in extras.loras" :key="lora.name + index" class="ex-lora">
        <div class="ex-lora-head">
          <input v-model="lora.enabled" type="checkbox" class="bbi-checkbox" :title="lora.enabled ? '已开启' : '已关闭'" />
          <span class="ex-lora-name" :title="lora.name">{{ lora.name }}</span>
          <input
            v-model.number="lora.strength"
            class="bbi-input ex-str"
            type="number"
            min="-2"
            max="3"
            step="0.05"
            title="强度"
          />
          <button class="bbi-icon-btn ex-op" type="button" title="上移" :disabled="index === 0" @click="move(extras.loras, index, -1)">↑</button>
          <button class="bbi-icon-btn ex-op ex-remove" type="button" title="删除" @click="remove(extras.loras, index)">
            <Icon name="trash" :size="14" />
          </button>
        </div>
        <div class="ex-trigger-row">
          <input v-model="lora.trigger" class="bbi-input" type="text" placeholder="触发词（可空）" spellcheck="false" />
          <button class="bbi-btn bbi-btn-sm" type="button" title="从 LoRA 管理器读取触发词" @click="fetchTrigger(lora)">读取</button>
        </div>
      </div>
      <p v-if="triggersText" class="bbi-field-hint">当前触发词：{{ triggersText }}</p>

      <section class="ex-group">
        <div class="ex-group-head">
          <span class="bbi-field-label">LoRA 组合</span>
        </div>
        <div class="ex-add-row">
          <input v-model="comboName" class="bbi-input" type="text" placeholder="组合名字（同名覆盖）" />
          <button class="bbi-btn bbi-btn-sm" type="button" :disabled="!extras.loras.length" @click="saveCombo">保存当前</button>
        </div>
        <div v-for="combo in extras.combos" :key="combo.id" class="ex-combo">
          <span class="ex-combo-name">{{ combo.name }}</span>
          <span class="ex-combo-detail">
            {{ combo.loras.filter(l => l.enabled).map(l => `${l.name}×${l.strength}`).join('、') || '全关' }}
          </span>
          <button class="bbi-btn bbi-btn-sm" type="button" @click="applyCombo(combo.id)">切换</button>
          <button class="bbi-icon-btn ex-op ex-remove" type="button" title="删除组合" @click="removeCombo(combo.id)">
            <Icon name="trash" :size="14" />
          </button>
        </div>
      </section>
    </Collapsible>

    <Collapsible title="工作流预览" :open="false">
      <section class="ex-group">
        <div class="ex-group-head">
          <span class="bbi-field-label">出图前预计 · 正向</span>
          <span class="ex-btns">
            <button class="bbi-btn bbi-btn-sm" type="button" :disabled="isTranslating('pred-pos')" @click="runTranslate('pred-pos', predicted)">
              {{ isTranslating('pred-pos') ? '翻译中…' : translationFor('pred-pos', predicted) ? '收起译文' : '翻译' }}
            </button>
            <button class="bbi-btn bbi-btn-sm" type="button" @click="copyText(predicted, '已复制')">复制</button>
          </span>
        </div>
        <pre class="ex-pre">{{ predicted }}</pre>
        <p v-if="translationFor('pred-pos', predicted)" class="ex-translation">{{ translationFor('pred-pos', predicted) }}</p>
        <div class="ex-group-head ex-sub-head">
          <span class="bbi-field-label">出图前预计 · 负面</span>
          <span v-if="predictedNegative" class="ex-btns">
            <button class="bbi-btn bbi-btn-sm" type="button" :disabled="isTranslating('pred-neg')" @click="runTranslate('pred-neg', predictedNegative)">
              {{ isTranslating('pred-neg') ? '翻译中…' : translationFor('pred-neg', predictedNegative) ? '收起译文' : '翻译' }}
            </button>
            <button class="bbi-btn bbi-btn-sm" type="button" @click="copyText(predictedNegative, '已复制')">复制</button>
          </span>
        </div>
        <pre class="ex-pre">{{ predictedNegative || '（没读到：负面那一路可能经过了拼接节点，以出图后的实际值为准）' }}</pre>
        <p v-if="translationFor('pred-neg', predictedNegative)" class="ex-translation">{{ translationFor('pred-neg', predictedNegative) }}</p>
        <p class="bbi-field-hint">
          主提示词用最近一张图的 AI 输出代入。工作流里如果还有别的固定文字（例如没交给插件管的前缀节点），以出图后的实际值为准。
        </p>
      </section>

      <section class="ex-group">
        <div class="ex-group-head">
          <span class="bbi-field-label">最近一次实际</span>
          <span v-if="actual" class="bbi-field-hint ex-meta">
            {{ time(actual.at) }} · 第 {{ actual.floor }} 楼 · 种子 {{ actual.seed }} · {{ actual.model }}
          </span>
        </div>
        <p v-if="!actual" class="bbi-field-hint">本次打开酒馆后还没有出过图。出完一张就能在这里看到 ComfyUI 实际用的提示词。</p>
        <template v-else>
          <div v-for="output in actual.outputs" :key="output.nodeId" class="ex-actual">
            <div class="ex-group-head">
              <span class="ex-label">ComfyUI 回传 · {{ output.title }}</span>
              <span class="ex-btns">
            <button class="bbi-btn bbi-btn-sm" type="button" :disabled="isTranslating(`out:${output.nodeId}`)" @click="runTranslate(`out:${output.nodeId}`, output.text)">
              {{ isTranslating(`out:${output.nodeId}`) ? '翻译中…' : translationFor(`out:${output.nodeId}`, output.text) ? '收起译文' : '翻译' }}
            </button>
            <button class="bbi-btn bbi-btn-sm" type="button" @click="copyText(output.text, '已复制')">复制</button>
          </span>
            </div>
            <pre class="ex-pre">{{ output.text }}</pre>
            <p v-if="translationFor(`out:${output.nodeId}`, output.text)" class="ex-translation">{{ translationFor(`out:${output.nodeId}`, output.text) }}</p>
          </div>
          <p v-if="!actual.outputs.length" class="bbi-field-hint">
            ComfyUI 没回传文本。想看最终全文，在工作流里把最终提示词接一个「预览任意」(PreviewAny) 节点。
          </p>
          <div class="ex-actual">
            <div class="ex-group-head">
              <span class="ex-label">发送的正向输入</span>
              <span v-if="actual.sentPositive" class="ex-btns">
            <button class="bbi-btn bbi-btn-sm" type="button" :disabled="isTranslating('act-pos')" @click="runTranslate('act-pos', actual.sentPositive)">
              {{ isTranslating('act-pos') ? '翻译中…' : translationFor('act-pos', actual.sentPositive) ? '收起译文' : '翻译' }}
            </button>
            <button class="bbi-btn bbi-btn-sm" type="button" @click="copyText(actual.sentPositive, '已复制')">复制</button>
          </span>
            </div>
            <pre class="ex-pre">{{ actual.sentPositive || '（空）' }}</pre>
            <p v-if="translationFor('act-pos', actual.sentPositive)" class="ex-translation">{{ translationFor('act-pos', actual.sentPositive) }}</p>
          </div>
          <div class="ex-actual">
            <div class="ex-group-head">
              <span class="ex-label">发送的负面输入</span>
              <span v-if="actual.sentNegative" class="ex-btns">
            <button class="bbi-btn bbi-btn-sm" type="button" :disabled="isTranslating('act-neg')" @click="runTranslate('act-neg', actual.sentNegative)">
              {{ isTranslating('act-neg') ? '翻译中…' : translationFor('act-neg', actual.sentNegative) ? '收起译文' : '翻译' }}
            </button>
            <button class="bbi-btn bbi-btn-sm" type="button" @click="copyText(actual.sentNegative, '已复制')">复制</button>
          </span>
            </div>
            <pre class="ex-pre">{{ actual.sentNegative || '（工作流没有 %negative_prompt%，负面词全是工作流里写死的）' }}</pre>
            <p v-if="translationFor('act-neg', actual.sentNegative)" class="ex-translation">{{ translationFor('act-neg', actual.sentNegative) }}</p>
          </div>
        </template>
      </section>
    </Collapsible>
  </template>
</template>

<style scoped>
.ex-hint {
  margin: 2px 0 6px;
}
.ex-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 0 8px;
}
.ex-group {
  padding: 8px 0 2px;
}
.ex-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 6px;
  margin-bottom: 6px;
  border-bottom: 1px dashed var(--bbi-line);
}
.ex-snippet,
.ex-lora,
.ex-actual {
  display: grid;
  gap: 6px;
  padding: 6px 0;
}
.ex-snippet-head,
.ex-lora-head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 8px;
}
.ex-lora-head {
  grid-template-columns: auto minmax(0, 1fr) 72px auto auto;
}
.ex-lora-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.ex-str {
  width: 72px;
}
.ex-trigger-row,
.ex-add-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 2px 0 4px;
}
.ex-combo {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
  padding: 4px 0;
}
.ex-combo-name {
  font-weight: 600;
  white-space: nowrap;
}
.ex-combo-detail,
.ex-meta {
  color: var(--bbi-ink-soft);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ex-label {
  color: var(--bbi-ink-soft);
  font-size: 12px;
}
.ex-pre {
  margin: 0;
  padding: 8px 10px;
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.5;
  background: var(--bbi-surface-2, rgba(127, 127, 127, 0.08));
  border-radius: var(--bbi-radius-sm);
}
.ex-op {
  width: 30px;
  height: 30px;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--bbi-radius-sm);
  background: transparent;
  color: var(--bbi-ink-soft);
  cursor: pointer;
}
.ex-op:disabled {
  opacity: 0.4;
  cursor: default;
}
.ex-snippet-body {
  display: grid;
  gap: 6px;
  padding: 2px 0 6px 28px;
}
.ex-name-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 4px 2px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.ex-name-btn.is-off {
  color: var(--bbi-ink-soft);
}
.ex-caret {
  flex: none;
  width: 12px;
  color: var(--bbi-ink-soft);
}
.ex-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ex-tools-tight {
  padding: 0;
}
.ex-btns {
  display: inline-flex;
  gap: 6px;
}
.ex-sub-head {
  margin-top: 10px;
}
.ex-translation {
  margin: 0;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  color: var(--bbi-ink-soft);
  border-left: 2px solid var(--bbi-line);
}
.ex-remove:not(:disabled) {
  color: var(--bbi-danger);
}
</style>
