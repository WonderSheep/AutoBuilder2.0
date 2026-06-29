"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDy = runDy;
const utils_1 = require("./utils");
/**
 * 抖音广告搭建主函数
 */
async function runDy(df) {
    const { browser, context } = await (0, utils_1.launchBrowser)('auth_state_dy.json');
    try {
        let page = await context.newPage();
        // 登录
        await page.goto('https://business.oceanengine.com/site/account-manage/ad/bidding/superior/account');
        (0, utils_1.waitForEnter)('确保当前已处于登录状态后，按下回车开始搭建！\n');
        await (0, utils_1.saveAuthState)(context, 'auth_state_dy.json');
    // 断点续跑：从 BB 列恢复已完成行
    const doneRows = (0, utils_1.readDoneRows)(df);
    console.log(`📦 恢复断点：已完成 ${doneRows.size} 条\n`);
    for (let index = 0; index < df.length; index++) {
        // 断点续跑：已完成（BB 列有标记）的行直接跳过
        if (doneRows.has(index)) {
            continue;
        }
        // 行级「刷新+重试」容错：首跑失败则刷新页面重试 2 次；仍失败则抛错中止整批（绝不跳行）
        await (0, utils_1.withRowRetry)(index, 2, async (attempt) => {
            if (attempt > 0) {
                // 内存 df 已由 markRowAndPersist 在回写时同步（utils.applyRowToMemory），BA 守卫能读到上次写入，无需再全量读盘
                page = await (0, utils_1.robustRefresh)(page, context, 'https://business.oceanengine.com/site/account-manage/ad/bidding/superior/account');
                await (0, utils_1.sleep)(2500);
            }
            const row = df[index];
            // ─── 抖音(dy) 列约定（列号均为 0-based）与断点续跑 ───
            // 数据：0策略ID 2活动名 18脱敏人群 20创意名 23区域 26购买类型
            //       35曝光监测 36点击监测 39RTA 40广告账户 44媒体人群 45人群类型
            // 复制源：AP(41)=复制源项目copyAd   AQ(42)=复制源单元copyUn
            // 标志位：BA(52)='1' 项目已建     BB(53)='1' 整行完成（readDoneRows 据此跳过整行）
            // 续跑写入：建完项目→project_id 写回 AP(覆盖copyAd) 且 BA 置 '1'；
            //          建完单元→清空 AQ 且 BB 置 '1'。
            // 重跑判定：BB='1' 整行跳过；仅 BA='1'（项目已建、单元没建完）则跳过建项目、
            //          复用 AP 里的 project_id 直接建单元，避免重复建项目。
            // 收尾：BA/BB(52/53) 超出 trim 上限(43)，全部完成后自动删除；AP 的 project_id 保留进交付表。
            const values = Object.values(row);
            const strategyId = values[0]; // 策略ID
            const campaignNm = values[2]; // 活动名称
            const audience = values[18]; // 脱敏人群
            const creativeNm = values[20]; // 创意名称
            const city = values[23]; // 区域
            const sellType = values[26]; // 购买类型
            const impTLink = values[35]; // 曝光监测链接
            const clkTlink = values[36]; // 点击监测链接
            const rtaId = values[39]; // RTA ID
            const accountId = values[40]; // 广告账户
            const copyAd = values[41]; // 复制的项目
            const copyUn = values[42]; // 复制的单元
            const audienceMd = values[44]; // 媒体人群
            const audienceTag = values[45]; // 人群类型
            const unitNm = `${strategyId}_${campaignNm}_${creativeNm}_${rtaId}_${audienceTag}_${audience}_${city}_${sellType}_${Date.now()}`;
            // 断点续跑：BA(52)='1' 表示项目已建过（上次崩在建项目之后），复用 AP(41) 的 project_id 直接建单元，避免重复建项目
            const projectBuilt = String(values[52] || '').trim() === utils_1.TAG_VALUE;
            let projectId;
            if (projectBuilt) {
                projectId = String(values[41] || '').trim();
            }
            else {
                await page.goto(`https://ad.oceanengine.com/superior/create-project?aadvid=${accountId}&is_copy=1&project_id=${copyAd}`);
                // 项目部分
                // 自定义人群
                if (audienceMd && String(audienceMd).trim() !== '') {
                    await page.getByText('自定义').nth(1).click();
                    const mdIds = String(audienceMd).split(',').map(s => s.trim()).filter(s => s !== '');
                    for (const mdId of mdIds) {
                        await page.getByRole('textbox', { name: '请输入', exact: true }).fill(mdId);
                        await page.getByRole('button', { name: '定向' }).first().click();
                    }
                }
                // 平台
                if (sellType === '购买' || sellType === '追投2') {
                    await page.locator('div[data-e2e="createproject_platformorientation_checkbox_group_component_1"]').click(); // IOS
                }
                else {
                    await page.locator('div[data-e2e="createproject_platformorientation_checkbox_group_component_2"]').click(); // Android
                    await page.locator('div[data-e2e="createproject_platformorientation_checkbox_group_component_3"]').click(); // 鸿蒙
                }
                // 曝光监测链接
                await page.getByRole('textbox', { name: '请输入链接地址' }).first().fill(String(impTLink));
                // 点击检测链接
                await page.getByRole('textbox', { name: '请输入链接地址' }).nth(1).fill(String(clkTlink));
                // 项目名称
                await page.getByRole('textbox', { name: '请输入项目名称' }).fill(unitNm);
                // 保存
                await page.getByRole('button', { name: '保存并关闭' }).click();
                // project_id
                await page.getByRole('button', { name: '项目工具' }).waitFor({ state: 'visible', timeout: 20000 });
                projectId = (0, utils_1.getUrlParam)(page.url(), 'project_id');
                // 未抠到 project_id 说明项目未真正创建成功：抛错（不置 BA）让本行下次重试，避免置 BA 后该行卡死
                if (!projectId) {
                    throw new Error(`第${index + 1}行：保存项目后未获取到 project_id，项目可能未创建成功，请检查后重跑`);
                }
                // 立即回写：AP(41) 记录新 project_id（覆盖已用完的 copyAd），BA(52) 置 '1' 标记项目已建，防止在建单元途中崩溃导致重复建项目
                (0, utils_1.markRowAndPersist)(df, index, [
                    { col: 41, value: projectId },
                    { col: 52, value: utils_1.TAG_VALUE },
                ]);
            }
            // 单元
            await page.goto(`https://ad.oceanengine.com/superior/ads?aadvid=${accountId}&is_copy=1&project_id=${projectId}&campaign_type=1&ad_count=1&promotion_id=${copyUn}&copy_type=3`);
            // 单元名称
            await page.locator('textarea.ovui-textarea').waitFor({ state: 'visible', timeout: 10000 });
            await page.locator('textarea.ovui-textarea').fill(unitNm);
            // 保存
            await page.getByRole('button', { name: '保存并关闭' }).click();
            await page.getByRole('button', { name: '项目工具' }).waitFor({ state: 'visible', timeout: 20000 });
            // 清空复制单元源 copyUn（AQ列/keys[42]）+ 回写 BB 完成标记（断点续跑）
            doneRows.add(index);
            (0, utils_1.markRowAndPersist)(df, index, [
                { col: 42, value: null },
                { col: utils_1.TAG_COL, value: utils_1.TAG_VALUE },
            ]);
            console.log(`第${index + 1}条广告 : ${unitNm} 创建成功\n`);
        });
    }
    // 全部完成则删列收尾；否则保留以便续跑
    // ⛔ 删列收尾功能已临时关停：任务结束后不再删除 AS 及之后的列，原文件保留全部列。恢复时取消下行注释即可。
    // (0, utils_1.trimColumnsIfAllDone)(df, doneRows);
    (0, utils_1.waitForEnter)('广告创建完成，plz press enter and continue\n');
    } finally {
        // 即使中途抛错也确保关闭浏览器，避免残留 Chrome 进程
        await context.close();
        await browser.close();
    }
}
