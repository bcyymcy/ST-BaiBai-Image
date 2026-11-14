<script setup lang="ts">
import { computed, reactive, ref } from 'vue';

import { cachedTranslation, translatePrompt } from '@/api/translate';
import BbiTextarea from '@/components/BbiTextarea.vue';
import { saveExternalImage } from '@/floor/storage';
import { expandIdea, freeGenNegativeOn, type FreeGenPrompt } from '@/freeGen/expand';
import { backendStatus, decideSeed, generateImage } from '@/generate';
import { beginImage, failImage, finishImage, safeHistory, setImageActual } from '@/state/history';
import { activeComfyPreset, settings } from '@/state/settings';
import { getContext } from '@/st/context';
import { serializeImageTag } from '@/st/imageTagRegex';
import { copyText } from '@/st/clipboard';

/**
 * 【bcy 修改版】自由生图页:一句想法 → AI 扩写 → (可检查修改) → 出图进图库。
 * 不碰聊天记录;页面状态放模块级,切页不丢,刷新清空。
 */

interface Shot extends FreeGenPrompt {
  id: number;
  status: 'idle' | 'running' | 'done' | 'error';
  error: string;
  images: string[];
  showZh: boolean;
}

const state = reactive({
  idea: '',
  count: 1,
  useCard: true,
  useLibrary: true,
  review: true,
  folder: '',
  expanding: false,
  shots: [] as Shot[],
});
let nextShotId = 1;
let expandController: AbortController | null = null;

const status = computed(() => backendStatus());
const nlOn = computed(() => (settings.defaultBackend === 'comfyui' ? activeComfyPreset().naturalLanguage || activeComfyPreset().promptStyle === 'moss' : settings.nai.naturalLanguage));
const negativeOn = computed(() => freeGenNegativeOn());
const defaultFolder = computed(() => getContext()?.name2?.trim() || '自由生图');
const busy = computed(() => state.expanding || state.shots.some(s => s.status === 'running'));

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function expand() {
  if (!state.idea.trim() || state.expanding) return;
  expandController = new AbortController();
  state.expanding = true;
  try {
    const plan = await expandIdea(
      { idea: state.idea, count: state.count, useCard: state.useCard, useLibrary: state.useLibrary },
      expandController.signal,
    );
    state.shots = plan.map(p => ({ ...p, id: nextShotId++, status: 'idle', error: '', images: [], showZh: false }));
    if (!state.review) await generateAll();
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      toastr.error(errorMessage(error), '自由生图·扩写失败');
    }
  } finally {
    state.expanding = false;
    expandController = null;
  }
}

function cancelExpand() {
  expandController?.abort();
}

async function generateShot(shot: Shot) {
  if (shot.status === 'running') return;
  if (!status.value.configured) {
    toastr.error(status.value.reason || '出图后端未配置', '柏宝绘');
    return;
  }
  const prompt = shot.tag.trim() || shot.nl.trim();
  if (!prompt) {
    toastr.warning('这张图的提示词是空的', '柏宝绘');
    return;
  }
  shot.status = 'running';
  shot.error = '';
  const seed = decideSeed(settings.defaultBackend);
  const backend = status.value.backend === 'nai' ? 'nai' : 'comfyui';
  const historyId = safeHistory(() =>
    beginImage({
      backend,
      model: status.value.model,
      prompt,
      nl: shot.nl,
      negative: shot.negative,
      characters: shot.characters,
      seed,
      size: shot.size,
      floor: -1,
      seq: shot.id - 1,
    }),
  );
  try {
    const output = await generateImage({
      prompt,
      nl: shot.nl,
      negative: shot.negative,
      characters: shot.characters,
      size: shot.size,
      seed,
    });
    const { result } = output;
    try {
      const tag = serializeImageTag({
        tag: prompt,
        nl: shot.nl,
        negative: shot.negative,
        characters: shot.characters,
        size: output.size,
      });
      const path = await saveExternalImage(state.folder.trim() || defaultFolder.value, tag, output.seed, result, output.meta);
      shot.images.unshift(path);
    } finally {
      result.revoke();
    }
    if (historyId !== null) safeHistory(() => finishImage(historyId));
    safeHistory(() => setImageActual(historyId, result.preview));
    shot.status = 'done';
  } catch (error) {
    shot.status = 'error';
    shot.error = errorMessage(error);
    if (historyId !== null) safeHistory(() => failImage(historyId, shot.error));
    toastr.error(shot.error, '自由生图·出图失败');
  }
}

