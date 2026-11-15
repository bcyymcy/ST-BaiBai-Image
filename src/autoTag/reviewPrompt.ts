/**
 * 【bcy】成稿前自查:拼在自动 tag / 自由生图请求里,让写提示词的 AI 在同一次输出里
 * 先自查再交稿——不额外发请求、不多花时间。
 *
 * 起因:用户出图里 barefoot 和 stockings 同时出现(词汇冲突),模型只能二选一乱画。
 * 这里列的是「同一张图里不能同时成立」的常见冲突,AI 发现后直接改正再输出。
 */
import type { AutoTagSettings } from '@/state/settings';

export const DEFAULT_REVIEW_PROMPT = `【成稿前自查（必须做）】
每张图的 tag / nl 写完后、输出 JSON 之前，逐条核对下面的冲突并直接改正；不要输出检查报告（有思维链时在 <thinking> 末尾简短过一遍即可）。
发现冲突时以正文为准：保留正文支持的一方，删掉或改写另一方。

1. 服装与身体状态
   - 穿着袜子、丝袜、连裤袜、过膝袜、长筒袜或鞋子时，不能写 barefoot / bare feet；穿袜子没穿鞋要写 no shoes 或 stockinged feet（feet in black stockings）。
   - 写了 completely nude / naked 时，不能再写任何衣物（饰品、发饰除外）；只是部分裸露时，写清楚哪件衣服处于什么状态（敞开、褪到腰间、掀起）。
   - 同一件衣物只能有一个状态，不能既穿着又脱掉；同一件衣物的颜色、款式全段一致。
   - 光腿（bare legs）不能和裤袜、长筒袜同时出现。
2. 表情与视线
   - closed eyes 不能和 looking at viewer / looking at 某人 / 描写眼神同时出现。
   - 同一个人只能有一个主表情，相反的表情（大笑与哭泣、怒视与害羞微笑）只有正文明确如此时才并存。
3. 姿势与景别
   - 同一个人只能有一种身体姿态：站、坐、躺、跪只选一个。
   - 撑着身体的手臂不能再去做别的动作。
   - 景别看不到的部位不要写：upper body / close-up 不写脚、鞋、袜子、腿部动作；cowboy shot 不写脚和鞋。
   - 全段只有一个镜头角度、一个景别。
4. 人物
   - tag 的人数、nl 里的人数与正文在场人数一致，不多不少。
   - 每个人的发色、发型、瞳色与角色库一致，前后不能变；两个人的外貌描述不能混到一起。
5. 场景与光线
   - 室内 / 室外、白天 / 夜晚、晴 / 雨 全段一致；光源与时间、场所相符（夜晚室内不写阳光直射）。
6. 正负面
   - negative 不能否定正面写了的东西（正面写了 stockings，negative 就不能有 legwear）。`;

/** 自查提示词;关闭开关时返回空串(调用方据此不占消息位)。 */
export function reviewPrompt(options: Pick<AutoTagSettings, 'prompts'> & { selfReview?: boolean }): string {
  if (options.selfReview === false) return '';
  return (options.prompts?.review ?? '').trim() || DEFAULT_REVIEW_PROMPT;
}
