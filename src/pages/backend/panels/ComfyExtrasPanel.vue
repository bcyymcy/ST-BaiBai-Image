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
  tailText,
  type LoraToggle,
  type PromptSnippet,
} from '@/backends/comfyExtras';
import { fetchComfyModelLists } from '@/backends/comfyObjectInfo';
import { parseWorkflowTemplate } from '@/backends/comfyui';
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

function importFromWorkflow(kind: 'snippets' | 'loras') {
  try {
    const imported = importExtrasFromWorkflow(parseWorkflowTemplate(active.value.workflow));
    if (kind === 'snippets') {
      if (!imported.prefixes.length && !imported.suffixes.length) {
        toastr.info('工作流里没找到前缀/后缀词库节点（PromptSelector），或它们没有选中任何条目', '柏宝绘');
        return;
      }
      extras.value.prefixes.push(...imported.prefixes);
      extras.value.suffixes.push(...imported.suffixes);
      extras.value.snippetsEnabled = true;
      toastr.success(`已导入前缀 ${imported.prefixes.length} 条、后缀 ${imported.suffixes.length} 条，并开启接管`, '柏宝绘');
    } else {
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

function addSnippet(list: PromptSnippet[]) {
  list.push({ id: newExtraId(), name: '', text: '', enabled: true });
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
        开启后，打开的前缀拼在主提示词前面、后缀拼在后面；工作流里词库节点（PromptSelector）的选择会自动清空，不会重复。
      </p>
      <div class="ex-tools">
        <button class="bbi-btn bbi-btn-sm" type="button" :disabled="!active.workflow.trim()" @click="importFromWorkflow('snippets')">
          <Icon name="plus" :size="12" />
          从工作流导入
        </button>
      </div>

      <section v-for="group in ([['前缀', extras.prefixes], ['后缀', extras.suffixes]] as const)" :key="group[0]" class="ex-group">
        <div class="ex-group-head">
          <span class="bbi-field-label">{{ group[0] }}</span>
          <button class="bbi-icon-btn ex-op" type="button" :title="`添加${group[0]}`" @click="addSnippet(group[1])">
            <Icon name="plus" :size="14" />
          </button>
        </div>
        <p v-if="!group[1].length" class="bbi-field-hint">还没有{{ group[0] }}。</p>
        <div v-for="(item, index) in group[1]" :key="item.id" class="ex-snippet">
          <div class="ex-snippet-head">
            <input v-model="item.enabled" type="checkbox" class="bbi-checkbox" :title="item.enabled ? '已开启' : '已关闭'" />
            <input v-model="item.name" class="bbi-input ex-name" type="text" placeholder="名字" />
            <button class="bbi-icon-btn ex-op" type="button" title="上移" :disabled="index === 0" @click="move(group[1], index, -1)">↑</button>
            <button class="bbi-icon-btn ex-op" type="button" title="下移" :disabled="index === group[1].length - 1" @click="move(group[1], index, 1)">↓</button>
            <button class="bbi-icon-btn ex-op ex-remove" type="button" title="删除" @click="remove(group[1], index)">
              <Icon name="trash" :size="14" />
            </button>
          </div>
          <BbiTextarea v-model="item.text" :rows="2" :max-rows="6" placeholder="内容，例如 masterpiece, best quality" />
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
          <span class="bbi-field-label">出图前预计（插件拼接部分）</span>
          <button class="bbi-btn bbi-btn-sm" type="button" @click="copyText(predicted, '已复制')">复制</button>
        </div>
        <pre class="ex-pre">{{ predicted }}</pre>
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
              <button class="bbi-btn bbi-btn-sm" type="button" @click="copyText(output.text, '已复制')">复制</button>
            </div>
            <pre class="ex-pre">{{ output.text }}</pre>
          </div>
          <p v-if="!actual.outputs.length" class="bbi-field-hint">
            ComfyUI 没回传文本。想看最终全文，在工作流里把最终提示词接一个「预览任意」(PreviewAny) 节点。
          </p>
          <div class="ex-actual">
            <div class="ex-group-head">
              <span class="ex-label">发送的正向输入</span>
              <button class="bbi-btn bbi-btn-sm" type="button" @click="copyText(actual.sentPositive, '已复制')">复制</button>
            </div>
            <pre class="ex-pre">{{ actual.sentPositive || '（空）' }}</pre>
          </div>
          <div class="ex-actual">
            <div class="ex-group-head">
              <span class="ex-label">发送的负面输入</span>
              <button v-if="actual.sentNegative" class="bbi-btn bbi-btn-sm" type="button" @click="copyText(actual.sentNegative, '已复制')">复制</button>
            </div>
            <pre class="ex-pre">{{ actual.sentNegative || '（工作流没有 %negative_prompt%，负面词全是工作流里写死的）' }}</pre>
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
.ex-remove:not(:disabled) {
  color: var(--bbi-danger);
}
</style>
