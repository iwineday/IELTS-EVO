# IELTS Quest — 设计文档

> 4-Agent 雅思复习系统，游戏化 RPG 大世界地图，桌面端 Web 应用。
> 开发过程由 [Evolver / EvoMap](https://github.com/EvoMap/evolver-claude-code-plugin) 节点驱动：Claude Code 在本工作区内的每次 outcome 都会被自动记录、复用，使后续会话越做越准。

---

## 0. evomap 在本项目中的角色（重要）

evomap **不是**雅思应用的"学习图谱引擎"，而是**开发侧的自演化记忆基建**：

- 它给开发者侧的 Claude Code 注入"上次什么方案有效"的上下文（SessionStart）
- 它在每次代码编辑后检测改进信号（PostToolUse）
- 它把每次会话的 git diff 分类成 outcome 写进 memory graph（Stop）
- 它通过 MCP 暴露跨项目可复用的 genes/capsules

**节点状态**（已注册）：
- Node ID：`node_0baa63264bdc`
- 本工作区 GEP 资产存储：`.evolver/gep/`（gitignored）
- Hooks：通过 evolver@0.2.1 plugin 自动挂载（SessionStart / PostToolUse[Write|Edit] / Stop）

**学生侧的"学习图谱"是另一套东西**，由本项目自己实现（SQLite + 自定义节点表 + SRS 调度器，见 §6.3）。两者同名但完全独立 —— 千万不要混淆。

---

## 1. 产品愿景

**一句话**：把雅思 4 项变成 4 张 RPG 大世界地图，学生通过打关、刷怪、做 Boss 战来备考，用积分解锁新场景、新地图、新装备。

**核心循环**（每次 5–20 分钟）：

```
进入地图 → 选关卡 → 与 Agent 交互（说/写/读/听）→ Agent 实时评分
        → 获得经验/金币/星级 → 解锁新节点 → 回到地图查看进度
```

**为什么会上瘾**：
1. **可见的进度**：地图是一张可视化的能力地图，比"做了 20 套题"直观得多。
2. **个性化路径**：evomap 根据弱点动态生成新关卡，学生总在能力边缘打怪。
3. **Agent 的人格化反馈**：4 个 Agent 各有性格（见 §2），让 AI 教练更像真人。
4. **解锁感**：场景/地图/装备需要积分兑换，每一关都在为下一个目标攒钱。

---

## 2. 四个 Agent 的能力边界

每个 Agent 是后端独立的 LLM 服务（Claude / GPT-4o-mini / Whisper 组合），有自己的 system prompt、工具链、评分维度。

### 2.1 Speaking Agent —「场景中的对话伙伴」

- **人格**：友好、好奇、会追问。名字暂定 **Ava**。
- **能力**：
  - 在指定场景下扮演角色（咖啡师 / 面试官 / 教授 / 房东 / 雅思考官）
  - 实时 ASR（Whisper / Deepgram）转写用户语音
  - 评分维度：**Fluency & Coherence、Lexical Resource、Grammar、Pronunciation**（对齐雅思 4 项）
  - 给出 band 估分（0.5 step）+ 具体改进建议 + 替代表达
- **工具链**：
  - `transcribe(audio) → text`
  - `score_pronunciation(audio, text) → phoneme-level feedback`（用 Azure Speech 或 SpeechAce）
  - `generate_followup(context) → next_question`
  - `score_response(transcript, criteria) → {band, comments, alternatives}`
- **关卡形态**：
  - **Part 1**：4–6 个短问答
  - **Part 2**：1.5 min 独白 + 1 min 准备
  - **Part 3**：3–5 轮深度讨论
  - **场景关**：自由对话，目标导向（如"在咖啡馆点单并解决一个投诉"）

### 2.2 Writing Agent —「批改 + 范文 + 重写」

- **人格**：严谨、像剑桥考官。名字暂定 **Edmund**。
- **能力**：
  - Task 1（图表 / 信件）批改
  - Task 2（议论文）批改
  - 评分维度：**Task Achievement、Coherence & Cohesion、Lexical Resource、Grammatical Range & Accuracy**
  - 输出：band 估分 + 句子级标注（红=错，黄=可优化，绿=亮点）+ 改写建议 + 同题 band 8/9 范文
- **工具链**：
  - `analyze_essay(text, task_type) → structured_feedback`
  - `rewrite_sentence(sentence, target_band) → improved`
  - `generate_model_answer(prompt, band) → essay`
  - `compare_diff(user_essay, model) → annotated_diff`
- **关卡形态**：
  - **Task 1 关**：图表题（折线/柱状/饼/流程/地图）、信件
  - **Task 2 关**：观点类、讨论类、问题-原因-方案、双边讨论
  - **Boss**：完整 60 min 计时双题

### 2.3 Reading Agent —「题型教练 + 出题官」

- **人格**：博学、像图书管理员。名字暂定 **Rhea**。
- **能力**：
  - 按题型出题（生成或从题库取）
  - 解析答案 + 定位原文证据
  - 教学：先教题型策略，再让学生应用
- **工具链**：
  - `fetch_passage(topic, difficulty) → passage`
  - `generate_questions(passage, type, count) → questions`
  - `grade_answer(question, user_answer) → {correct, evidence_span, explanation}`
  - `explain_strategy(question_type) → tutorial`
- **关卡形态**：
  - **小关**：单题型练习（如 5 道 List of Headings）
  - **段落关**：完整 passage + 13 题
  - **Boss**：完整 Cambridge 真题套题（3 passage × 13 题，60 min）

### 2.4 Listening Agent —「场景导演 + 听辨教练」

- **人格**：节奏感强、像电台 DJ。名字暂定 **Linus**。
- **能力**：
  - 播放音频 + 出题（雅思 4 个 Section 的所有题型）
  - 答错时定位音频位置、回放、显示原文
  - 子技能训练：数字 / 拼写 / 地图题 / 配对 / 同义替换
- **工具链**：
  - `fetch_audio(section, scenario) → audio_url + transcript`
  - `generate_audio_tts(script, voices, accent) → audio`（用于生成无版权练习）
  - `grade_listening(answers, key) → results`
  - `replay_segment(audio, timestamp_range) → clip`
- **关卡形态**：
  - **子技能关**：纯数字 / 纯拼写 / 纯地图题（30 秒一题，连击模式）
  - **Section 关**：完整 Section 1–4
  - **Boss**：完整 Listening Test（40 题 × 30 min）

---

## 3. 四张地图的组织维度

统一基调：**RPG 大世界**，但每张地图有自己的"地理隐喻"。

### 3.1 Speaking — 「言语城邦」(City of Voices)

一张俯视角城市地图，建筑物 = 场景。

- **新手区**：公寓（自我介绍）、咖啡馆（点单 / 小聊）
- **生活区**：超市、邮局、医院、银行
- **学术区**：大学图书馆、教授办公室、研讨室
- **职场区**：面试间、会议室、机场
- **考试区**：雅思考场（Part 1 / 2 / 3 完整模拟）

**解锁**：完成新手区开放生活区；解锁场景需积分。每个建筑物内有多关（Part 1 / 2 / 3 / 自由对话）。

### 3.2 Writing — 「文墨画廊」(Gallery of Letters)

一座多层艺术馆，每层一种题型。

- **B1 楼**：Task 1 图表大厅（折线厅、柱状厅、饼图厅、流程厅、地图厅、混合厅）
- **B2 楼**：Task 1 信件房间（正式 / 半正式 / 非正式）
- **2F**：Task 2 议论文大厅（按 topic 分：Education / Environment / Technology / Society / Health / Government / Globalization / Media）
- **顶层**：Boss 战 — 完整 60min 双题

**装饰品系统**：每完成一关掉落一幅画/雕塑放到自己的画廊里，长期成就感。

### 3.3 Reading — 「学者图书馆」(Scholar's Library)

一座古城堡式大图书馆，**题型 = 楼层**，**学科 = 书架颜色**。

- **西塔（题型主线）**：
  - 1F：Multiple Choice
  - 2F：True / False / Not Given
  - 3F：Matching Headings
  - 4F：Sentence Completion
  - 5F：Summary Completion
  - 6F：Matching Information
  - 顶层 Boss：综合题型 passage
- **东塔（学科副线）**：Science / Nature / History / Society / Tech，各学科有专属书架，按兴趣解锁阅读题材
- **地下藏书阁**：Cambridge 真题（解锁条件高，Boss 战场地）

学生既可按题型纵向打通，也可按学科横向探索。

### 3.4 Listening — 「四海大陆」(Four Seas)

一张世界地图，**4 个大洲 = 雅思 4 个 Section**，难度递增。

- **🌴 日常岛**（Section 1）：双人对话，生活场景。子区域：表格题、填空、选择
- **🏛 文化大陆**（Section 2）：单人独白，介绍/导览。子区域：地图题、配对、选择
- **🎓 学术群岛**（Section 3）：学生讨论，2–4 人对话。子区域：配对、流程、选择
- **🌋 知识火山**（Section 4）：学术讲座独白。子区域：笔记填空、表格、流程图

**子技能训练所**（横跨四大洲的"训练营"）：数字 / 拼写 / 同义替换 / 信号词，独立小关，3 分钟一关，连击挑战。

---

## 4. 经济与进度系统

### 4.1 货币与资源

| 资源 | 获取方式 | 用途 |
|---|---|---|
| **EXP** | 每关获得，按表现 ×1–3 | 升级账号、解锁新区域 |
| **Gold** | 每关固定 + 星级加成 | 解锁新场景、买装备 |
| **Gems**（稀有） | Boss 关、首通、连续打卡 | 解锁稀有场景 / 装备皮肤 / AI 生成的高难题包 |

### 4.2 星级与重玩

每关 1–3 星，星级 = 表现分位（如 70% / 85% / 95%）。
- 1 星过关即可继续，但 3 星才"完美通关"
- 满星关卡的奖励上限更高（鼓励重玩刷分）

### 4.3 解锁规则（evomap 的核心用武之地）

- **线性解锁**：完成 A 关解锁邻接 B 关（图的边）
- **付费解锁（游戏内货币）**：用 Gold 提前打开锁着的节点 —— 注意此处的"付费"是**游戏内积分**消耗，不是真实货币
- **动态生成**：Agent 根据弱点（如某题型正确率低）在 evomap 中**插入新节点**作为补强关
- **SRS 复习**：节点带"上次掌握度"权重，evomap 周期性把高遗忘节点重新点亮，提示复习

### 4.4 等级与称号

每 10 级一个段位：**Bronze → Silver → Gold → Platinum → Diamond → Master**。
段位影响：可挑战的真题难度、能购买的稀有场景、排行榜显示。

---

## 5. 视觉与交互设计

### 5.1 总体风格

- **2.5D 等距像素风**（Octopath Traveler 调性）：暖色调、手绘感、有"探险"氛围
- **统一的 UI 框架**：左下角角色头像 + 等级 + 经验条，右上角金币/钻石/段位，中央地图
- **4 张地图的差异化**：通过**色温**和**建筑符号**区分
  - Speaking 城邦：橙黄色，城市/街景
  - Writing 画廊：紫红色，艺术馆/书桌
  - Reading 图书馆：青绿色，古堡/书架
  - Listening 四海：蓝白色，海洋/大陆

### 5.2 PixiJS 实现要点

- **地图**：分层渲染（背景层 + 节点层 + 路径层 + UI 层）
- **节点动画**：未解锁=灰雾遮罩，可挑战=脉冲发光，已通关=金色徽章 + 星级
- **路径连线**：贝塞尔曲线，已通关路径流动光效
- **入关动画**：节点放大 → 屏幕拉近 → 进入关卡场景（Pixi `Container` 切换）
- **奖励飘字**：粒子系统，金币/EXP 飞向 UI 角落

### 5.3 关卡内界面

- **Speaking**：左侧角色立绘（场景中的 NPC），右侧字幕区，底部录音按钮 + 实时波形
- **Writing**：左侧题目，右侧编辑器，提交后右侧切换为标注视图
- **Reading**：上方 passage，下方题目，可分屏 / 高亮 / 笔记
- **Listening**：中央播放器 + 进度条，下方题目流式出现，结束后可定位回放

---

## 6. 技术架构

### 6.1 前端

```
Next.js 15 (App Router)
├── React 19 + TypeScript
├── Pixi.js 8 (地图与关卡场景)
├── Zustand (全局状态：用户、地图、进度)
├── TanStack Query (Agent API 缓存)
├── Tailwind + shadcn/ui (非地图 UI)
└── Web Audio API (录音 / 播放)
```

### 6.2 后端

```
Node.js (Hono / Next.js Route Handlers)
├── 4 个 Agent 服务（独立路由，独立 system prompt）
│   ├── /api/agents/speaking
│   ├── /api/agents/writing
│   ├── /api/agents/reading
│   └── /api/agents/listening
├── LLM 调用：
│   - 开发期：Claude / GPT（经 EvoMap 网关 api.evomap.ai，复用 ~/.claude/settings.json）
│   - 应用运行时：Qwen（qwen-turbo / qwen-plus / qwen-max），走 DashScope
├── ASR：阿里云 DashScope Paraformer（学生说话转写，中英文都支持）
├── TTS：阿里云 DashScope CosyVoice / Qwen-TTS
│   - 用途：口语场景 NPC 语音、听力素材
│   - 多发音人、可指定英美口音
│   - 按字符计费，MVP 阶段可忽略不计
├── Pronunciation：Azure Speech / SpeechAce（评分用，可后置到 M2 之后）
└── 数据库：SQLite + Drizzle（本地单机版，桌面 Web 应用）
```

**统一 API Key**：TTS / ASR / LLM 都走同一个 `DASHSCOPE_API_KEY`（环境变量），
存放在 `.env.local`（已 gitignored）。Key 已验证可用。

### 6.3 学习图谱引擎（自建，名字暂定 `progress-graph`）

雅思应用本身需要一套**学生侧的学习图谱**，存储与演化用户的能力图。这是项目内自建的领域服务，**与开发侧 evomap 同名不同物**。

```typescript
type Node = {
  id: string
  skill: 'speaking' | 'writing' | 'reading' | 'listening'
  type: 'lesson' | 'practice' | 'boss' | 'review'
  scenario?: string         // speaking
  questionType?: string     // reading / listening
  topic?: string            // writing / reading
  difficulty: 1-10
  prerequisites: NodeId[]
  rewards: { exp, gold, gems? }
  mastery: 0-1              // 用户掌握度，影响 SRS
}

type Edge = {
  from: NodeId
  to: NodeId
  kind: 'unlock' | 'similar' | 'review'
}
```

**演化规则**（由 SQLite 存储 + Node.js 调度器实现）：
- 完成节点 → 更新 mastery，可能解锁邻接节点
- 错题模式识别 → 生成新的"补强节点"插入图中
- 高遗忘度节点 → 通过 `review` 边重新点亮，进入复习队列（基于 SM-2 / FSRS 算法）

> ⚠️ 命名要小心：本服务在代码里**不要**用 `evomap` 这个词，避免和开发侧的 EvoMap 插件混淆。建议起名 `progress-graph` / `skill-graph` / `quest-graph`。

### 6.4 数据模型（核心表）

- `users`（id, email, level, exp, gold, gems, segment）
- `nodes`（同 evomap Node）
- `attempts`（user_id, node_id, score, stars, transcript / essay / answers, created_at）
- `unlocks`（user_id, node_id, source: 'progression' | 'purchase'）
- `mastery_log`（user_id, node_id, mastery_value, sampled_at） — SRS 用

---

## 7. MVP 与里程碑

### Milestone 1（2 周）— 单 Agent 闭环

- ✅ Speaking Agent + 言语城邦的"新手区"（公寓 + 咖啡馆 6 关）
- ✅ 用户系统、积分、关卡 1-3 星
- ✅ Pixi 地图渲染 + 节点解锁动画
- ✅ 关卡内：录音、ASR、Agent 评分、反馈卡片
- 目的：跑通"地图 → 关卡 → Agent → 反馈 → 积分 → 解锁"完整闭环

### Milestone 2（2 周）— 第二个 Agent

- ✅ Writing Agent + 文墨画廊（Task 2 议论文 8 关）
- ✅ 句子级标注、范文对比
- ✅ 两张地图共享同一套进度系统

### Milestone 3（3 周）— 阅读 + 听力

- ✅ Reading Agent + Scholar's Library（题型 4 层）
- ✅ Listening Agent + Four Seas（Section 1 完整 + 子技能训练所）

### Milestone 4（2 周）— 学习图谱演化 + SRS

- ✅ 弱点识别 → 自动插入补强节点
- ✅ 复习曲线 → 节点回亮
- ✅ 跨技能推荐（如听力差影响口语 → 推荐听力关）

### Milestone 5（持续）— 内容扩展 + 社交

- ✅ 装备 / 皮肤 / 头衔
- ✅ 排行榜、好友对比、组队 Boss
- ✅ AI 生成题库扩充（注意：剑桥真题有版权，全部走"Agent 生成 + 人工校对"路线）

---

## 8. 决策记录（已敲定）

1. **桌面端形态**：纯 Web，浏览器访问。不打 Electron。
2. **数据持久化**：本地 SQLite（单机版，无账号）。后续如果加云同步再演进到 Postgres。
3. **TTS / ASR / LLM 全栈**：阿里云 DashScope 一站式
   - TTS：CosyVoice / Qwen-TTS
   - ASR：Paraformer
   - LLM（应用运行时）：Qwen 系列
   - 一个 `DASHSCOPE_API_KEY` 全打通，已配置且验证可用
4. **题库版权**：不使用剑桥真题。第一批关卡内容由 LLM Agent 生成 + 联网搜参考资料校对。
5. **付费模式**：不考虑。游戏内积分（Gold/Gems）是虚拟货币，非真实付费。

---

## 9. 初始题库内容（M1–M2 范围）

第一批关卡内容由 LLM Agent 生成，按下面的分类骨架批量生产。生成后人工抽查校对，存进 SQLite `nodes` 表。

### 9.1 Speaking — 言语城邦新手区（M1 范围，约 15–20 关）

每个场景一个建筑物，建筑物下 3–5 关。

**新手区建筑物清单**：
- **公寓**：Self-introduction、Hometown、Daily routine、Family
- **咖啡馆**：Order coffee、Small talk with barista、Pay & tip、Complain about cold drink
- **超市**：Find an item、Ask about discount、Checkout、Use a coupon
- **公交站**：Ask for directions、Buy a ticket、Talk to a stranger about weather

**Part 1 题库分类**（每类 8–10 题，AI 生成 + 校对）：
- Hometown / Accommodation / Work / Study / Hobbies / Family / Food / Weather / Holidays / Technology

**Part 2 cue card 分类**（参考雅思官方 2025–2026 题型轮换，每类 4–6 题）：
- People（influential person / creative person / teacher / friend）
- Places（city to visit / quiet place / historical place / waterfront）
- Objects（useful technology / gift / clothing / art piece）
- Events（time you helped someone / memorable journey / interesting conversation / special celebration）
- Activities（skill to learn / hobby / outdoor activity）
- 当代话题（social media use / useful app / work from home / environmental problem）

### 9.2 Writing — 文墨画廊（M2 范围）

**Task 2 题型**（5 类，每类生成 6–8 道题）：
1. **Opinion（Agree/Disagree）**："To what extent do you agree or disagree?"
2. **Discussion**："Discuss both views and give your own opinion."
3. **Problem & Solution**：原因 + 解决方案
4. **Advantages & Disadvantages**（含 outweigh 子类）
5. **Two-Part Question**：两个直接问题

**Task 2 topic 类别**：Education / Environment / Technology / Society / Health / Government / Globalization / Media（每个 topic 下 5–8 道）。

**Task 1 类别**（首批先做图表）：折线图 / 柱状图 / 饼图 / 表格 / 流程图 / 地图（每类 5 道）。

**评分 rubric**：严格按雅思官方 4 维（TA / CC / LR / GRA），prompt 中给 LLM 明确的 band 5/6/7/8/9 区分描述符。

### 9.3 Reading — 学者图书馆（M3 范围）

**题型主线**（每题型 30–50 题）：
1. Multiple Choice
2. True / False / Not Given
3. Matching Headings
4. Sentence Completion
5. Summary Completion
6. Matching Information
7. Short-answer Questions

**学科副线**（每学科 20–30 篇 passage）：Science / Nature / History / Society / Technology。
passage 由 LLM 生成（500–900 词），题目按题型 batch 生成。

### 9.4 Listening — 四海大陆（M3 范围）

**4 个 Section 对应 4 块大陆**，每块大陆 10–15 关：
- Section 1（日常岛）：双人对话填空 + 选择
- Section 2（文化大陆）：单人独白 + 地图题
- Section 3（学术群岛）：2–4 人讨论 + 配对
- Section 4（知识火山）：学术讲座 + 笔记填空

**子技能训练所**（跨 Section）：数字 / 拼写 / 同义替换 / 信号词，每类 30 道 3-min 小关。

**音频生成**：脚本由 LLM 写，TTS 用 CosyVoice 多发音人合成（不同口音、语速、情感）。

### 9.5 生成策略

- **批量生成**：写一套通用 prompt 模板，按 (skill, type, topic, difficulty) 网格扫一遍
- **人工校对**：每生成一批先抽 20% 人工看，校对完才入库
- **版本化**：每道题带 `generator_version`，方便迭代 prompt 后重新生成
- **来源备注**：题目元数据存 prompt + 参考来源，方便后续追溯

---

## 10. 下一步建议

如果以上方向你认可，建议立刻做的是 **Milestone 1 的端到端原型**：

1. 用 Next.js + Pixi 搭出 1 张极小地图（5 个节点）
2. 接通 Speaking Agent（Qwen LLM + DashScope ASR + CosyVoice TTS），跑一个"咖啡馆点单"场景
3. 把"打关 → 评分 → 加积分 → 解锁下一关"闭环跑通

这一步打通后，复用到其他 3 个 Agent 是机械工作；卡点会集中在 Agent 的 prompt 质量、ASR 延迟、Pixi 地图视觉。
