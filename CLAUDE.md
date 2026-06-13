# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 这个项目是什么

AutoBuilder 2.0 —— 一个基于 Playwright 的浏览器自动化工具，用于在中国各广告平台（腾讯 ad.qq.com、B站 ad.bilibili.com、抖音/番茄 oceanengine.com）批量搭建广告计划。它从 Excel 读取配置，逐行驱动平台 Web UI 创建计划/单元/创意，再把生成的 ID 与完成标记回写到 Excel 中。业务背景是肯德基（KFC）的广告投放。

## 如何运行

面向最终用户的启动器是 [请点这个.bat](请点这个.bat)：若缺少 `node_modules` 则先在 `src/` 下安装依赖，然后用**自带的** [src/node.exe](src/node.exe) 运行 [src/index.js](src/index.js)。`node.exe`（91 MB）已提交进仓库，这样最终用户无需自己安装 Node。

在本仓库里运行：`node src/index.js`（或在 Windows 上双击 `.bat`）。程序会以交互方式提示，并在登录环节等待回车。

**不要依赖 [src/package.json](src/package.json) 里的 npm 脚本。** `build`/`start`/`dev` 引用的 TypeScript 源码和 `dist/` 目录**并不存在**。`src/` 下的 `.js` 文件是 tsc 编译产物，但现在被直接手工修改 —— 仓库里没有 `.ts` 源码。请把这些 `.js` 文件当作真正的源码，直接在原地编辑；不要尝试用 `tsc` 重新生成。

## 调度逻辑（全局视角）

[src/index.js](src/index.js) 是唯一入口。`main()` 读取项目根目录下的单个 Excel 文件，检查**第一行的结构**，然后分支到某个 runner：

| 第一行判断条件 | 模式 | Runner |
|---|---|---|
| 第 12 列 === `媒体` | B站 | [runBili](src/run_bili.js) |
| 第 13 列值 === `抖音` / `番茄系媒体` | 抖音/番茄 | [runDy](src/run_dy.js) |
| 第 13 列值匹配 `/(微信\|QQ\|腾讯音乐\|游戏)/` | 腾讯（创建） | [runAdq](src/run_adq.js) |
| 1 列、0 行 | 腾讯创建定向模版模式 | [runAdqCreTemplate](src/run_adq.js) |
| 其他情况 | 腾讯替换创意模式 | [runAdqReplace](src/run_adq.js) |

对腾讯创建模式，会询问是否为 CPC 搭建；若输入 `Y`，则把一个记录避投人群包 ID 的 `.txt` 加载进 [IDCombinationSelector](src/IDCombinationSelector.js) 并传入。也就是说，**同一个 Excel 结构**决定走腾讯 runner，而运行时的提示决定走哪个子模式。

## 文件 / 数据布局（非显而易见之处）

- 项目根目录是 `d:\AB_Node`，但所有代码都在下一层的 `src/` 中。[src/utils.js](src/utils.js) 把项目根目录算作 `__dirname/..`（即 `src/` 的父目录）。
- **输入和输出是同一个文件**，位于项目根目录（不是 `src/` 下）。[readExcelFile](src/utils.js) 自动识别根目录里的那个 `.xlsx`（跳过 `~$`/`$` 临时锁文件）；[readTxtFile](src/utils.js) 对 `.txt`（CPC 避投人群包文件）做同样的事，优先 utf-8，失败则用 `iconv-lite` 按 gbk 解码。
- **Excel 数据按列索引按位置读取，而不是按表头名称**（`Object.values(row)[N]`）。各列索引含义因平台而异，以内联注释的形式定义在每个 runner 中（例如腾讯：`values[13]` = 媒体、`values[31]` = 小程序链接、`values[45]` = 素材名；B站：`values[35]` = 广告账户；抖音：`values[0]` = 策略ID）。当模板列发生变化时，必须更新这些**索引**，而不是任何表头查找逻辑。
- **回写也是就地写回同一个原文件**（不再生成 `media_id_...` 新文件）：每条广告建完后，runner 从 URL 解析出 ID，连同"完成标记"一起通过 [writeBackInPlace](src/utils.js) 就地写回原 xlsx（基于原工作簿改，保留格式）。回写列因平台而异——腾讯写 adgroupId(42)/dynamicCreativeId(43)、抖音写 project_id(41) 并清空 copyAd(42)、B站写 campaign_id 到 AR(43)；三个平台的**行完成标记统一写在 BB 列**（第 54 列，填 `1`）。当所有行都完成（BB 全满）时，就地删除 AS 及之后的列（含 BB 和素材列），原文件即最终产物。详见下方"断点续跑"一节。

## 各平台 runner 的模式

