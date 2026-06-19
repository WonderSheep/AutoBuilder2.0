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
        const page = await context.newPage();
        // 登录
        await page.goto('https://business.oceanengine.com/site/account-manage/ad/bidding/superior/account');
        (0, utils_1.waitForEnter)('确保当前已处于登录状态后，按下回车开始搭建！\n');
        await (0, utils_1.saveAuthState)(context, 'auth_state_dy.json');
    // 断点续跑：从 BB 列恢复已完成行
    const doneRows = (0, utils_1.readDoneRows)(df);
    console.log(`📦 恢复断点：已完成 ${doneRows.size} 条\n`);
    for (let index = 0; index < df.length; index++) {
        const row = df[index];
        // 断点续跑：已完成（BB 列有标记）的行直接跳过
        if (doneRows.has(index)) {
            continue;
        }
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
        const copyAd = values[42]; // 复制的项目
        const copyUn = values[43]; // 复制的单元
        const audienceMd = values[44]; // 媒体人群
        const audienceTag = values[45]; // 人群类型
        const unitNm = `${strategyId}_${campaignNm}_${creativeNm}_${rtaId}_${audienceTag}_${audience}_${city}_${sellType}_${Date.now()}`;
        // 断点续跑：若该行已建过项目（上次崩在建项目之后），复用 project_id 直接建单元，避免重复建项目
        const existingProjectId = String(values[41] || '').trim();
        let projectId;
        if (existingProjectId) {
            projectId = existingProjectId;
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
            await page.getByRole('button', { name: '项目工具' }).waitFor({ state: 'visible', timeout: 300000 });
            projectId = (0, utils_1.getUrlParam)(page.url(), 'project_id');
            // 立即回写 project_id，防止在建单元途中崩溃导致重复建项目
            (0, utils_1.markRowAndPersist)(df, index, [{ col: 41, value: projectId }]);
        }
        // 单元
        await page.goto(`https://ad.oceanengine.com/superior/ads?aadvid=${accountId}&is_copy=1&project_id=${projectId}&campaign_type=1&ad_count=1&promotion_id=${copyUn}&copy_type=3`);
        // 单元名称
        await page.locator('textarea.ovui-textarea').waitFor({ state: 'visible', timeout: 300000 });
        await page.locator('textarea.ovui-textarea').fill(unitNm);
        // 保存
        await page.getByRole('button', { name: '保存并关闭' }).click();
        await page.getByRole('button', { name: '项目工具' }).waitFor({ state: 'visible', timeout: 300000 });
        // 清空复制源 copyAd（keys[42]）+ 回写 BB 完成标记（断点续跑）
        doneRows.add(index);
        (0, utils_1.markRowAndPersist)(df, index, [
            { col: 42, value: null },
            { col: utils_1.TAG_COL, value: utils_1.TAG_VALUE },
        ]);
        console.log(`第${index + 1}条广告 : ${unitNm} 创建成功\n`);
    }
    // 全部完成则删列收尾；否则保留以便续跑
    (0, utils_1.trimColumnsIfAllDone)(df, doneRows);
    (0, utils_1.waitForEnter)('广告创建完成，plz press enter and continue\n');
    } finally {
        // 即使中途抛错也确保关闭浏览器，避免残留 Chrome 进程
        await context.close();
        await browser.close();
    }
}
