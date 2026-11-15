/**
 * 【bcy 修改版】自由生图:一句简短想法 → AI 扩写成完整画面提示词 → 出图进图库。
 *
 * 与楼层自动 tag 的区别:
 * - 不依附任何楼层,没有 P 位置、不写聊天记录,也不报告 changes(不改角色库);
 * - 书写规范与楼层同源(backendPromptSpec:你在设置里粘的「ComfyUI 规范」),
 *   所以 MOSS 规范、自然语言开关、动态负面词的口径都与平时一致;
 * - 角色卡 / 主角人设 / 角色固定外貌库可选带上,让「user」「xxx」能对上人、外貌不走样。
 */
import { requestCompletion, requestViaMainApi, type ChatMsg } from '@/api/client';
import { buildLibraryText } from '@/autoTag/charAnchors';
import {
  buildCharCardSystem,
  buildPersonaSystem,
  fetchCharCard,
  fetchUserPersona,
} from '@/autoTag/context';
import { autoTagProfile, backendPromptSpec, type AutoTagProfile } from '@/autoTag/prompt';
import { reviewPrompt } from '@/autoTag/reviewPrompt';
import { parseJsonObject, type ImageCharacterPrompt } from '@/autoTag/protocol';
import { templateSupportsNegative } from '@/backends/comfyTemplates';
import { getWorkflowPlaceholders } from '@/backends/comfyui';
import { normalizeOrientation, type Orientation } from '@/backends/size';
import { getContext } from '@/st/context';
import { FORBIDDEN_SUBTAG } from '@/st/imageTagRegex';
import { charTagsBeforeFloor, lockedCharTagNames } from '@/state/charTags';
import { activeComfyPreset, DEFAULT_JAILBREAK_PROMPT, getTagGenChannel, settings } from '@/state/settings';

export interface FreeGenOptions {
  /** 想法原文(可以只有一句话)。 */
  idea: string;
  /** 要几张不同构图的图。 */
  count: number;
  /** 带上当前聊天的角色卡与主角人设。 */
  useCard: boolean;
  /** 带上角色固定外貌库(照抄外貌,人物不走样)。 */
  useLibrary: boolean;
}

/** AI 扩写出的一张图(可在页面上改)。 */
export interface FreeGenPrompt {
  /** 给人看的一句中文画面概述。 */
  summary: string;
  tag: string;
  nl: string;
  negative: string;
  characters: ImageCharacterPrompt[];
  size: Orientation;
}

/** 当前工作流是否吃动态负面词(与楼层自动 tag 同一判据)。 */
export function freeGenNegativeOn(): boolean {
  if (settings.defaultBackend !== 'comfyui') return false;
  const preset = activeComfyPreset();
  if (preset.mode === 'simple') return templateSupportsNegative(preset.simple.template);
  if (!preset.workflow.trim()) return false;
  try {
    return getWorkflowPlaceholders(preset.workflow).includes('negative_prompt');
  } catch {
    return false;
  }
}

function clampCount(count: number): number {
  return Math.min(4, Math.max(1, Math.floor(Number(count)) || 1));
}

