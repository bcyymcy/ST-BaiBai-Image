/**
 * 【bcy】MOSS 提示词风格(纯自然语言)的内置规范。
 *
 * 选了 MOSS 风格的 ComfyUI 工作流:AI 主写 nl,出图时只把 nl 发给模型(%prompt% 置空)。
 * tag 只剩一行人数/角色名/景别的短记录,供插件内部(卡片、图库、历史)使用。
 * 角色外貌照抄角色库的「自然语言外貌」(nl 字段),没有时把 tag 字段改写成句子。
 *
 * bcy.11~15:围绕「姿势画不对」反复收紧,写成了「镜头术语开头 + 外貌半句 + 剧情细节」。
 * bcy.17:对照用户自己手写、单人几乎不出肢体问题的提示词(MOSS 官方推荐的 caption 写法)
 * 整份重写:
 *  - 第一句 = 人物 + 姿势 + 地点,像正常句子,不用「A full-body shot at eye level…」开头;
 *  - 外貌写成完整句子(She has…),修掉「The girl with … build.」这种没有谓语的半句;
 *  - 细节写看得见的东西(服装、道具、摆设),用画面方位(左边、右下、背景、前景)交代位置;
 *  - 剧情残留的小痕迹(伤口、结痂、液体痕迹)不是画面重点就不写;
 *  - 光线放最后。
 * bcy.18:去掉 bcy.17 写死的「2.5D semi-realistic anime illustration」画风开头——
 *  画风归工作流的触发词/前缀/LoRA 管,规范只管人物、动作、服装、场景、光线。
 */

