# FORMULA: MOBIUS

本页面为FORMULA: MOBIUS企划的游戏页面（单人版）（beta）
纯娱乐用途，不主张任何第三方材料的版权
本项目的代码声明PolyForm Noncommercial
原创内容声明CC BY-NC-SA
如果你不知道FORMULA: MOBIUS企划是什么那你来错地方了

## AI使用声明

本项目开发阶段使用 OpenAI Codex辅助代码编写、问题排查及文档整理；使用 gpt-6-luna 进行语料标注和角色口吻模拟。相关生成过程受到项目约束、既有材料和人工示例的引导。
人工智能辅助产出仍可能存在事实错误、重复表达及风格偏差；其使用不构成材料真实性或权利状态的证明。

没有使用任何图片式生成功能，除了部分社交媒体部分的语料外，文本都是匠心手写的（Codex如果自主添加了什么可以举报给我，qq联系。而且Codex有的时候会自主给我润色，这些懒得改了）

以及这个README.md的注释（大致）是Codex写的

## 材料来源与使用说明

### 规则与赛事传播材料

规则参考《F1规则（公开版）》。这是我和@萝卜在2025年写的，当时已公开

### 文本数据与合成语料

Comment1000[5]用于文本筛选与表达整理。处理涉及现实实体遮蔽、虚构实体槽位替换、标签标注及事件绑定；项目包含由该来源整理的运行表达，而非原始数据集的完整再发布。其仓库关联论文题名为 *SinoSarcasmClassifier: A Multi-View Model for Sarcasm Detection in Chinese Social Media with Emoji Mapping*。

PTT FORMULA1 讨论记录[6–17]用于表达整理。当前运行文件 `research/text-generation/expansion/build/expressions.json` 包含 9 条该来源的衍生表达。

Bilibili 评论采集项目中的示例文件[18]仅用于离线研究短句及对话形式，未作为当前运行语料。相关参考版本为 `aeac0ba2d92703fa26199a03816ff10fbb404a57`。Reddit 与 Whirlpool 讨论[19–20]用于口吻参考；此前取得的材料限于检索索引中的部分内容，不属于完整语料库。

动态模板、工程师与解说片段、粉丝表达及账号简介等补充材料由 gpt-6-luna 在项目约束下生成或标注。上述合成材料与外部文本来源分别记录，不以模型生成替代来源归属。

### 界面与视觉材料

社交界面的布局与交互组织参考 twitter-clone[21]及 The Flock[22]。赛车俯视结构参考 Motorsport 的赛车比较材料[23]；项目中对应图形由代码绘制，未直接分发该文图片。<-这个技术性类似于jpg转矢量图

GLSL 背景文件 `src/components/visual/ShaderRaceBackdrop.tsx` 作者Yohei Nishitsuji[24]；这位互联网菩萨的代码是MIT License（仅限X上发布）

### 字体与软件

分发字体为 Archivo、Orbitron 与 Noto Sans SC[25–27]，包含字形子集或格式处理。软件组件包括 Next.js、React／React DOM、TypeScript、pnpm、ESLint 与 Vitest[28–33]；具体依赖版本由 [package.json](./package.json) 和 [pnpm-lock.yaml](./pnpm-lock.yaml) 记录。

## 权利与许可声明

Comment1000 随附许可为 CC BY-NC 4.0[34]，
项目保留其[来源说明](./research/text-generation/2026-10-08/raw/comment1000.README.md)及[许可文本](./research/text-generation/2026-10-08/raw/comment1000.LICENSE)。

三种分发字体随附 SIL Open Font License 1.1。版权标识及本地许可文件如下：
- Archivo：Copyright 2020 The Archivo Project Authors；[OFL-Archivo.txt](./public/fonts/OFL-Archivo.txt)。
- Orbitron：Copyright 2018 The Orbitron Project Authors；Reserved Font Name: Orbitron；[OFL-Orbitron.txt](./public/fonts/OFL-Orbitron.txt)。
- Noto Sans SC：随附许可记载 Copyright 2014–2021 Adobe；Reserved Font Name: Source；[OFL-NotoSansSC.txt](./public/fonts/OFL-NotoSansSC.txt)。

字体修改与保留字体名条款以随附许可及 OFL 说明[35]为准。

## 参考文献与资源

以下采用顺序编码式著录。来源记录整理日期：2026-10-13。

