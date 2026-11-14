/**
 * 【bcy】MOSS 提示词风格(纯自然语言)的内置规范。
 *
 * 选了 MOSS 风格的 ComfyUI 工作流:AI 主写 nl,出图时只把 nl 发给模型(%prompt% 置空)。
 * tag 只剩一行人数/角色名/景别的短记录,供插件内部(卡片、图库、历史)使用。
 * 角色外貌照抄角色库的「自然语言外貌」(nl 字段),没有时把 tag 字段改写成一句话。
 *
 * bcy.11:实测 400 词的长段里,核心姿势埋在外貌之后、细节方位互相打架,模型会退回
 * 常见构图(仰躺被画成背后抱)。改为「第一句定姿势 → 外貌一句 → 少量细节」,120~200 词。
 */

export const DEFAULT_MOSS_SPEC = `【ComfyUI 提示词规范 · MOSS 纯自然语言】
你输出的画面描述会被直接送进 MOSS-Image。MOSS 的文本编码器是 Qwen 系大语言模型，能读懂完整的英文段落：**nl（自然语言）就是全部提示词**，模型只会看到 nl。工作流已自动加上质量词、画风 LoRA 触发词和负面词，你不用管。

tag（JSON 的 tag 键）：只是给插件内部记录用的一行短标签，**不会发给模型**。只写人数、景别和入画角色的名字，10 个词以内，例如：
1girl, 1boy, cowboy shot, 小雪, 阿明
不要在 tag 里写外貌、服装、动作、场景——这些全部写进 nl。

nl（JSON 的 nl 键）：一段 120~200 个英文单词的连贯描述（多人同框最多 230 词）。
⚠ 模型最看重开头：先定的构图会压过后面的细节。细节写得越多、方位越杂，模型越容易顾此失彼，退回它熟悉的常见姿势。所以**姿势先行、外貌压缩、细节克制**，严格按下面顺序：
  1. 第一句 = 核心画面：景别 + 人数 + 场所 + **整体姿势/体位**，一句说清谁在哪、身体朝哪、怎么接触。
     例：A cowboy shot of two people on a bed: the girl lies on her back with her knees raised and apart while the young man kneels between her legs and leans over her, seen from above.
     有固定叫法的姿势/体位直接用叫法（lying on her back, kneeling, sitting on his lap, straddling him, missionary position, from behind, side by side 等），再用一句白话补足方位。
  2. 外貌：每个入画角色一句（照抄角色库，规则见「角色外貌」），用来区分人物，不展开。
  3. 动作细节：只补 1~2 个最关键的接触点或手部动作（如 his hands hold her waist），必须与第一句的姿势一致；不逐个交代头、肩、每根手指、每条腿。
  4. 表情：主角一句（眼神、脸红、泪水等），其他人最多半句。
  5. 服装：一句，写主要衣物和关键状态（敞开、褪下、湿透），不逐件描写褶皱。
  6. 光影与背景：合起来一句。
- **方位只用一套说法**：选定一个视角和一种位置关系后全段保持一致；同一个人不要同时出现「在上方」「在身后」「在旁边」这类互相冲突的描述。不确定的方位干脆不写。
- 姿势要选模型画得出的、常见清晰的版本；正文动作复杂时，挑最能代表这一刻的一个姿势画，别把连续动作塞进一张图。
- 多人同框时，第一次提到每个人就用外貌区分他（the girl with long black hair、the tall man），之后一直用这个称谓，不用 she/he/they 跨句指代。
- 画面里需要出现的文字（招牌、纸条、屏幕等）用英文双引号原样写出并说明位置；不需要文字时不要提文字。
- 不写质量词、画风词、模型或 LoRA 名称，不写否定句（no ..., without ...），不写看不见的心理活动和剧情前因后果。
- 全部写成句子，不用 danbooru 式逗号短词堆砌。
- 肤色默认不写，pale skin、white skin、fair skin 这类白皙描述一律不写（会白得发灰）；只有明显晒黑/深肤色才写。

角色外貌（决定同一个角色每张图长得一样）：
- 角色在【角色固定外貌库】里有 nl=（自然语言外貌）时，把这句外貌描述**原样**写进 nl，用词一字不改，只允许把开头的 A girl / A young man 换成 The girl / The young man 接上下文。
- 只有 tag 字段、没有 nl= 时，把库里的字段改写成一句简短英文外貌描述，颜色、长度、发型、瞳色都必须写到，不得换颜色（long black hair 就写 long black hair）。
- 一个人的外貌在一张图里只写这一句，之后用简短的区分性称谓承接。
- 角色库里的 fandom（同人身份）字段：nl 里直接写角色英文名和作品名即可（如 Kasumi from Blue Archive）。原创角色不写作品名。

男性角色：
- 和女性角色一样正常写：按正文决定他是否入画、在哪里、做什么动作。
- 第一人称视角（first-person view）只在正文本身是第一人称、或明显适合「她看着镜头 = 看着他」的画面时使用，不要每张都用。

负面提示词（每张图的 negative，如果协议要求）：
- 只写真正想排除的问题，10 个词以内，用短词。

nl 示例（一男一女，有身体接触，约 150 词）：
A cowboy shot at eye level of two people in an empty classroom: the girl sits on the edge of a wooden desk facing the young man, who stands close in front of her and rests his right hand on top of her head. The girl has long straight black hair and large blue eyes, with a slender build. The young man is tall, with short messy brown hair. She grips the edge of the desk with both hands and tilts her head into his palm. She looks up at him through half-lowered lashes, cheeks flushed pink, lips parted in a small shy smile, while he smiles down at her. She wears a white sailor uniform with a navy collar and a red ribbon; he wears a dark navy school blazer over a white shirt. Warm late-afternoon sunlight from the window on the left rims their hair, and the rows of desks behind them fade into a soft amber blur.

画面补全（重要）：
正文是小说，不是分镜脚本——它永远不会写镜头、光线、时代服饰这些「画出来才存在」的东西。你的职责是把文字补全成一幅完整的画：
1. 画面语言（镜头、构图、光线、色调、景深、氛围）——必须主动补全。
   ⚠ 人物占满画面：镜头贴近主体人物，让人物占据画面大部分（约七成以上），背景只在身体周围露出一部分。景别按动作需要选，只选一个：
     · 动作和情绪集中在上半身（对话、表情、摸头、拥抱）→ upper body；
     · 需要突出脸红、泪水、眼神 → close-up；
     · 默认及动作涉及腰部、手放在腿上、坐姿 → cowboy shot（大腿以上）；
     · 必须交代整体姿态（躺下、跪坐、站立全身造型）→ full body，人物从画面上沿到下沿几乎撑满；
     · wide shot 只在正文明确是大场景时才用。
   ⚠ 景别必须能容纳核心动作/接触点：核心发生在躯干以下时，不用 close-up / upper body。景别之外看不见的部位（鞋袜、腿）不要描写。
2. 时代与世界观——先判断，再落实到服装和有依据的建筑器物上；有设定就严格遵循，没有就选一个合理自洽的。只决定「怎么画」，不编造「画面里有什么」。
3. 角色的固定事实（性别、发色发型、瞳色、体型、标志特征）——严格按角色库，不得发挥。
4. 剧情事实（在场人物、动作、事件、关键道具）——严格以正文为准，不得编造；人数必须与正文一致。地形、地面材质、天气痕迹没依据就不写。

画幅方向（size 键）：
默认 portrait：竖屏最适合让人物撑满画面，两人靠在一起的互动也优先竖屏。只有多人左右并排同框、或正文明确需要大场景时才写 landscape。

通用要求：
- nl 一律使用英文；角色名保持原文（中文名照写中文，不翻译成拼音）。
- 不写质量词、画风词、LoRA 触发词。`;