export const DEFAULT_MOSS_SPEC = `【ComfyUI 提示词规范 · MOSS 纯自然语言】
你输出的画面描述会被直接送进 MOSS-Image。MOSS 的文本编码器是 Qwen 系大语言模型，读得懂完整的英文段落：**nl（自然语言）就是全部提示词**，模型只会看到 nl。工作流会自动在前面加上模型/LoRA 触发词、前缀和负面词，你不用管，也不要自己写。

tag（JSON 的 tag 键）：只给插件内部记录用，**不会发给模型**。只写人数和入画角色的名字，10 个词以内，例如：
1girl, 1boy, 小雪, 阿明
外貌、服装、动作、场景全部写进 nl。

━━ nl 怎么写 ━━
一段（或两三段）连贯的英文描述，像在向画师描述一幅插画：先说画的是什么，再一层层往下补。按这个顺序：

1. **第一句：人物 + 姿势 + 地点**，一句正常的话。
   例：A young woman sitting cross-legged on a messy hotel bed.
   例：A girl leaning against a classroom window, looking back over her shoulder.
   例：A tall young man carrying a girl in a princess carry across a moonlit garden.
   · 姿势有通用名字就直接写名字（sitting cross-legged, seiza, kneeling, lying on her side, hugging her knees, leaning against a wall, princess carry, piggyback ride, hug from behind, lap pillow, straddling…），按它最常见的样子画，不自创变体。
   · 视角只在需要时用一个自然说法带过：from a first-person POV、seen from the side、seen from behind、from a low angle。**不要**用「A full-body shot at eye level from the side of…」这种摄影术语开头，也不要同时写两种角度。
   · 第一句只写一个姿势，不要在同一句里叠加抓、摸、捏等其他动作。

2. **外貌**：每个入画角色用完整的句子写，以 She has / He has 开头（多人时用 The girl has / The young man has 区分）。
   例：She has long black hair styled in a traditional updo secured with a silver hairpin, loose bangs framing her face, and half-lidded amber eyes.
   ⚠ 必须是有谓语的完整句子。**禁止**写「The girl with long brown hair, brown eyes and a slender build.」这种没有动词的半句。
   表情和视线可以接在外貌后面（looking at the viewer with a teasing smile / her eyes half-closed）。

3. **服装**：写清楚每件主要衣物的颜色、材质、款式和状态（敞开、滑落、湿透），状态要前后一致。
   例：She wears a sheer white outer robe with pale-blue floral embroidery over a silver satin slip dress, with white lace-topped thigh-high stockings.

4. **手和道具**：手里拿着什么、手放在哪。撑着身体的手不能再写它去做别的事。

5. **场景**：写看得见的物件，并用画面方位交代位置——on the left / on the right / in the lower-left foreground / in the background / at the upper right。物件写具体（a glowing paper lantern, a brown leather armchair, a long table draped in dark red velvet），不写空泛的「a cozy room」。

6. **光线**放最后一句：光从哪来、什么颜色（warm golden light from the lamp on the right / cold moonlight through the window）。

━━ 写什么、不写什么 ━━
- **只写画面上看得见、而且值得画的东西。** 剧情里的小痕迹（伤口、结痂、指痕、泪痕、液体痕迹、污渍）不是这张图的重点就不写；要写也只写一处，写清在哪。
- 不写看不见的东西：心理活动、剧情前因后果、声音、气味、「刚刚发生过什么」。
- 不写否定句（no …, without …, not …），想排除的东西交给负面词。
- **不写画风**：画风由工作流的触发词、前缀和 LoRA 决定，nl 里不写任何画风/媒介词（anime illustration, 2.5D, semi-realistic, photorealistic, oil painting, digital art 等）。
- 不写质量词（masterpiece, best quality…）、LoRA 名、触发词——工作流前缀已经有了。
- 全部写成句子，不用 danbooru 式逗号短词堆砌。
- 肤色默认不写；pale skin、white skin、fair skin 这类白皙描述不写（会白得发灰），只有明显晒黑/深肤色才写。
- 画面里需要出现的文字（招牌、纸条、屏幕、对话气泡）用英文双引号原样写出内容，并说明在画面哪里；不需要文字就不提。
- 篇幅：单人通常 120~250 个英文单词，多人可以更长。宁可把服装和场景写具体，也不要把姿势写复杂。

━━ 多人同框 ━━
- 第一句就写清有几个人、各自是站、坐、躺还是跪、两人怎么接触。有通用姿势名就用姿势名。
- 每个人第一次出现时用外貌区分（the girl with long black hair / the tall young man），之后一直用这个称谓或 she / he，不要让称谓在两个人之间来回跳。
- 方位只用一套说法：同一个人不要同时出现「在上方」「在身后」「在旁边」这类冲突描述。拿不准的方位就不写。
- 入画的人就完整画：不要写「他的头在画面外」「只露出他的手」这种半截人物。第一人称视角（from a first-person POV，看画的人就是他）例外：这时他只出现手或前臂，不写他的脸。
- 正文动作复杂时，挑最能代表这一刻的一个姿势画，别把连续动作塞进一张图。

━━ 角色外貌（决定同一个角色每张图长得一样） ━━
- 角色在【角色固定外貌库】里有 nl=（自然语言外貌）时，按库里的描述写，**颜色、长度、发型、瞳色、体型、标志特征的用词都不改**；但要把它改写成 She has / He has 开头的完整句子，接到上下文里。库里的句子若带「没有某特征」（no scars are noted）或 main features 这类说明腔，删掉这部分。
- 只有 tag 字段、没有 nl= 时，把字段改写成完整的英文句子，颜色、长度、发型、瞳色都写到，不换颜色（long black hair 就写 long black hair）。
- 一个人的固定外貌在一张图里只完整写一遍。
- fandom（同人身份）字段：nl 里直接写角色英文名和作品名（如 Kasumi from Blue Archive）。原创角色不写作品名。

━━ 男性角色 ━━
- 和女性角色一样正常写：按正文决定他是否入画、在哪里、做什么。
- 第一人称视角只在正文本身是第一人称、或明显适合「她看着镜头 = 看着他」的画面时使用，不要每张都用。

━━ 画面补全 ━━
正文是小说，不会写镜头、光线、服饰细节这些「画出来才存在」的东西，由你补全成一幅完整的画：
1. 构图与光线——主动补全。人物是画面主体，占画面的大部分；需要看整体体态的姿势（躺、跪、坐、抱起）要让全身入画，情绪特写才只画上半身。看不见的身体部位不要描写。
2. 时代与世界观——先判断，再落实到服装和有依据的建筑器物上；有设定就严格遵循。
3. 角色的固定事实（性别、发色发型、瞳色、体型、标志特征）——严格按角色库，不得发挥。
4. 剧情事实（在场人物、动作、事件、关键道具）——严格以正文为准，不得编造；人数必须与正文一致。场景物件可以按场所合理补全（卧室有床和台灯、教室有课桌），但不编造影响剧情的道具。

━━ nl 示例（单人，约 170 词） ━━
A young woman sitting cross-legged on a rumpled hotel bed at night, reading a folded letter in her hands. She has long black hair gathered into a loose bun held by a silver floral hairpin, a few strands falling beside her face, and half-lidded dark eyes with a faint, wistful smile. She wears a sheer white robe with pale-blue floral embroidery slipping off one shoulder over a silver satin slip dress, and white lace-topped thigh-high stockings. An open envelope and a crumpled silk scarf lie on the white sheets to her left. Behind the bed, the beige wall shows a large ink-wash mural of white lotus flowers between tall brown curtains; a brown leather armchair stands in the left background, and an ornate golden lantern glows on the nightstand at the right. Warm golden light from the lantern falls across her from the right, mixed with dim blue city light from the window.

━━ nl 示例（两人，日常） ━━
A tall young man carrying a girl in a princess carry along a moonlit garden path, seen from the side. The young man has short messy black hair and wears a dark long coat; one arm supports her back and the other is under her knees. The girl has long silver hair falling over his arm and large red eyes, and she wraps both arms around his neck, looking up at him with flushed cheeks and a shy smile. She wears a light blue summer dress and white sandals. Stone lanterns line the path on the left, and blooming hydrangea bushes fill the right foreground. Cold moonlight from the upper right outlines both of them, with warm lantern light glowing below.

━━ 画幅方向（size 键） ━━
默认 portrait：竖图最适合让人物撑满画面。躺姿、两人左右并排、或正文明确需要大场景时写 landscape。

━━ 通用要求 ━━
- nl 一律使用英文；角色名保持原文（中文名照写中文，不翻译成拼音）。
- 负面提示词（如果协议要求每张图写 negative）：只写真正想排除的问题，10 个词以内，用短词。`;

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
本次使用 MOSS 纯自然语言风格：模型只会看到 nl。思维链里的槽位照常用英文短词定死取值，但落笔时按后端规范的顺序写成自然的英文段落：
- 第一句：人物 + 姿势（有名字就写名字）+ 地点；不要用摄影术语开头，不写任何画风词。
- 然后依次写外貌（She has… 完整句子）、表情、服装、手和道具、场景（带画面方位）、最后光线。
- 剧情残留的小痕迹不是重点就删掉，细节优先写服装和场景里看得见的物件。tag 只写人数和角色名。
- 自查时核对的是 nl：第一句是否写出姿势、有没有混进画风词、有没有没谓语的半句、承重的手臂有没有被写去做别的事、全段是否只有一种角度和一套方位、外貌颜色是否和角色库一致。`;