[1] FÉDÉRATION INTERNATIONALE DE L’AUTOMOBILE. 2025 Formula 1 Sporting Regulations: Issue 4[EB/OL]. 2025-02-26. [原文](https://www.fia.com/system/files/documents/fia_2025_formula_1_sporting_regulations_-_issue_4_-_2025-02-26.pdf).

[2] FORMULA 1. Fastest lap point to be scrapped in 2025 after latest FIA World Motor Sport Council meeting[EB/OL]. [原文](https://www.formula1.com/en/latest/article/fastest-lap-point-to-be-scrapped-in-2025-after-latest-fia-world-motor-sport.4pUjDzWnGRN7KVWENLc1BY).

[3] X／TWITTER. Buckle up for the F1 start on Twitter[EB/OL]. 2015. [原文](https://blog.x.com/en_us/a/2015/buckle-up-for-the-f1-start-on-twitter).

[4] MCLAREN RACING. 2025 Canadian Grand Prix: Race Report[EB/OL]. 2025. [原文](https://www.mclaren.com/racing/formula-1/2025/canadian-grand-prix/race-report/).

[5] LIUZIPEI-RYUSHIHAI（仓库维护账号）. Comment1000[DS/OL]. [数据仓库](https://github.com/LIUZIPEI-RYUSHIHAI/comment1000).

[6] PTT FORMULA1 讨论记录：M.1578675770.A.D82[EB/OL]. [来源](https://www.ptt.cc/bbs/FORMULA1/M.1578675770.A.D82.html).

[7] PTT FORMULA1 讨论记录：M.1773069597.A.82A[EB/OL]. [来源](https://www.ptt.cc/bbs/FORMULA1/M.1773069597.A.82A.html).

[8] PTT FORMULA1 讨论记录：M.1789558576.A.082[EB/OL]. [来源](https://www.ptt.cc/bbs/FORMULA1/M.1789558576.A.082.html).

[9] PTT FORMULA1 讨论记录：M.1754233984.A.19B[EB/OL]. [来源](https://www.ptt.cc/bbs/FORMULA1/M.1754233984.A.19B.html).

[10] PTT FORMULA1 讨论记录：M.1754232532.A.059[EB/OL]. [来源](https://www.ptt.cc/bbs/FORMULA1/M.1754232532.A.059.html).

[11] PTT FORMULA1 讨论记录：M.1756730079.A.3C8[EB/OL]. [来源](https://www.ptt.cc/bbs/FORMULA1/M.1756730079.A.3C8.html).

[12] PTT FORMULA1 讨论记录：M.1716734252.A.07E[EB/OL]. [来源](https://www.ptt.cc/bbs/FORMULA1/M.1716734252.A.07E.html).

[13] PTT FORMULA1 讨论记录：M.1789364256.A.B3A[EB/OL]. [来源](https://www.ptt.cc/bbs/FORMULA1/M.1789364256.A.B3A.html).

[14] PTT FORMULA1 讨论记录：M.1765037364.A.5A6[EB/OL]. [来源](https://www.ptt.cc/bbs/FORMULA1/M.1765037364.A.5A6.html).

[15] PTT FORMULA1 讨论记录：M.1757224561.A.D82[EB/OL]. [来源](https://www.ptt.cc/bbs/FORMULA1/M.1757224561.A.D82.html).

[16] PTT FORMULA1 讨论记录：M.1765546260.A.B82[EB/OL]. [来源](https://www.ptt.cc/bbs/FORMULA1/M.1765546260.A.B82.html).

[17] PTT FORMULA1 讨论记录：M.1756661471.A.8BE[EB/OL]. [来源](https://www.ptt.cc/bbs/FORMULA1/M.1756661471.A.8BE.html).

[18] FUNNYSALTYFISH. bilibili_comments_crawl[CP/OL]. [代码及示例仓库](https://github.com/FunnySaltyFish/bilibili_comments_crawl).

[19] r/formula1 讨论记录：1v0r5t3[EB/OL]. [来源](https://www.reddit.com/r/formula1/comments/1v0r5t3/autosport_george_russell_has_blamed_an_issue_with/).

[20] Whirlpool 讨论记录：974pvp1v-2[EB/OL]. [来源](https://forums.whirlpool.net.au/archive/974pvp1v-2).

[21] CCRSXX. twitter-clone[CP/OL]. [代码仓库](https://github.com/ccrsxx/twitter-clone).

[22] QUILAGUYPRIME. The Flock[CP/OL]. [代码仓库](https://github.com/QuilaguyPrime/the-flock).

[23] MOTORSPORT.COM. Formula 1 2021／2022 赛车比较材料[EB/OL]. [来源](https://es.motorsport.com/f1/news/comparativa-formula1-2021-2022-coche/6631426/).

[24] NISHITSUJI Y. Yohei Nishitsuji：艺术参考账号[EB/OL]. [来源](https://x.com/YoheiNishitsuji).

[25] THE ARCHIVO PROJECT AUTHORS. Archivo[CP/OL]. [字体源仓库](https://github.com/Omnibus-Type/Archivo).

[26] THE ORBITRON PROJECT AUTHORS. Orbitron[CP/OL]. [字体源仓库](https://github.com/theleagueof/orbitron).

[27] GOOGLE FONTS. Noto Sans SC[CP/OL]. [字体源目录](https://github.com/google/fonts/tree/main/ofl/notosanssc).

[28] VERCEL 及项目贡献者. Next.js[CP/OL]. [代码仓库](https://github.com/vercel/next.js).

[29] REACT 项目贡献者. React[CP/OL]. [代码仓库](https://github.com/facebook/react).

[30] MICROSOFT 及项目贡献者. TypeScript[CP/OL]. [代码仓库](https://github.com/microsoft/TypeScript).

[31] PNPM 项目贡献者. pnpm[CP/OL]. [代码仓库](https://github.com/pnpm/pnpm).

[32] ESLINT 项目贡献者. ESLint[CP/OL]. [代码仓库](https://github.com/eslint/eslint).

[33] VITEST 项目贡献者. Vitest[CP/OL]. [代码仓库](https://github.com/vitest-dev/vitest).

[34] CREATIVE COMMONS. Attribution-NonCommercial 4.0 International[EB/OL]. [许可说明](https://creativecommons.org/licenses/by-nc/4.0/deed.en).

[35] SIL INTERNATIONAL. SIL Open Font License FAQ[EB/OL]. [许可说明](https://openfontlicense.org/ofl-faq/).
