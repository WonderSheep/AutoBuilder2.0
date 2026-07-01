# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 这个项目是什么

AutoBuilder 2.0 —— 一个基于 Playwright 的浏览器自动化工具，用于在中国各广告平台（腾讯 ad.qq.com、B站 ad.bilibili.com、抖音/番茄 oceanengine.com）批量搭建广告计划。它从 Excel 读取配置，逐行驱动平台 Web UI 创建计划/单元/创意，再把生成的 ID 与完成标记回写到 Excel 中。业务背景是肯德基（KFC）的广告投放。

## 如何运行

面向最终用户的启动器是 [请点这个.bat](请点这个.bat)：若缺少 `node_modules` 则先在 `src/` 下安装依赖，然后用**自带的** [src/node.exe](src/node.exe) 运行 [src/index.js](src/index.js)。`node.exe`（91 MB）已提交进仓库，这样最终用户无需自己安装 Node。

在本仓库里运行：`node src/index.js`（或在 Windows 上双击 `.bat`）。程序会以交互方式提示，并在登录环节等待回车。**运行前请关闭 Excel**——[main()](src/index.js) 启动时调用 [assertExcelWritable](src/utils.js) 检测输入 xlsx 是否被占用，被占用会直接报错中止（避免回写断点状态静默失败）。

**运行期间自动防休眠**：[main()](src/index.js) 启动时调用 [keepAwake](src/utils.js)，起一个后台 PowerShell 调用 Win32 `SetThreadExecutionState`，让 Windows 在搭建期间（含登录等待）**不进入休眠/熄屏**——因为非 headless 浏览器一旦休眠/熄屏会连接超时崩溃。公司机系统休眠设置锁不住、也无需管理员权限、不改任何系统设置，只在该子进程存活期间生效；程序退出（`stopKeepAwake`，挂在 `process.on('exit')`，先注册再起子进程确保任何退出路径都清理）即解除，最长兜底 2 小时自退（防 Node 被强杀后子进程变孤儿）。**陷阱**：PowerShell 把 `0x80000003` 当 Int32 解析会溢出成负数、转 `uint32` 失败导致 `SetThreadExecutionState` 静默不生效，故该值在 [utils.js](src/utils.js) 里写成十进制 `2147483651`（=0x80000003 = ES_CONTINUOUS|ES_SYSTEM_REQUIRED|ES_DISPLAY_REQUIRED）。

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
- **输入和输出是同一个文件**，位于项目根目录（不是 `src/` 下）。[readExcelFile](src/utils.js) 自动识别根目录里的那个 `.xlsx`（跳过 `~$`/`$` 临时锁文件），读取时统一 trim 所有字符串单元格的头尾空白（避免脏数据干扰中文文本匹配）；[readTxtFile](src/utils.js) 对 `.txt`（CPC 避投人群包文件）做同样的事，优先 utf-8，失败则用 `iconv-lite` 按 gbk 解码。
- **Excel 数据按列索引按位置读取，而不是按表头名称**（`Object.values(row)[N]`）。各列索引含义因平台而异，以内联注释的形式定义在每个 runner 中（例如腾讯：`values[13]` = 媒体、`values[31]` = 小程序链接、`values[45]` = 素材名；B站：`values[35]` = 广告账户；抖音：`values[0]` = 策略ID）。当模板列发生变化时，必须更新这些**索引**，而不是任何表头查找逻辑。
- **回写也是就地写回同一个原文件**（不再生成 `media_id_...` 新文件）：每完成一个阶段，runner 把从 URL 解析出的 ID 连同"完成标记"通过 [writeBackInPlace](src/utils.js) 就地增量写回原 xlsx（基于原工作簿改，保留格式；回写失败抛致命错误立即中止整批（方案F，不重试））。回写列与标记因平台而异——腾讯选点位后写 adgroupId→col42 并置 BA(57)、提交创意后写 dynamicCreativeId→col43 并置 BB(58)；抖音建项目后写 project_id→col41（覆盖已用完的复制源项目 copyAd）并置 BA(57)、建单元后清空 col42（复制源单元 copyUn）并置 BB(58)；B站写 campaign_id→AR(43) 并置 BB(58)。**BB 列（0-based 58 / 第 59 列）='1' 表示整行完成**（三平台共用）；腾讯/抖音另有 **BA 列（0-based 57 / 第 58 列）='1' 表示阶段完成**（腾讯=广告组已建 / 抖音=项目已建），让崩在中间的行能从阶段后续跑、而非整行重来。全部完成后腾讯/抖音删 AS(0-based 44)及之后的列（含 BA、BB、素材列），原文件即最终产物；B站不删列。（**⛔ 该删列收尾当前已临时关停**，三个调用点已注释，详见下方"断点续跑"一节。）

## 各平台 runner 的模式

