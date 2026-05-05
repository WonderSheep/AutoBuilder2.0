"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runBili = runBili;
const utils_1 = require("./utils");
/**
 * B站广告搭建主函数
 */
async function runBili(df) {
    const accountId = Object.values(df[0])[35]; // 广告账户
    console.log(`创建账户: ${accountId}\n`);
    const { browser, context } = await (0, utils_1.launchBrowser)('auth_state_bili.json');
    // 创建两个页面
    const page1 = await context.newPage();
    const page = await context.newPage();
    // 登录
    await page.goto('https://e.bilibili.com/site/account/select');
    (0, utils_1.waitForEnter)('确保当前已处于登录状态后，按下回车开始搭建！若未登录，Misa手机号：13761307177\n');
    await (0, utils_1.saveAuthState)(context, 'auth_state_bili.json');
    await page1.goto(`https://ad.bilibili.com/#/assets/index?activeTab=my-small-game&type=list&account_id=${accountId}`);
    const planDict = {};
    const pagePositionMap = {
        '信息流小卡_图片': '信息流小卡',
        '信息流大卡_图片': '信息流大卡',
        '信息流大卡_视频': '信息流大卡',
        '竖版视频流_视频': '竖屏视频流',
        '动态区信息流_视频': '动态区信息流',
        '横版视频': '信息流大卡'
    };
    for (let index = 0; index < df.length; index++) {
        const row = df[index];
        const values = Object.values(row);
        const strategyId = values[3]; // 策略ID
        const campaignNm = values[9]; // 活动名称
        const pagePst = values[14]; // 点位
        const audience = values[18]; // 脱敏人群
        const creativeNm = values[17]; // 创意名称
        const city = values[20]; // 区域
        const sellType = values[23]; // 购买类型
        const miniLink = values[25] || ''; // 小程序链接
        const miniId = values[27] || ''; // 小程序ID
        const basicLp = values[28]; // 打底落地页
        const dpLink = values[29] || ''; // deeplink
        const impTLink = values[30]; // 曝光监测链接
        const clkTlink = values[31]; // 点击监测链接
        const cooperation1 = values.length > 39 ? values[39] : ''; // 合作协议1
        const cooperation2 = values.length > 40 ? values[40] : ''; // 合作协议2
        const assetNm = values[36]; // 图片或视频名称
        const copywritingTle = values[37]; // 素材标题
        const copywritingDsc = values[38]; // 素材描述
        // 添加小程序
        const miniNm = `${strategyId}_${Date.now()}`;
        if (miniLink !== '') {
            await page1.locator('span.dib.vm.ml8[data-v-3da72d1f]').filter({ hasText: /^添加微信小程序$/ }).click();
            await page1.getByRole('textbox', { name: '请填写小程序原始ID' }).fill(String(miniId));
            await page1.getByRole('textbox', { name: '请填写小程序名称' }).fill(miniNm);
            await page1.getByRole('textbox', { name: '请填写小程序路径' }).fill(`${miniLink}&trackid=__TRACKID__`);
            await page1.getByRole('button', { name: '确定添加' }).click();
        }
        const planNm = `${campaignNm}_${audience}`;
        if (planNm in planDict) {
            await page.goto(`https://ad.bilibili.com/#/promote/auto?campaign_id=${planDict[planNm]}&account_id=${accountId}`);
        }
        else {
            await page.goto(`https://ad.bilibili.com/#/promote/auto?type=1&account_id=${accountId}`);
            // 我知道了
            const iKnowDiv = page.locator('div.info-btn.fr[data-v-72c5a9f4]');
            try {
                await iKnowDiv.waitFor({ state: 'attached', timeout: 5000 });
                if (await iKnowDiv.count() > 0) {
                    await iKnowDiv.click();
                }
            }
            catch {
                // 忽略
            }
            // 内容种草
            await page.locator('div.ppt-title[data-v-5eb66e25]').nth(1).click();
            // 计划名称
            await page.getByRole('textbox', { name: '请输入计划名称' }).fill(planNm);
            // 计划预算
            await page.getByRole('textbox', { name: '请输入不小于500，且只有2位小数' }).fill('500');
        }
        // 单元
        const unitNm = `${strategyId}_${campaignNm}_${pagePst}_${creativeNm}_${audience}_${city}_${sellType}`;
        await page.getByRole('textbox', { name: '请输入单元名称' }).fill(unitNm);
        await page.getByText('内容投放').click();
        if (miniLink !== '') {
            await page.getByText('请选择微信小程序', { exact: true }).click();
            await page.getByText(miniNm, { exact: true }).click();
        }
        else {
            // APP包
            await page.getByText('请选择', { exact: true }).click();
            if (sellType === '购买') {
                await page.getByText('肯德基KFC-iOS').click();
            }
            else {
                await page.getByText('肯德基KFC-安卓').click();
            }
        }
        // 日期
        const editTime = page.getByRole('link', { name: '编辑时段' });
        try {
            await editTime.click({ timeout: 2000 });
        }
        catch {
            await page.locator('span[data-v-53fbd318].vm').filter({ hasText: /^展开关联产品、投放日期、频次和搜索快投等内容$/ }).click();
            await editTime.click();
        }
        await page.getByRole('link', { name: '全部清除' }).click();
        await page.getByRole('button', { name: '确定' }).click();
        // 出价
        await page.getByText('CPM', { exact: true }).click();
        await page.getByRole('textbox', { name: '请输入金额' }).fill('10');
        // 单元日预算
        await page.locator('#unit_budget_bid').getByText('指定日预算').click();
        await page.getByRole('textbox', { name: '请输入不少于500，且只有2位小数' }).fill('500');
        // 展示链接
        await page.getByRole('textbox', { name: '请输入https链接开头的URL' }).first().fill(String(impTLink));
        // 点击和播放3秒监控
        await page.getByRole('textbox', { name: '请输入https链接开头的URL' }).nth(1).fill(String(clkTlink));
        // 点位
        await (0, utils_1.sleep)(250);
        await page.locator('span.ivu-switch.ivu-switch-small').nth(0).click();
        const positionText = pagePositionMap[pagePst] || String(pagePst);
        await page.getByRole('checkbox', { name: positionText }).check();
        if (pagePst === '信息流大卡_视频') {
            await page.getByRole('checkbox', { name: '动态区信息流' }).check();
        }
        else if (pagePst === '动态区信息流_视频') {
            await page.getByRole('checkbox', { name: '信息流大卡' }).check();
        }
        else if (pagePst === '横版视频') {
            await page.getByRole('checkbox', { name: '动态区信息流' }).check();
        }
        // 新建创意
        // 创意智能衍生 注意这块儿不要开启
        // 添加图片/视频
        if (['信息流小卡_图片', '信息流大卡_图片'].includes(String(pagePst))) {
            await page.getByRole('button', { name: '添加图片' }).click();
            await page.getByRole('textbox', { name: '请输入图片名称' }).fill(String(assetNm));
            await page.getByRole('textbox', { name: '请输入图片名称' }).press('Enter');
            await (0, utils_1.sleep)(150);
            // 选择图片
            const targetDiv = page.getByText(String(assetNm), { exact: true }).first();
            await targetDiv.waitFor({ state: 'visible', timeout: 5000 });
            const divBox = await targetDiv.boundingBox();
            if (divBox) {
                const clickX = divBox.x + divBox.width / 2;
                const clickY = divBox.y - 50;
                await page.mouse.click(clickX, clickY);
            }
            await page.locator('button.ivu-btn.ivu-btn-primary.ok-btn[type="button"][data-v-26f6aad8] span')
                .filter({ hasText: /^确认$/ }).click();
        }
        else {
            await page.getByRole('button', { name: '添加稿件/视频' }).click();
            await page.getByRole('link', { name: '我的视频' }).click();
            await page.getByRole('textbox', { name: '请输入视频名称搜索' }).fill(String(assetNm));
            await page.getByRole('textbox', { name: '请输入视频名称搜索' }).press('Enter');
            await page.locator('span.vm[data-v-4dbc4f96]').filter({ hasText: String(assetNm) }).first().click();
            await page.locator('div.footer-actions button.ivu-btn.ivu-btn-primary.btn.primary[type="button"][data-v-788d48dc]')
                .nth(0).click();
        }
        // 素材标题
        await page.getByRole('textbox', { name: '请输入2~40个字（移动场景建议18字以内）' }).fill(String(copywritingTle));
        // 唤起链接
        await page.getByRole('textbox', { name: '请输入唤起应用的链接' }).fill(miniLink !== '' ? String(miniLink) : String(dpLink));
        // 素材描述
        await page.getByRole('textbox', { name: '请输入2 ~ 10个字，即客户端广告卡片中UP' }).fill(String(copywritingDsc));
        // 自定义落地页
        await page.getByRole('textbox', { name: '请使用https链接开头的URL', exact: true }).fill(String(basicLp));
        // 品牌头像
        if (await page.getByRole('textbox', { name: '请选择品牌名称' }).isVisible()) {
            await page.getByRole('textbox', { name: '请选择品牌名称' }).click();
            await page.getByText('肯德基', { exact: true }).nth(0).click();
        }
        // 合作协议
        if (cooperation1 && String(cooperation1).trim() !== '') {
            await page.locator('span.placeholder[data-v-ed7545cc]').filter({ hasText: /^请选择$/ }).click();
            await page.locator('label.bd-checkbox').nth(Number(cooperation1)).click();
        }
        if (cooperation1 && String(cooperation1).trim() !== '' && cooperation2 && String(cooperation2).trim() !== '') {
            await page.locator('label.bd-checkbox').nth(Number(cooperation2)).click();
        }
        // 保存
        await (0, utils_1.sleep)(500);
        await page.getByRole('button', { name: '保存' }).click();
        // 存入计划ID
        await page.getByRole('button', { name: '新建创意' }).waitFor({ state: 'visible', timeout: 300000 });
        if (!(planNm in planDict)) {
            const campaignId = extractCampaignId(page.url());
            if (campaignId !== null) {
                planDict[planNm] = campaignId;
            }
        }
        console.log(`第${index + 1}条广告 : ${unitNm} 创建成功\n`);
    }
    (0, utils_1.waitForEnter)('广告创建完成，plz press enter and continue');
    await context.close();
    await browser.close();
}
/**
 * 从URL中提取campaign ID
 */
function extractCampaignId(url) {
    const pathFragments = url.split('/');
    for (let idx = 0; idx < pathFragments.length; idx++) {
        if (pathFragments[idx] === 'campaign' && idx + 1 < pathFragments.length) {
            return pathFragments[idx + 1];
        }
    }
    return null;
}
