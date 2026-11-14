/**
 * 【bcy】MOSS 提示词风格(纯自然语言)的内置规范。
 *
 * 选了 MOSS 风格的 ComfyUI 工作流:AI 主写 nl,出图时只把 nl 发给模型(%prompt% 置空)。
 * tag 只剩一行人数/角色名/景别的短记录,供插件内部(卡片、图库、历史)使用。
 * 角色外貌照抄角色库的「自然语言外貌」(nl 字段),没有时把 tag 字段改写成一句话。
 */

export const DEFAULT_MOSS_SPEC = `【ComfyUI 提示词规范 · MOSS 纯自然语言】
你输出的画面描述会被直接送进 MOSS-Image。MOSS 的文本编码器是 Qwen 系大语言模型，能读懂完整的英文段落：**nl（自然语言）就是全部提示词**，模型只会看到 nl。工作流已自动加上质量词、画风 LoRA 触发词和负面词，你不用管。

tag（JSON 的 tag 键）：只是给插件内部记录用的一行短标签，**不会发给模型**。只写人数、景别和入画角色的名字，10 个词以内，例如：
1girl, 1boy, cowboy shot, 小雪, 阿明
不要在 tag 里写外貌、服装、动作、场景——这些全部写进 nl。

nl（JSON 的 nl 键）：一段 150~280 个英文单词的连贯描述（多人同框可到 350 词），句子完整、信息密集，不写空泛形容词堆砌。按下面顺序逐层写，每一层都要有具体内容：
  1. 构图：景别与视角（如 a cowboy shot from a slightly low angle in a vertical frame），画面里有几个人、各在什么位置、所占比例；人物占据画面大部分。
  2. 角色外貌：每个入画角色单独介绍一次——性别与大致年龄感、发色发型长度、瞳色、体型、标志特征。角色在【角色固定外貌库】里有档案时照抄（规则见下方「角色外貌」）。
  3. 主体与动作：每个入画角色在做什么，身体姿态的细节——头部倾斜方向、肩膀、双手各自放在哪里、手指的动作、腰和腿的姿势、重心落在哪里。
  4. 面部与情绪：每个入画角色表情的具体样子——眼睛睁开程度和看向哪里、眉毛、嘴角、脸颊是否泛红、有没有泪光或汗珠；几缕头发如何落在脸侧。
  5. 服装：每件衣物的版型、颜色、材质，以及褶皱、贴身程度、潮湿或透光等状态，饰品的位置。
  6. 质感与光影：主光源的方向和颜色，皮肤、头发、布料上的高光与反光，阴影落在哪里，有没有轮廓光。
  7. 背景与氛围：画面里可见的场景和道具（只写有依据的），背景虚化程度，整体色调与氛围。
- 空间关系必须用文字说清楚：左/右/前景/背景、身体朝向、手与物体或人的接触点（谁的手放在哪里、谁靠在谁身上）。
- 多人同框时，第一次提到每个人就用外貌区分他（the girl with long black hair、the tall man with short brown hair），之后一直用这个区分性称谓，不用 she/he/they 跨句指代，避免两个人的特征互相串。
- 画面里需要出现的文字（招牌、纸条、屏幕等）用英文双引号原样写出并说明位置；不需要文字时不要提文字。
- 不写质量词、画风词、模型或 LoRA 名称，不写否定句（no ..., without ...），不写看不见的心理活动和剧情前因后果。
- 不用 danbooru 式的逗号短词堆砌，全部写成句子；人数要在第一句就写清楚（如 two people: a girl and a young man）。
- 肤色默认不写，pale skin、white skin、fair skin 这类白皙描述一律不写（会白得发灰）；只有明显晒黑/深肤色才写。

角色外貌（最重要，决定同一个角色每张图长得一样）：
- 角色在【角色固定外貌库】里有 nl=（自然语言外貌）时，把这句外貌描述**原样**写进 nl，用词一字不改，只允许把开头的 A girl / A young man 换成 The girl / The young man 接上下文。
- 只有 tag 字段、没有 nl= 时，把库里的字段逐个改写成一句英文外貌描述，每个字段的颜色、长度、发型、瞳色都必须写到，不得省略、不得换颜色（long black hair 就写 long black hair，不要写成 dark hair）。
- 同一张图里一个人的外貌只完整介绍一次，之后用简短的区分性称谓承接。
- 角色库里的 fandom（同人身份）字段：nl 里直接写角色英文名和作品名即可（如 Kasumi from Blue Archive），不需要括号。原创角色不写作品名。

男性角色：
- 和女性角色一样正常写：按正文决定他是否入画、站在哪里、做什么动作，正常写他的外貌、服装、表情和视线。
- 第一人称视角（first-person view）只在正文本身是第一人称、或明显适合「她看着镜头 = 看着他」的画面时使用，不要每张都用。

负面提示词（每张图的 negative，如果协议要求）：
- 只写真正想排除的问题，10 个词以内，用短词。

nl 示例（一男一女，有身体接触）：
A cowboy shot at eye level in a vertical frame showing two people, a girl and a young man, filling most of the image. The girl has long, straight black hair falling past her shoulders and large blue eyes, with a slender build. The young man is tall, with short messy brown hair and dark eyes. The girl sits on the edge of a wooden desk in an empty classroom, leaning slightly forward, her left hand resting flat on the desk behind her to hold her weight. The young man stands in front of her on the right side of the frame, his body turned three-quarters toward her, and his right hand rests gently on top of her head. The girl tilts her head into his palm and looks up at him through half-lowered lashes, her cheeks flushed pink and her lips parted in a small, shy smile; the young man looks down at her with a calm, soft smile. The girl wears a white sailor uniform with a navy collar and a red ribbon tied at the chest, the thin cotton blouse creasing softly at the waist above a pleated navy skirt; the young man wears a dark navy school blazer over a white shirt, the sleeve pulled slightly up his raised forearm. Warm late-afternoon sunlight streams through the window on the left, casting a golden rim light along the girl's hair and the young man's shoulder. The rows of desks behind them dissolve into a soft blur of warm amber tones.

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
2. 时代与世界观——先判断，再落实到服装版型、材质、配饰和有依据的建筑器物上；有设定就严格遵循，没有就选一个合理自洽的。只决定「怎么画」，不编造「画面里有什么」。
3. 角色的固定事实（性别、发色发型、瞳色、体型、标志特征）——严格按角色库，不得发挥。
4. 剧情事实（在场人物、动作、事件、关键道具）——严格以正文为准，不得编造；人数必须与正文一致。地形、地面材质、天气痕迹没依据就不写。

画幅方向（size 键）：
默认 portrait：竖屏最适合让人物撑满画面，两人靠在一起的互动也优先竖屏。只有多人左右并排同框、或正文明确需要大场景时才写 landscape。

通用要求：
- nl 一律使用英文；角色名保持原文（中文名照写中文，不翻译成拼音）。
- 不写质量词、画风词、LoRA 触发词。`;

/**
 * 压在 ComfyUI 思维链之后的补充说明:内置思维链的槽位是按 tag 设计的,
 * MOSS 风格下槽位照填,但落笔目标换成 nl。
 */
export const MOSS_THINKING_NOTE = `【MOSS 纯自然语言模式补充】
本次使用 MOSS 纯自然语言风格：模型只会看到 nl。思维链里的槽位照常用英文短词定死取值，但落笔时：
- 每个槽位的内容都必须写进 nl 的句子里（表情、视线、服装、场景、光线一个都不能漏），tag 只写人数、景别和角色名。
- 自查时核对的是 nl：每个入画角色的外貌是否照抄了角色库（有 nl= 的原样照抄，没有的按字段逐个改写成句子）、是否每人都有表情和视线、多人时是否全程用区分性称谓。`;