- **[run_adq.js](src/run_adq.js)**（腾讯）最大、最复杂。每个广告单元都从复制一个已有广告（`ref_adgroup_id`）开始，然后创意部分按"点位"通过两张分发表填充：`pagePositionMap`（点位 → UI 上的位置文案）和 `componentMap`（点位 → 营销组件设置函数，如 `wxFriendsCardBp`、`wxTvShubanVideo`；因创意内容按行从 Excel 读，它被抽成工厂函数 `buildComponentMap` 在循环内每行重建）。创意内容（人群标签/素材/文案/品牌形象/行动按钮/标签/首评回复/浮层卡片）从 `values[44-51]` 每行读取，不再在循环前手动 `promptUser` 输入。CPC 排除人群按**行序** `getNthChoice(index + 1)` 取避投组合。文件含三个导出：`runAdq`（创建）、`runAdqReplace`（替换创意）、`runAdqCreTemplate`（创建定向模版，按 2^N−1 个组合循环，不参与行级断点续跑）。
- **[run_bili.js](src/run_bili.js)** 通过 `planDict` 把多行归并到 B站计划（key 为 `campaignNm_audience`）：每个分组的第一行创建计划并存下从 URL 解析出的 `campaign_id`；同组后续行复用它。用到两个页面 —— 一个处理小程序素材，一个走计划/单元流程。
- **[run_dy.js](src/run_dy.js)** 复制一个已有的抖音项目+广告（`is_copy=1`），填好定向/预算后保存，从 URL 读回 `project_id`，再在其下创建广告单元。三者中最轻量。

三个 runner 都接入了同一套基于 BB 列的断点续跑机制，其中腾讯/抖音额外加了 BA 阶段标记（见下一节）。

## 断点续跑（腾讯/抖音：BA+BB 两级标记；B站：BB 单标记）

防止"平台报错中断 → 重跑重复搭建"。腾讯、抖音把"行完成"拆成**两级**标记，崩在中间能从更精确的阶段续跑而非整行重来；B站只有行级标记。核心工具都在 [utils.js](src/utils.js)：`readDoneRows`（启动恢复已完成行）、`markRowAndPersist`（增量回写；回写失败抛致命错误立即中止整批，见下方「断点续跑」节）、`trimColumnsIfAllDone`（全部完成则删列；**⛔ 其三处调用当前已注释关停**：runDy / runAdq / runAdqReplace 末尾）。`writeBackInPlace` 用 `value=null` 清空单元格（抖音清复制源用）。

- **BB 列（0-based 58 / 第 59 列）= `'1'`** → **整行完成**，三平台共用，`readDoneRows` 据此在循环里跳过整行。
- **BA 列（0-based 57 / 第 58 列）= `'1'`** → **阶段完成**，仅腾讯/抖音有：腾讯=广告组已建、抖音=项目已建。崩在这一步之后、整行完成之前，重跑检测到 BA='1' 就跳过该阶段创建、直达下一步，避免重复建广告组/项目。（程序在写 BA 前会先确认真抠到了 ID，否则抛错不置 BA，让该行下次整体重试，避免置了 BA 却没 ID 把行卡死。）
- **手动控制**（关键能力）：在 Excel 里直接改 **BB 列** —— 删掉某行的 `1` → 整行重跑；手动填上 `1` → 强制跳过（如明知有问题的行）。BA 由程序自动写，正常无需手改。
- **行级「刷新 + 重试」容错**（runDy + runAdq + runBili 有；runAdqReplace 无）：单行搭建首跑失败时，自动刷新页面重试，最多重试 2 次（共 3 次尝试）。实测刷新后重试可解决约 80% 的瞬时错误（选择器偶发抽风、页面没加载完），从而**不再动辄整批中断、手动重点 .bat**。它复用的就是上面这套 BA/BB 续跑逻辑——"重试本行"= 重新进入行体、让守卫自己跳过已建阶段（腾讯/抖音靠 BA 列，B站靠 planDict 复用已建计划），**不另造幂等性**。**绝不跳行**：3 次全失败就抛聚合错误、中止整批（沿用 main 兜底 + runner finally 关浏览器），人工处理后重点 .bat 续跑。核心工具在 [utils.js](src/utils.js)：`withRowRetry(index, retries, run)`（重试循环 + 计数 + 到顶抛聚合错误）、`robustRefresh(page, context, url)`（goto 干净 URL 逃出卡死状态，失败则同 context 新开 tab，**永不抛错**）。runDy 把行体直接包进 `withRowRetry` 回调；runAdq / runBili 把行体抽成嵌套函数 `processRow(index, attempt)` 再由 `withRowRetry` 调用（行体内容一字未改）。**B站特殊**：用两个 page（page1 小程序页 + page 主流程），重试只刷新 `page`（page1 不刷）；计划+单元+创意是一次保存原子完成（无"建一半"中间态），无 BA 阶段标记；小程序添加在重试内，重试可能留重复小程序条目（可接受）。
  > **内存与磁盘一致性（#2 优化后）**：`markRowAndPersist` 现在「先写磁盘成功、再同步更新内存 `df`」（新增 `applyRowToMemory`，经 `Object.keys` 按列号定位键名；**该行列不足时回退整行 `readExcelFile` 刷新，绝不写错列**）。故同进程行级重试时 BA/BB 守卫能直接读到内存最新值，**重试前不再需要** `df[index] = readExcelFile()[index]`（runDy / runAdq / runBili 三处已移除）。崩溃重启仍靠启动时 `readExcelFile` 全量重建内存（不变）；写入顺序「先磁盘后内存」保证内存永不超前磁盘。（配 #1：`writeBackInPlace` 现缓存整个 workbook 复用，免去每次回写都 readFile 整本表——运行期 Excel 关闭、只有本进程写，内存累积态 ≡ 磁盘态。）