/** 组装请求。纯拼接,方便单测。 */
export function buildFreeGenMessages(
  options: FreeGenOptions,
  parts: {
    spec: string;
    profile: AutoTagProfile;
    negativeOn: boolean;
    jailbreak: string;
    charCard: string;
    persona: string;
    library: string;
    userName: string;
    charName: string;
    /** 【bcy】成稿前自查清单,空串 = 不加。 */
    review?: string;
  },
): ChatMsg[] {
  const count = clampCount(options.count);
  const { profile, negativeOn } = parts;
  const sample: Record<string, unknown> = {
    summary: '两人在卧室床上相拥而睡，夜晚台灯暖光',
    tag: '1girl, sleeping, bed, bedroom, night, lamp light',
  };
  if (profile.nl) sample.nl = 'A girl sleeps peacefully on a bed in a dim bedroom...';
  if (profile.naiCharPrompts) {
    sample.characters = [{ name: '角色名', tag: 'girl, long black hair, sleeping', ...(profile.nl ? { nl: 'The girl sleeps on her side.' } : {}) }];
  }
  if (profile.nlOnly) {
    sample.tag = '1girl, 1boy, cowboy shot';
    sample.nl = 'A full-body shot at eye level of two people lying side by side on a bed in a dim bedroom: the girl rests her head on the young man’s chest while his arm holds her shoulders... (first the pose, then one appearance sentence each, one key detail, expressions, clothing, light and background; details never complicate the pose)';
  }
  if (negativeOn) sample.negative = 'standing, outdoors';
  sample.size = profile.lockedSize ?? 'portrait';

  const who = [
    parts.userName ? `「user」「我」「{{user}}」都指玩家主角 ${parts.userName}。` : '「user」「我」「{{user}}」都指玩家主角。',
    parts.charName ? `「char」「{{char}}」指当前角色 ${parts.charName}。` : '',
  ]
    .filter(Boolean)
    .join('');

  const contract = `你是生图提示词编写员。用户只会给你一句很短的画面想法，你要把它扩写成一个具体、完整、好看的画面，再按前面的后端书写规范写出提示词。你不是聊天助手，不续写剧情，不回答问题。

扩写要求：
1. ${who}其余人名按角色卡、角色固定外貌库对应；对不上的人按想法合理设定外貌。
2. 想法没说的全部由你补齐并且彼此一致：场景与陈设、时间与光线、每个人的姿势动作与身体朝向、表情与视线、服装（款式、颜色、穿着状态）、构图景别与镜头角度、氛围。补的内容不得与想法冲突，也不要加入想法里没有的人。
3. 共 ${count} 张。${count > 1 ? '每张都是同一个想法下明显不同的画面（换构图、换瞬间或换镜头），不要几乎相同的版本。' : ''}
4. ${profile.nlOnly ? '画面里的角色若在【角色固定外貌库】中：档案有 nl=（自然语言外貌）时把那句原样写进 nl，用词一字不改；只有字段时把每个字段改写进一句英文外貌描述，一个都不能漏或改。同一张图里一个人的外貌只完整写一遍。' : '画面里的角色若在【角色固定外貌库】中，外貌照抄库中字段，用词一字不改；同一张图里一个人的外貌只写一遍。'}
5. ${profile.nlOnly ? '本次是纯自然语言模式：nl 是唯一发给生图模型的提示词，按后端规范写成一段详细的英文画面描述；tag 只写人数、景别和角色名（10 个词以内）。' : profile.nl ? 'tag 与 nl 是同一画面的两种写法：tag 是 danbooru 短 tag，nl 是连贯的英文自然语言；' : 'tag 是 danbooru 短 tag；'}都只写正面内容，不写质量词、不写负面词。${negativeOn ? '\n   negative 是本画面专用的负面短 tag，只排除这张图特别容易画错的内容，可为空；不写通用质量负面词，也不能否定本图 tag/nl 里写了的东西。' : ''}
6. ${profile.lockedSize ? `size 已锁定，一律填 "${profile.lockedSize}"。` : 'size 只能填 "portrait"（竖图）或 "landscape"（横图）。'}
7. summary 用一句中文概述这张图画的是什么，给用户看。

先在 <thinking>...</thinking> 里简短构思，再输出一个 JSON 对象，不要 Markdown 代码块，格式：
${JSON.stringify({ images: [sample] })}`;

  const messages: ChatMsg[] = [];
  if (parts.jailbreak) messages.push({ role: 'system', content: parts.jailbreak });
  if (parts.charCard) messages.push({ role: 'system', content: buildCharCardSystem(parts.charCard) });
  if (parts.persona) messages.push({ role: 'system', content: buildPersonaSystem(parts.persona) });
  if (parts.spec) messages.push({ role: 'system', content: parts.spec });
  messages.push({ role: 'system', content: contract });
  if (parts.review?.trim()) messages.push({ role: 'system', content: parts.review.trim() });
  const library = parts.library.trim() ? `${parts.library.trim()}\n\n` : '';
  messages.push({ role: 'user', content: `${library}【画面想法】\n${options.idea.trim()}` });
  return messages;
}

