/**
 * 【bcy 修改版】提示词翻译:调用「生成 tag 使用」的同一个 API。
 * 只用于给人看(前后缀 / 工作流预览),不改任何发出去的内容。
 */
import { requestCompletion, requestViaMainApi, type ChatMsg } from '@/api/client';
import { getTagGenChannel } from '@/state/settings';
import { reactive } from 'vue';

export type TranslateDirection = 'toZh' | 'toEn';

const SYSTEM: Record<TranslateDirection, string> = {
  toZh:
    '你是 AI 绘画提示词翻译器。把用户给出的英文提示词(danbooru 标签、自然语言描述、(词:权重) 写法都可能出现)逐条翻译成简体中文,方便中文用户理解。' +
    '保持原有顺序和分段;标签之间用中文逗号分隔;权重、括号、<lora:...> 等写法原样保留;不要解释、不要补充、不要加引号,只输出译文。',
  toEn:
    '你是 AI 绘画提示词翻译器。把用户给出的中文描述翻译成适合动漫生图模型的英文提示词:能用 danbooru 标签表达的用标签,用英文逗号分隔;' +
    '无法用标签表达的用简洁英文短语。已有的英文、权重写法 (词:1.2) 原样保留。不要解释、不要加引号,只输出提示词本身。',
};

/** 译文缓存:同一段原文同方向只请求一次(会话内)。key = 方向 + 原文。 */
const cache = reactive(new Map<string, string>());
const pending = new Map<string, Promise<string>>();

function cacheKey(direction: TranslateDirection, text: string): string {
  return `${direction}\u0000${text.trim()}`;
}

export function cachedTranslation(text: string, direction: TranslateDirection = 'toZh'): string {
  return cache.get(cacheKey(direction, text)) ?? '';
}

export async function translatePrompt(
  text: string,
  direction: TranslateDirection = 'toZh',
  signal?: AbortSignal,
): Promise<string> {
  const source = text.trim();
  if (!source) return '';
  const key = cacheKey(direction, source);
  const hit = cache.get(key);
  if (hit) return hit;
  const running = pending.get(key);
  if (running) return running;

  const messages: ChatMsg[] = [
    { role: 'system', content: SYSTEM[direction] },
    { role: 'user', content: source },
  ];
  const label = direction === 'toZh' ? '提示词翻译' : '提示词翻成英文';
  const task = (async () => {
    const channel = getTagGenChannel();
    const raw = channel
      ? await requestCompletion(channel, messages, { signal, source: label })
      : await requestViaMainApi(messages, { signal, source: label });
    const result = stripThinking(raw).trim();
    if (!result) throw new Error('翻译结果为空');
    cache.set(key, result);
    return result;
  })();
  pending.set(key, task);
  try {
    return await task;
  } finally {
    pending.delete(key);
  }
}

/** 部分推理模型会把 <think> 段带进正文。 */
export function stripThinking(text: string): string {
  return text.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '').replace(/^```[a-z]*\n?|\n?```$/g, '');
}