async function generateAll() {
  // 一张一张来:ComfyUI 本身也是排队画,并发发出去只会让失败更难看清
  for (const shot of state.shots) await generateShot(shot);
}

function removeShot(shot: Shot) {
  state.shots = state.shots.filter(s => s.id !== shot.id);
}

function addBlankShot() {
  state.shots.push({
    id: nextShotId++,
    summary: '',
    tag: '',
    nl: '',
    negative: '',
    characters: [],
    size: 'portrait',
    status: 'idle',
    error: '',
    images: [],
    showZh: false,
  });
}

const translating = ref(new Set<number>());

function shotText(shot: Shot): string {
  return [shot.tag, shot.nl].filter(s => s.trim()).join('\n\n');
}

async function toggleTranslate(shot: Shot) {
  if (shot.showZh) {
    shot.showZh = false;
    return;
  }
  const text = shotText(shot);
  if (!text) return;
  translating.value = new Set([...translating.value, shot.id]);
  try {
    await translatePrompt(text, 'toZh');
    shot.showZh = true;
  } catch (error) {
    toastr.error(errorMessage(error), '翻译失败');
  } finally {
    const next = new Set(translating.value);
    next.delete(shot.id);
    translating.value = next;
  }
}

const viewing = ref('');
</script>

<template>
  <section class="bbi-page">
    <div class="bbi-page-head">
      <h2 class="bbi-title bbi-title-sub">自由生图</h2>
    </div>
    <hr class="bbi-rule" />

    <div class="fg-box">
      <BbiTextarea
        v-model="state.idea"
        :rows="3"
        :max-rows="10"
        placeholder="写一句画面想法就行，例如：user 和 小雪 在房间里睡觉"
      />
      <p class="bbi-field-hint">
        AI 会按你在设置里的「ComfyUI 规范」把这句话扩写成完整画面（场景、光线、姿势、表情、服装、构图），再用当前工作流出图。图片只存进图库，不进聊天。
      </p>

      <div class="fg-row">
        <span class="bbi-field-label">张数</span>
        <div class="fg-count">
          <button
            v-for="n in 4"
            :key="n"
            class="bbi-seg"
            :class="{ 'is-on': state.count === n }"
            type="button"
            @click="state.count = n"
          >
            {{ n }}
          </button>
        </div>
      </div>
      <label class="bbi-switch-row">
        <span class="bbi-field-label">带上角色卡和主角人设</span>
        <input v-model="state.useCard" type="checkbox" class="bbi-checkbox" />
      </label>
      <label class="bbi-switch-row">
        <span class="bbi-field-label">照抄角色库外貌</span>
        <input v-model="state.useLibrary" type="checkbox" class="bbi-checkbox" />
      </label>
      <label class="bbi-switch-row">
        <span class="bbi-field-label">出图前先让我检查提示词</span>
        <input v-model="state.review" type="checkbox" class="bbi-checkbox" />
      </label>
      <label class="fg-row">
        <span class="bbi-field-label">存到图库分组</span>
        <input v-model="state.folder" class="bbi-input fg-folder" type="text" :placeholder="defaultFolder" />
      </label>
      <p v-if="!status.configured" class="fg-warn">出图后端还没配好：{{ status.reason }}</p>

      <div class="fg-actions">
        <button
          class="bbi-btn bbi-btn-primary"
          type="button"
          :disabled="!state.idea.trim() || state.expanding"
          @click="expand"
        >
          {{ state.expanding ? 'AI 扩写中…' : state.review ? '扩写提示词' : '扩写并出图' }}
        </button>
        <button v-if="state.expanding" class="bbi-btn" type="button" @click="cancelExpand">取消</button>
      </div>
    </div>

    <template v-if="state.shots.length">
      <div class="fg-list-head">
        <span class="bbi-field-label">画面（{{ state.shots.length }}）</span>
        <span class="fg-list-ops">
          <button class="bbi-btn bbi-btn-sm" type="button" @click="addBlankShot">手动加一张</button>
          <button class="bbi-btn bbi-btn-sm bbi-btn-primary" type="button" :disabled="busy" @click="generateAll">全部出图</button>
        </span>
      </div>

      <div v-for="(shot, index) in state.shots" :key="shot.id" class="fg-shot">
        <div class="fg-shot-head">
          <strong>第 {{ index + 1 }} 张</strong>
          <span class="fg-summary">{{ shot.summary }}</span>
        </div>

        <label class="fg-field">
          <span class="bbi-field-label">标签</span>
          <BbiTextarea v-model="shot.tag" :rows="2" :max-rows="8" />
        </label>
        <label v-if="nlOn || shot.nl" class="fg-field">
          <span class="bbi-field-label">自然语言描述</span>
          <BbiTextarea v-model="shot.nl" :rows="3" :max-rows="12" />
        </label>
        <label v-if="negativeOn || shot.negative" class="fg-field">
          <span class="bbi-field-label">本图负面</span>
          <BbiTextarea v-model="shot.negative" :rows="1" :max-rows="4" />
        </label>
        <p v-if="shot.characters.length" class="bbi-field-hint">
          多角色：{{ shot.characters.map(c => c.name).join('、') }}（仅 NAI 4.5/V5 生效）
        </p>
        <div class="fg-row">
          <span class="bbi-field-label">画幅</span>
          <div class="fg-count">
            <button class="bbi-seg" :class="{ 'is-on': shot.size === 'portrait' }" type="button" @click="shot.size = 'portrait'">竖</button>
            <button class="bbi-seg" :class="{ 'is-on': shot.size === 'landscape' }" type="button" @click="shot.size = 'landscape'">横</button>
          </div>
        </div>

        <p v-if="shot.showZh" class="fg-translation">{{ cachedTranslation(shotText(shot)) }}</p>

        <div class="fg-actions">
          <button
            class="bbi-btn bbi-btn-primary bbi-btn-sm"
            type="button"
            :disabled="shot.status === 'running'"
            @click="generateShot(shot)"
          >
            {{ shot.status === 'running' ? '出图中…' : shot.images.length ? '再出一张' : '出图' }}
          </button>
          <button class="bbi-btn bbi-btn-sm" type="button" :disabled="translating.has(shot.id)" @click="toggleTranslate(shot)">
            {{ translating.has(shot.id) ? '翻译中…' : shot.showZh ? '收起译文' : '翻译' }}
          </button>
          <button class="bbi-btn bbi-btn-sm" type="button" @click="copyText(shotText(shot), '已复制')">复制</button>
          <button class="bbi-btn bbi-btn-sm" type="button" :disabled="shot.status === 'running'" @click="removeShot(shot)">删除</button>
        </div>
        <p v-if="shot.status === 'error'" class="fg-warn">{{ shot.error }}</p>

        <div v-if="shot.images.length" class="fg-images">
          <img v-for="src in shot.images" :key="src" :src="src" alt="" loading="lazy" @click="viewing = src" />
        </div>
      </div>
    </template>

    <div v-if="viewing" class="fg-viewer" @click="viewing = ''">
      <img :src="viewing" alt="" />
    </div>
  </section>