各平台写入与续跑细节：

- **腾讯（runAdq）**：复制源广告读自 col42(`copyAd`)。选点位成功（=广告组已建）即把 URL 的 `adgroup_id` 写回 col42（覆盖 copyAd）并置 BA(57)；提交创意后写 `dynamic_creative_id`→col43 并置 BB(58)。续跑时 BA='1' 而 BB≠'1' 则直达 `creatives-add?adgroup_id=` 重选点位、继续创意，跳过广告组创建。`runAdqReplace`（替换创意）只回写 BB，无阶段标记。
- **抖音（runDy）**：复制源项目读自 col41(`copyAd`)、复制源单元读自 col42(`copyUn`)。建完项目即把 `project_id` 写回 col41（覆盖 copyAd）并置 BA(57)；建完单元清空 col42(`copyUn`) 并置 BB(58)。续跑时 BA='1' 而 BB≠'1' 则复用 col41 的 project_id 直接建单元，跳过建项目。崩在"建单元途中"仍可能重复单元（未回写单元 ID，无法检测），窗口很小、可清理。
- **B站（runBili）**：只有 BB(58) 行级标记；另把已建计划的 `campaign_id` 写到 **AR(43)**（计划级），供同 `campaignNm_audience` 的其他行复用、重建 `planDict`。B站**不删列收尾**（保留 AS 及之后所有列）。
- **删列收尾**（仅 runAdq / runAdqReplace / runDy）：循环正常跑完（BB 全满）就删 AS(0-based 44)及之后的列（含 BA、BB、素材列），保留 col≤43（含交付要用的 adgroupId/dynamicCreativeId/project_id），原文件即最终产物；没跑完则保留全部列以便续跑。**⛔ 当前已临时关停**——三处调用点（[run_dy.js:115](src/run_dy.js#L115)、[run_adq.js:228](src/run_adq.js#L228)、[run_adq.js:580](src/run_adq.js#L580)）均已注释掉，utils.js 里的 `trimColumnsIfAllDone` 函数本体保留未动。关停后任务跑完不再删列，BA/BB 标记会留在文件里，**重跑同一个文件前需手动清掉对应行的 BB 列**（见上方"手动控制"）。恢复方法：把那三行注释取消即可。

注意：删列是**不可逆**终态（素材列没了，这个文件不能再跑，搭建前请备份）——该行为**当前已关停，等重新启用后才需留意**。**运行前 Excel 必须关闭**——[main()](src/index.js) 启动时调用 [assertExcelWritable](src/utils.js) 用 `r+` 探测占用，文件在 Excel 中打开（EBUSY/EPERM/EACCES）会直接报错中止，避免后续回写静默失败。腾讯 CPC 避投组合按行序 `index+1` 取，跳过已完成行不会让组合错位。

## 选择器很脆弱 —— 需要持续维护

几乎每一次交互都靠**中文可见文本**或**一长串自动生成的 CSS 类名**来匹配（如 `div.h-full.flex-col.gap-4.px-12...span.ellipsis.odc-text`）。只要广告平台更新 UI，这些就会失效 —— 这正是本仓库主要的持续维护工作。当某一步报错时，修复方法通常是在已有的 Playwright 风格（`getByRole`、`getByText`、`locator().filter({hasText})`）下重新录制选择器，而不是重构代码结构。

## 登录态 / 鉴权

每个平台把 Playwright 的 `storageState` JSON 持久化在项目根目录：`auth_state_adq.json`、`auth_state_bili.json`、`auth_state_dy.json`。[launchBrowser](src/utils.js) 在 win/mac/linux 上查找本机 Chrome（找不到则回退到 Edge），以非 headless 方式启动，并加上防自动化检测参数（`--disable-blink-features=AutomationControlled`），随后用已保存的 context 还原。每次运行都会提示用户确认已登录，再在开始前重新保存状态 —— 所以每个平台第一次运行都需要手动登录一次。
