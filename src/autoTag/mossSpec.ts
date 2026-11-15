/**
 * 【bcy】MOSS 提示词风格(纯自然语言)的内置规范。
 *
 * 选了 MOSS 风格的 ComfyUI 工作流:AI 主写 nl,出图时只把 nl 发给模型(%prompt% 置空)。
 * tag 只剩一行人数/角色名/景别的短记录,供插件内部(卡片、图库、历史)使用。
 * 角色外貌照抄角色库的「自然语言外貌」(nl 字段),没有时把 tag 字段改写成一句话。
 *
 * bcy.11:实测 400 词的长段里,核心姿势埋在外貌之后、细节方位互相打架,模型会退回
 * 常见构图(仰躺被画成背后抱)。改为「第一句定姿势 → 外貌一句 → 少量细节」。
 * bcy.13:用户实测同一模型下「体位名 + 全身 + 平视侧面 + 少细节」能画对,
 * 插件写的「大腿以上 + 俯视 + 男方头被裁出画面 + 大段细节」画不对。
 * 改为:有名字的姿势必须写名字;景别按姿势需要;默认平视;男方完整入画;
 * 去掉硬性字数(官方 skill 不建议任意字数),改成「细节服从姿势」。日常与 NSFW 同一套规则。
 */

export const DEFAULT_MOSS_SPEC = `【ComfyUI 提示词规范 · MOSS 纯自然语言】
你输出的画面描述会被直接送进 MOSS-Image。MOSS 的文本编码器是 Qwen 系大语言模型，能读懂完整的英文段落：**nl（自然语言）就是全部提示词**，模型只会看到 nl。工作流已自动加上画风 LoRA 触发词和负面词，你不用管。

tag（JSON 的 tag 键）：只是给插件内部记录用的一行短标签，**不会发给模型**。只写人数、景别和入画角色的名字，10 个词以内，例如：
1girl, 1boy, full body, 小雪, 阿明
不要在 tag 里写外貌、服装、动作、场景——这些全部写进 nl。

nl（JSON 的 nl 键）：一段连贯的英文描述。
⚠ 最重要的是**姿势画对**。模型最看重开头，开头定下的构图会压过后面的细节；细节越多、方位越杂，模型越容易退回它熟悉的常见姿势。所以严格按下面顺序写：

  1. 第一句 = 核心画面：景别 + 角度 + 人数 + 场所 + **姿势**，一句说清每个人是站、坐、躺还是跪，谁在哪，怎么接触。
     · **姿势有通用名字就必须写出名字**，再用半句白话补方位。日常与亲密场景都一样，例如：
       日常：sitting cross-legged, seiza, hugging her knees, lying on her stomach, leaning against a wall, kneeling on one knee, princess carry, piggyback ride, hug from behind, lap pillow, head pat, holding hands, arm in arm, forehead to forehead
       亲密/成人：missionary position, cowgirl position, reverse cowgirl, doggystyle, spooning, standing sex, lap sitting, straddling
     · 写了姿势名，就按这个姿势**最常见、最标准的样子**写方位，不自创变体；第一句里只写姿势本身，不在同一句里叠加别的动作（抓、摸、捏等）。
     · **支撑手不能另作他用**：撑在床上/墙上/对方身上承重的手臂，就不能再写它去抓、摸别处——否则模型只能改姿势去满足手的动作。手部动作只能给没在承重的手。
     · 没有通用名字的姿势，只交代三件事：每个人的身体姿态（站/坐/躺/跪）、身体靠什么支撑（床、椅子、墙、对方的手臂）、两人哪里接触。不写每根手指、每条腿。
     例：A full-body shot at eye level from the side of two people in a garden: the young man holds the girl in a princess carry, one arm under her knees and the other behind her back, while she wraps both arms around his neck.
     例：An upper-body shot at eye level of two people in a park: the young man gives the girl a head pat while she looks up at him.
  2. 外貌：每个入画角色一句（照抄角色库，规则见「角色外貌」），用来区分人物，不展开。
  3. 关键细节：只补 1~2 处最关键的接触点或手部动作，必须与第一句的姿势一致，不能改变谁在承重、谁的身体在哪。
  4. 表情：主角一句，其他人最多半句。
  5. 服装：一句，写主要衣物和关键状态（敞开、褪下、湿透），不逐件描写。
  6. 光影与背景：合起来一句。
- 篇幅按画面需要来，不追求字数；但**细节服从姿势**：任何细节只要会让姿势变复杂、变难画，就删掉。通常 80~180 个英文单词就够了。
- **景别按姿势需要选**，只选一个（见「画面补全」）。
- **角度默认平视（at eye level）**；需要看清两人身体关系的姿势（躺、跪、骑坐、背后、抱起）优先 from the side。俯视（from above）、仰视（from below）、斜后方等刁钻角度只在正文明确需要时用。全段只写一次角度，不要出现第二种角度说法。
- **方位只用一套说法**：同一个人不要同时出现「在上方」「在身后」「在旁边」这类互相冲突的描述。不确定的方位干脆不写。
- **入画的人要画完整**：不要写「某人的头被画面边缘裁掉」「只露出他的手」这类半截人物——模型很难画出半个人在做完整的动作。景别能容纳谁就完整写谁。
- 正文动作复杂时，挑最能代表这一刻的一个姿势画，别把连续动作塞进一张图。
- 多人同框时，第一次提到每个人就用外貌区分他（the girl with long black hair、the tall man），之后一直用这个称谓，不用 she/he/they 跨句指代。
- 画面里需要出现的文字（招牌、纸条、屏幕等）用英文双引号原样写出并说明位置；不需要文字时不要提文字。
- 不写质量词、画风词、模型或 LoRA 名称，不写否定句（no ..., without ...），不写看不见的心理活动和剧情前因后果。
- 全部写成句子，不用 danbooru 式逗号短词堆砌。
- 肤色默认不写，pale skin、white skin、fair skin 这类白皙描述一律不写（会白得发灰）；只有明显晒黑/深肤色才写。

角色外貌（决定同一个角色每张图长得一样）：
- 角色在【角色固定外貌库】里有 nl=（自然语言外貌）时，把这句外貌描述**原样**写进 nl，用词一字不改，只允许把开头的 A girl / A young man 换成 The girl / The young man 接上下文。
  例外：库里的句子若带有「没有某特征」的否定说法（no scars or marks are noted）或 main features / notable 这类说明腔，删掉这些部分，只留看得见的外貌。
- 只有 tag 字段、没有 nl= 时，把库里的字段改写成一句简短英文外貌描述，颜色、长度、发型、瞳色都必须写到，不得换颜色（long black hair 就写 long black hair）。
- 一个人的外貌在一张图里只写这一句，之后用简短的区分性称谓承接。
- 角色库里的 fandom（同人身份）字段：nl 里直接写角色英文名和作品名即可（如 Kasumi from Blue Archive）。原创角色不写作品名。

男性角色：
- 和女性角色一样正常写：按正文决定他是否入画、在哪里、做什么动作，入画就完整入画。
- 第一人称视角（first-person view）只在正文本身是第一人称、或明显适合「她看着镜头 = 看着他」的画面时使用，不要每张都用。

负面提示词（每张图的 negative，如果协议要求）：
- 只写真正想排除的问题，10 个词以内，用短词。

nl 示例（一男一女，日常接触，约 120 词）：
A cowboy shot at eye level of two people in an empty classroom: the girl sits on the edge of a wooden desk facing the young man, who stands in front of her and gives her a head pat. The girl has long straight black hair and large blue eyes, with a slender build. The young man is tall, with short messy brown hair. She grips the edge of the desk with both hands and tilts her head into his palm. She looks up at him with flushed cheeks and a small shy smile. She wears a white sailor uniform with a red ribbon; he wears a dark navy school blazer. Warm late-afternoon sunlight from the window on the left, the rows of desks behind them softly blurred.

画面补全（重要）：
正文是小说，不是分镜脚本——它永远不会写镜头、光线、时代服饰这些「画出来才存在」的东西。你的职责是把文字补全成一幅完整的画：
1. 画面语言（镜头、构图、光线、色调、景深、氛围）——必须主动补全。
   ⚠ 人物占满画面：镜头贴近主体人物，让人物占据画面大部分，背景只在身体周围露出一部分。景别按姿势需要选，只选一个：
     · 动作和情绪集中在上半身（对话、表情、摸头、牵手、拥抱）→ upper body；
     · 需要突出脸红、泪水、眼神，且没有身体姿势要交代 → close-up；
     · 坐姿、手放在腿上、动作到腰部 → cowboy shot（大腿以上）；
     · **必须看到整体体态的姿势**（躺、跪、骑坐、公主抱、背人、各种体位、全身造型）→ full body，人物从画面上沿到下沿几乎撑满；
     · wide shot 只在正文明确是大场景时才用。
   ⚠ 景别必须完整容纳定义这个姿势的身体部位：腿和胯部的关系决定姿势时，不用 upper body / cowboy shot。景别之外看不见的部位不要描写。
2. 时代与世界观——先判断，再落实到服装和有依据的建筑器物上；有设定就严格遵循，没有就选一个合理自洽的。只决定「怎么画」，不编造「画面里有什么」。
3. 角色的固定事实（性别、发色发型、瞳色、体型、标志特征）——严格按角色库，不得发挥。
4. 剧情事实（在场人物、动作、事件、关键道具）——严格以正文为准，不得编造；人数必须与正文一致。地形、地面材质、天气痕迹没依据就不写。

画幅方向（size 键）：
默认 portrait：竖屏最适合让人物撑满画面。躺姿、横向体位、多人左右并排同框、或正文明确需要大场景时写 landscape。

通用要求：
- nl 一律使用英文；角色名保持原文（中文名照写中文，不翻译成拼音）。
- 不写质量词、画风词、LoRA 触发词。`;