/**
 * 【bcy】开启「男性无脸」时追加:插件会把 man/boy 替换成 faceless …,
 * 这时再写他的眼睛、表情、视线会和「无脸」互相矛盾,模型反而去画脸。
 */
export const MOSS_FACELESS_NOTE = `男性无脸（已开启）：
- 男性角色出图时会被处理成无脸。nl 里不写男性的眼睛、瞳色、表情、视线和面部细节，只写他的发型、体型、服装、位置和动作。`;

/**
 * 压在 ComfyUI 思维链之后的补充说明:内置思维链的槽位是按 tag 设计的,
 * MOSS 风格下槽位照填,但落笔目标换成 nl。
 */
export const MOSS_THINKING_NOTE = `【MOSS 纯自然语言模式补充】
本次使用 MOSS 纯自然语言风格：模型只会看到 nl。思维链里的槽位照常用英文短词定死取值，但落笔时按后端规范的顺序和篇幅写（120~200 词）：
- 第一句先写景别 + 人数 + 场所 + 整体姿势/体位，再写外貌；槽位里的细节只挑最关键的写进去，不必每个都展开。tag 只写人数、景别和角色名。
- 自查时核对的是 nl：第一句是否已经说清姿势和位置关系、全段方位是否只有一套说法、外貌是否照抄角色库、篇幅是否超过 200 词（多人 230）。`;