- **[run_adq.js](src/run_adq.js)**（腾讯）最大、最复杂。每个广告单元都从复制一个已有广告（`ref_adgroup_id`）开始，然后创意部分按"点位"通过两张分发表填充：`pagePositionMap`（点位 → UI 上的位置文案）和 `componentMap`（点位 → 营销组件设置函数，如 `wxFriendsCardBp`、`wxTvShubanVideo`；因创意内容按行从 Excel 读，它被抽成工厂函数 `buildComponentMap` 在循环内每行重建）。创意内容（人群标签/素材/文案/品牌形象/行动按钮/标签/首评回复/浮层卡片）从 `values[44-51]` 每行读取，不再在循环前手动 `promptUser` 输入。CPC 排除人群按**行序** `getNthChoice(index + 1)` 取避投组合。文件含三个导出：`runAdq`（创建）、`runAdqReplace`（替换创意）、`runAdqCreTemplate`（创建定向模版，按 2^N−1 个组合循环，不参与行级断点续跑）。
- **[run_bili.js](src/run_bili.js)** 通过 `planDict` 把多行归并到 B站计划（key 为 `campaignNm_audience`）：每个分组的第一行创建计划并存下从 URL 解析出的 `campaign_id`；同组后续行复用它。用到两个页面 —— 一个处理小程序素材，一个走计划/单元流程。
- **[run_dy.js](src/run_dy.js)** 复制一个已有的抖音项目+广告（`is_copy=1`），填好定向/预算后保存，从 URL 读回 `project_id`，再在其下创建广告单元。三者中最轻量。

三个 runner 都接入了统一的断点续跑机制（见下一节）。

## 断点续跑（三平台统一）

三个平台用同一套机制防止"平台报错中断 → 重跑重复搭建"，核心都在 [utils.js](src/utils.js)：

- **BB 列（第 54 列，0-based 53）填 `1`** 表示该行已完成。工具：`readDoneRows`（启动时恢复已完成行）、`markRowAndPersist`（每完成一行就就地回写 BB + ID）、`trimColumnsIfAllDone`（BB 全满则删列）。`writeBackInPlace` 支持用 `value=null` 清空单元格（抖音清 copyAd 用）。
- **循环里**：启动时读 BB 跳过已完成行；每完成一行就 `markRowAndPersist` 把 BB(+ID) 写回原文件，所以中途崩溃也不丢进度。
- **手动控制**（关键能力）：在 Excel 里直接操作 BB 列 —— 删掉某行的 `1` → 该行重跑；手动填上 `1` → 强制跳过（比如明知有问题的行）。这让用户能精细控制断点重跑的阶段。
- **删列收尾**：循环正常跑完（BB 全满）就删 AS 及之后的列（含 BB、素材列），原文件即最终产物；若没跑完（BB 没满）则保留全部列，下次续跑。

各平台的额外细节：

- **B站**除 BB（行级标记），还把已建计划的 `campaign_id` 写到 **AR 列**（计划级），供同 `campaignNm_audience` 的其他行复用、重建 `planDict`。
- **抖音**先回写 `project_id`；若某行已有 project_id（上次崩在建项目之后），重跑时复用它直接建单元，**避免重复建项目**。注意崩在"建单元途中"仍可能重复单元（抖音未回写单元 ID，无法检测），窗口很小、单元可清理。
- **腾讯 CPC** 避投组合按行序 `index+1` 取，跳过已完成行不会让组合错位。

注意：删列是**不可逆**终态（素材列没了，这个文件不能再跑，搭建前请备份）；运行时 Excel 别打开（占用会导致回写失败，程序会告警但继续跑，只是那次的进度没存上）。

## 选择器很脆弱 —— 需要持续维护

几乎每一次交互都靠**中文可见文本**或**一长串自动生成的 CSS 类名**来匹配（如 `div.h-full.flex-col.gap-4.px-12...span.ellipsis.odc-text`）。只要广告平台更新 UI，这些就会失效 —— 这正是本仓库主要的持续维护工作。当某一步报错时，修复方法通常是在已有的 Playwright 风格（`getByRole`、`getByText`、`locator().filter({hasText})`）下重新录制选择器，而不是重构代码结构。

## 登录态 / 鉴权

每个平台把 Playwright 的 `storageState` JSON 持久化在项目根目录：`auth_state_adq.json`、`auth_state_bili.json`、`auth_state_dy.json`。[launchBrowser](src/utils.js) 在 win/mac/linux 上查找本机 Chrome（找不到则回退到 Edge），以非 headless 方式启动，并加上防自动化检测参数（`--disable-blink-features=AutomationControlled`），随后用已保存的 context 还原。每次运行都会提示用户确认已登录，再在开始前重新保存状态 —— 所以每个平台第一次运行都需要手动登录一次。