/**
 * 【bcy】开启「男性无脸」时追加:插件会把 man/boy 替换成 faceless …,
 * 这时再写他的眼睛、表情、视线会和「无脸」互相矛盾,模型反而去画脸。
 * bcy.13:不再靠构图裁头(半截人物会让姿势画错),男方照常完整入画。
 */
export const MOSS_FACELESS_NOTE = `男性无脸（已开启）：
- 男性角色出图时插件会自动处理成无脸，你不用自己写 faceless，也**不要**用构图把他的头裁出画面——照常让他完整入画。
- nl 里只是不写男性的眼睛、瞳色、表情、视线和面部细节，只写他的发型、体型、服装、位置和动作。`;

/**
 * 压在 ComfyUI 思维链之后的补充说明:内置思维链的槽位是按 tag 设计的,
 * MOSS 风格下槽位照填,但落笔目标换成 nl。
 */
export const MOSS_THINKING_NOTE = `【MOSS 纯自然语言模式补充】
本次使用 MOSS 纯自然语言风格：模型只会看到 nl。思维链里的槽位照常用英文短词定死取值，但落笔时按后端规范的顺序写：
- 先定姿势：这一刻每个人的姿态是什么，有没有通用的姿势名（日常或亲密体位都算）；再按姿势选景别（看整体体态的姿势用 full body）和角度（默认平视，看身体关系用侧面）。
- 第一句写景别 + 角度 + 人数 + 场所 + 姿势名/姿态，再写外貌；槽位里的细节只挑最关键的写，会让姿势变复杂的细节一律删掉。tag 只写人数、景别和角色名。
- 自查时核对的是 nl：第一句是否写出姿势名或说清姿态、承重的手臂有没有被写去做别的事、景别是否容纳了定义姿势的身体部位、全段是否只有一个角度和一套方位、入画的人是否都完整、外貌是否照抄角色库。`;