</template>

<style scoped>
.fg-box {
  display: grid;
  gap: 8px;
}
.fg-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.fg-count {
  display: inline-flex;
  gap: 4px;
}
.fg-count .bbi-seg {
  min-width: 36px;
}
.fg-folder {
  max-width: 60%;
}
.fg-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.fg-warn {
  margin: 0;
  color: var(--bbi-danger, #c0392b);
  font-size: 12px;
}
.fg-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16px 0 8px;
}
.fg-list-ops {
  display: inline-flex;
  gap: 6px;
}
.fg-shot {
  display: grid;
  gap: 8px;
  padding: 10px 0 14px;
  border-top: 1px solid var(--bbi-line);
}
.fg-shot-head {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 13px;
}
.fg-summary {
  color: var(--bbi-ink-soft);
}
.fg-field {
  display: grid;
  gap: 4px;
}
.fg-translation {
  margin: 0;
  padding: 6px 10px;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  color: var(--bbi-ink-soft);
  border-left: 2px solid var(--bbi-line);
}
.fg-images {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 6px;
}
.fg-images img {
  width: 100%;
  border-radius: 6px;
  cursor: zoom-in;
}
.fg-viewer {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  cursor: zoom-out;
}
.fg-viewer img {
  max-width: 96vw;
  max-height: 96vh;
  object-fit: contain;
}
</style>