function cleanText(value: unknown, field: string, index: number): string {
  const text = typeof value === 'string' ? value.trim().replace(/[\r\n]+/g, ' ') : '';
  if (text && FORBIDDEN_SUBTAG.test(text)) {
    throw new Error(`images[${index}].${field} 不得包含 bbi_image/tag/nl/negative/size 标签`);
  }
  return text;
}

/** 解析 AI 输出;没有可用图片时抛错(交给调用方重试)。 */
export function parseFreeGenPlan(raw: string, profile: AutoTagProfile, maxCount: number): FreeGenPrompt[] {
  const parsed = parseJsonObject(raw);
  if (!Array.isArray(parsed.images)) throw new Error('AI 返回的 JSON 缺少 images 数组');
  const out: FreeGenPrompt[] = [];
  parsed.images.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const entry = item as Record<string, unknown>;
    const tag = cleanText(entry.tag, 'tag', index);
    const nl = cleanText(entry.nl, 'nl', index);
    if (!tag && !nl) return;
    const characters: ImageCharacterPrompt[] = Array.isArray(entry.characters)
      ? entry.characters
          .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
          .map(c => ({
            name: typeof c.name === 'string' ? c.name.trim() : '',
            tag: cleanText(c.tag, 'characters.tag', index),
            nl: cleanText(c.nl, 'characters.nl', index),
          }))
          .filter(c => c.name && c.tag)
      : [];
    out.push({
      summary: typeof entry.summary === 'string' ? entry.summary.trim() : '',
      // tag 是出图接口的必填项;AI 只写了 nl 时拿 nl 顶上,不至于整张作废
      tag: tag || nl,
      nl: tag ? nl : '',
      negative: cleanText(entry.negative, 'negative', index),
      characters,
      size: profile.lockedSize ?? normalizeOrientation(entry.size),
    });
  });
  if (!out.length) throw new Error('AI 没有给出任何可用的画面');
  return out.slice(0, clampCount(maxCount));
}

/** 扩写:按当前设置组装请求、调用「生成 tag 使用」的 API、解析(失败按设置的重试次数重试)。 */
export async function expandIdea(options: FreeGenOptions, signal?: AbortSignal): Promise<FreeGenPrompt[]> {
  if (!options.idea.trim()) throw new Error('先写一句画面想法');
  const profile = autoTagProfile();
  const context = getContext();
  const lockedNames = lockedCharTagNames();
  const library =
    options.useLibrary && context ? buildLibraryText(charTagsBeforeFloor(context.chat.length), lockedNames) : '';
  const prompts = settings.autoTag.prompts;
  const messages = buildFreeGenMessages(options, {
    spec: backendPromptSpec(settings.autoTag, profile.nl, profile.naiCharPrompts, !!profile.nlOnly),
    profile,
    negativeOn: freeGenNegativeOn(),
    jailbreak: (prompts?.jailbreak ?? '').trim() || DEFAULT_JAILBREAK_PROMPT,
    charCard: options.useCard && context ? fetchCharCard(context) : '',
    persona: options.useCard && context ? fetchUserPersona(context) : '',
    library,
    userName: context?.name1?.trim() ?? '',
    charName: context?.name2?.trim() ?? '',
    review: reviewPrompt(settings.autoTag),
  });

  const retries = Math.max(0, Math.floor(Number(settings.autoTag.retryCount) || 0));
  const channel = getTagGenChannel();
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
    const holder: { plan: FreeGenPrompt[] | null } = { plan: null };
    const validate = (raw: string) => {
      holder.plan = parseFreeGenPlan(raw, profile, options.count);
    };
    const source = retries > 0 ? `自由生图·扩写(第 ${attempt + 1} 次)` : '自由生图·扩写';
    try {
      if (channel) await requestCompletion(channel, messages, { signal, source, validate });
      else await requestViaMainApi(messages, { signal, source, validate });
      if (holder.plan) return holder.plan;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? '扩写失败'));
}
