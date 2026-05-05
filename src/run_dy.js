"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDy = runDy;
const utils_1 = require("./utils");
/**
 * 抖音广告搭建主函数
 */
async function runDy(df) {
    const { browser, context } = await (0, utils_1.launchBrowser)('auth_state_dy.json');
    const page = await context.newPage();
    // 登录
    await page.goto('https://business.oceanengine.com/site/account-manage/ad/bidding/superior/account');
    (0, utils_1.waitForEnter)('确保当前已处于登录状态后，按下回车开始搭建！\n');
    await (0, utils_1.saveAuthState)(context, 'auth_state_dy.json');
    for (let index = 0; index < df.length; index++) {
        const row = df[index];
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
        console.log(`创建账户: ${accountId}`);
        const unitNm = `${strategyId}_${campaignNm}_${creativeNm}_${rtaId}_${audienceTag}_${audience}_${city}_${sellType}_${Date.now()}`;
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
        const projectId = (0, utils_1.getUrlParam)(page.url(), 'project_id');
        row[Object.keys(row)[41]] = projectId;
        // 单元
        await page.goto(`https://ad.oceanengine.com/superior/ads?aadvid=${accountId}&is_copy=1&project_id=${projectId}&campaign_type=1&ad_count=1&promotion_id=${copyUn}&copy_type=3`);
        // 单元名称
        await page.locator('textarea.ovui-textarea').waitFor({ state: 'visible', timeout: 300000 });
        await page.locator('textarea.ovui-textarea').fill(unitNm);
        // 保存
        await page.getByRole('button', { name: '保存并关闭' }).click();
        await page.getByRole('button', { name: '项目工具' }).waitFor({ state: 'visible', timeout: 300000 });
        row[Object.keys(row)[42]] = '';
        console.log(`第${index + 1}条广告 : ${unitNm} 创建成功\n`);
    }
    (0, utils_1.waitForEnter)('广告创建完成，plz press enter and continue\n');
    (0, utils_1.trimAndSaveExcel)(df, 44);
    await context.close();
    await browser.close();
}
