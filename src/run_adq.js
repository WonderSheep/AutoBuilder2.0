"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAdq = runAdq;
exports.runAdqCreTemplate = runAdqCreTemplate;
exports.runAdqReplace = runAdqReplace;
const utils_1 = require("./utils");
/**
 * 腾讯广告搭建主函数
 */
async function runAdq(df, idSelector) {
    // 启动浏览器
    const { browser, context } = await (0, utils_1.launchBrowser)('auth_state_adq.json');
    try {
        let page = await context.newPage();
    // 登录
    await page.goto('https://ad.qq.com');
    (0, utils_1.waitForEnter)('确保当前已处于登录状态后，按下回车开始搭建！\n');
    await (0, utils_1.saveAuthState)(context, 'auth_state_adq.json');
    // 断点续跑：从 BB 列恢复已完成行
    const doneRows = (0, utils_1.readDoneRows)(df);
    console.log(`📦 恢复断点：已完成 ${doneRows.size} 条\n`);
    // 页面位置映射
    const pagePositionMap = {
        '朋友圈-卡片广告-横版大图-行动按钮': '卡片广告 横版大图 16:9',
        '朋友圈-卡片广告-横版大图': '卡片广告 横版大图 16:9',
        '朋友圈-卡片广告-横版视频-行动按钮': '卡片广告 横版视频 16:9',
        '朋友圈-卡片广告-横版视频': '卡片广告 横版视频 16:9',
        '朋友圈-竖版大图': '竖版大图 9:16',
        '朋友圈-橱窗广告-图片': '橱窗广告 - 图片',
        '订阅号消息列表-横版大图': '横版大图 16:9',
        '订阅号消息列表-横版视频': '横版视频 16:9',
        '小程序封面广告': '竖版大图 9:16',
        '视频号-竖版视频': '竖版视频 9:16',
        '视频号-横版视频': '横版视频 16:9',
        //'视频号评论区广告': '竖版视频 9:16',
        '视频号评论区广告-竖版大图': '竖版大图 9:16',
        '视频号评论区广告-横版大图': '横版大图 16:9',
        '视频号评论区广告-竖版视频': '竖版视频 9:16',
        '视频号评论区广告-横版视频': '横版视频 16:9',
        '竖版大图': '竖版大图 9:16',
        '横版大图': '横版大图 16:9',
        '闪屏视频': '闪屏视频 9:16'
    };
    // 单行搭建（抽出为函数，便于行级「刷新+重试」；行体原样、仅多一层函数包裹）
    async function processRow(index, attempt) {
        if (attempt > 0) {
            // 填坑：把本行从磁盘刷新进内存，让 BA 守卫读到上次写入，避免重复建广告组
            df[index] = (0, utils_1.readExcelFile)()[index];
            page = await (0, utils_1.robustRefresh)(page, context, 'https://ad.qq.com');
            await (0, utils_1.sleep)(2500);
        }
        const row = df[index];
        // ─── 腾讯(adq) 列约定（列号均为 0-based）与断点续跑 ───
        // 数据：0策略ID 2活动名 13媒体 15点位 18脱敏人群 20创意名 23区域
        //       29deeplink 31小程序链接 32落地页类型 40广告账户
        //       44人群标签 45素材 46文案 47品牌形象 48行动按钮 49标签 50首评回复 51浮层卡片
        // 复制源：col42=复制源广告copyAd（选点位成功后覆盖为 adgroupId）
        // 回写ID：col43=dynamicCreativeId
        // 标志位：BA(52)='1' 广告组已建   BB(53)='1' 整行完成（readDoneRows 据此跳过整行）
        // 续跑写入：选点位成功（=广告层级已建）→adgroupId 写回 col42(覆盖copyAd) 且 BA 置 '1'；
        //          提交创意后→dynamicCreativeId 写 col43 且 BB 置 '1'。
        // 重跑判定：BB='1' 整行跳过；仅 BA='1'（广告组已建、创意没建完）则直达
        //          creatives-add?adgroup_id= 重选点位+继续创意，跳过广告组创建，避免重复建广告组。
        // 收尾：BA/BB(52/53) 超出 trim 上限(43)，全部完成后自动删除；col42 的 adgroupId 保留进交付表。
        const values = Object.values(row);
        const strategyId = values[0]; // 策略ID
        const campaignNm = values[2]; // 活动名称
        const media = values[13]; // 媒体
        const pagePst = values[15]; // 点位
        const audience = values[18]; // 脱敏人群
        const creativeNm = values[20]; // 创意名称
        const city = values[23]; // 区域
        const miniLink = values[31]; // 小程序链接&掩码
        const landingType = values[32]; // 落地页类型
        const dpLink = values[29]; // deeplink
        const accountId = values[40]; // 广告账户
        const copyAd = values[42]; // 复制的广告
        // 创意内容（原循环前手动 promptUser 输入，现从 Excel 每行读取，避免重启重复输入）
        const audienceTag = values[44]; // 人群标签
        const assetNm = values[45]; // 图片或视频ID/名称
        const copywriting = values[46]; // 文案
        const logo = String(values[47] || '').trim() || '肯德基'; // 品牌形象（直接填中文，空则默认肯德基）
        const actionBtn = String(values[48] || '').trim() || '立即购买'; // 行动按钮（空则默认立即购买）
        const tagtag = String(values[49] || '').trim(); // 标签
        const firstReply = String(values[50] || '').trim(); // 首评回复
        const floatCard = String(values[51] || '').trim(); // 视频号浮层卡片
        // 营销组件映射（依赖本行 actionBtn/firstReply/floatCard/tagtag，故每行重建）
        const componentMap = buildComponentMap(page, actionBtn, firstReply, floatCard, tagtag);
        const unitNm = `${strategyId}_${campaignNm}_${media}_${pagePst}_${creativeNm}_${audience}_${audienceTag}_${city}`;
        // 断点续跑：BA(52)='1' 表示广告组已建过，直达创意配置页跳过广告组创建
        const adgroupBuilt = String(values[52] || '').trim() === utils_1.TAG_VALUE;
        let adgroupId;
        if (adgroupBuilt) {
            adgroupId = String(values[42] || '').trim();
            await page.goto(`https://ad.qq.com/atlas/${accountId}/delivery-page/creatives-add?adgroup_id=${adgroupId}`);
        }
        if (!adgroupBuilt) {
        await page.goto(`https://ad.qq.com/atlas/${accountId}/addelivery/adgroups-add?ref_adgroup_id=${copyAd}`);
        await (0, utils_1.sleep)(3000);
        // 人群定向 - 排除人群（按行序 index+1 取避投组合，断点续跑跳过行不会错位）
        if (idSelector !== null) {
            await page.locator('h3.title[title="排除人群"]').click();
            const avoidList = idSelector.getNthChoice(index + 1);
            for (const avoid of avoidList) {
                const searchBox = page.getByRole('textbox', { name: '搜索用户群' });
                // 优化：直接fill，不需要先click
                await searchBox.fill(String(avoid));
                await page.locator('tr[data-rowindex="0"] span.spaui-checkbox-indicator').first().click();
                await (0, utils_1.sleep)(150);
            }
            // 关闭高价值人群范围探索
            await page.locator('span.spaui-switch-helper').nth(2).click();
        }
        // 选择监测链接组
        //await page.locator('div.spaui-selection-item-content.in').filter({ hasText: /^请选择监测链接组$/ }).click();
        //await page.locator('span.name').filter({ hasText: '仅点击监测-DID' }).click();
        // 项目名称
        await page.getByRole('textbox', { name: '营销单元名称仅用于管理广告，不会对外展示' }).fill(unitNm);
        // 保存
        await (0, utils_1.sleep)(500);
        await page.getByRole('button', { name: '提交并新建创意' }).click();
        const submitBtn = page.locator('button').filter({ hasText: /确认并提交/ });
        const creButton = page.locator('button').filter({ hasText: /^创建创意$/ });
        if (idSelector !== null) {
            await submitBtn.click();
            await creButton.click();
        }
        else {
            await creButton.click();
        }
        }
        // 创意部分
        // 选点位
        await page.locator('button#creative-type-btn').click();
        const positionText = pagePositionMap[pagePst] || String(pagePst);
        // 点位选择：先尝试直接点目标点位（正则 + first，1s 超时）；1s 内点不到说明在另一分组，切开关再点
        const positionRegex = new RegExp(positionText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const positionOpt = page.locator('span.odc-text.ellipsis').filter({ hasText: positionRegex }).first();
        try {
            await positionOpt.click({ timeout: 1000 });
        }
        catch {
            await page.locator('span.spaui-switch-helper').click();
            await positionOpt.click();
        }
        await page.getByRole('button', { name: '确定' }).click();
        // 点位选成功即代表广告层级已建：首次抓 adgroup_id 回写（覆盖 copyAd + BA 置 '1'），防崩在建创意途中重复建广告组
        if (!adgroupBuilt) {
            adgroupId = (0, utils_1.getUrlParam)(page.url(), 'adgroup_id');
            // 未抠到 adgroup_id 说明广告组未真正创建成功：抛错（不置 BA）让本行下次重试，避免置 BA 后该行卡死
            if (!adgroupId) {
                throw new Error(`第${index + 1}行：选点位后未获取到 adgroup_id，广告组可能未创建成功，请检查后重跑`);
            }
            (0, utils_1.markRowAndPersist)(df, index, [
                { col: 42, value: adgroupId },
                { col: 52, value: utils_1.TAG_VALUE },
            ]);
        }
        // 图片或视频
        if (pagePst === '朋友圈-橱窗广告-图片') {
            await page.locator('div.spaui-form-group-prefix button.x-filter-btn.spaui-button.spaui-button-text.spaui-button-sm.with-icon').first().click();
            await page.getByRole('textbox', { name: '请输入名称/ID' }).fill(String(assetNm));
            await page.getByRole('textbox', { name: '请输入名称/ID' }).press('Enter');
            await (0, utils_1.sleep)(500);
            await page.locator('button[data-hottag="ComponentMediaSelector.changeImage"]').first().click({ force: true });
            await page.getByRole('textbox', { name: '请输入小程序链接' }).fill(String(miniLink));
            await page.getByRole('textbox', { name: '小程序链接', exact: true }).fill(String(miniLink));
            await page.getByRole('button', { name: '新建至账户' }).click();
        }
        else {
            //await page.locator('div.spaui-form-group-prefix button.x-filter-btn.spaui-button.spaui-button-text.spaui-button-sm.with-icon').first().click();
            //await page.getByRole('textbox', { name: '请输入名称/ID' }).fill(String(assetNm));
            //await page.getByRole('textbox', { name: '请输入名称/ID' }).press('Enter');
            await (0, utils_1.sleep)(500);
            await page.locator('div.odc-titlebar-desc.odc-line-clamp.break-all').filter({ hasText: new RegExp(`^ID:${assetNm}$`) }).first().click({ force: true });
        }
        // 文案
        if (await page.getByText('文案').count() > 0) {
            await page.getByText('文案').click();
            const metaInput = page.locator('div.meta-input');
            await metaInput.fill(String(copywriting));
        }
        // 落地页
        if (pagePst !== '朋友圈-橱窗广告-图片') {
            await page.locator('span').filter({ hasText: /^落地页$/ }).click();
            if (landingType === 'App') {
                await page.locator('li.readonly.spaui-cursor-pointer').filter({ hasText: /^应用直达$/ }).click();
                await page.locator('span').filter({ hasText: String(dpLink) }).click({ force: true });
            }
            else {
                await page.locator('li.readonly.spaui-cursor-pointer').filter({ hasText: /^微信小程序$/ }).click();
                await page.locator('button.x-elem-add-btn.spaui-button.spaui-button-default.with-icon').first().click();
                await page.getByRole('textbox', { name: 'gh 开头的小程序原始 ID' }).fill('gh_f01f85672b87');
                await page.getByRole('textbox', { name: '请输入小程序链接' }).fill(String(miniLink));
                await page.getByRole('button', { name: '新建至账户' }).click();
            }
        }
        // 品牌形象
        await page.getByText('品牌形象', { exact: true }).click();
        if (pagePst === '视频号-竖版视频' || pagePst === '视频号-横版视频' || pagePst === '视频号评论区广告-竖版视频' || pagePst === '视频号评论区广告-横版视频') {
            await page.locator('div.h-full.flex-col.gap-4.px-12.justify-center.relative.odc-hover.odc-flex.odc-frame.flex.flex-row span.ellipsis.odc-text.odc-text-small.ellipsis')
                .filter({ hasText: /^肯德基$/ }).first().click();
        }
        else {
            await page.locator('li.readonly.spaui-cursor-pointer').filter({ hasText: /^自定义$/ }).click();
            await page.locator('div.h-full.flex-col.gap-4.px-12.justify-center.relative.odc-hover.odc-flex.odc-frame.flex.flex-row span.ellipsis.odc-text.odc-text-small.ellipsis')
                .filter({ hasText: new RegExp(`^${String(logo)}$`) }).first().click();
        }
        // 营销组件
        const componentFunc = componentMap[pagePst];
        if (componentFunc) {
            await componentFunc();
        }
        // 创意名称
        await page.getByText('创意设置').click();
        const targetInput = await page.waitForSelector('input.meta-input.spaui-input.has-normal', { timeout: 10000 });
        await targetInput.click();
        await targetInput.press('ControlOrMeta+a');
        await targetInput.fill(unitNm);
        // 提交
        await page.getByRole('button', { name: '提交创意' }).click();
        await page.getByRole('button', { name: '返回创意管理' }).click();
        // 去编辑
        await page.getByRole('button', { name: '编辑' }).first().waitFor({ state: 'visible', timeout: 20000 });
        const jumpUrl = await page.getByRole('button', { name: '编辑' }).first().getAttribute('href') || '';
        const dynamicCreativeId = (0, utils_1.getUrlParam)(jumpUrl, 'dynamic_creative_id');
        // 回写 dynamicCreativeId + BB 完成标记（adgroupId 已在选点位后写入 col42）
        doneRows.add(index);
        (0, utils_1.markRowAndPersist)(df, index, [
            { col: 43, value: dynamicCreativeId },
            { col: utils_1.TAG_COL, value: utils_1.TAG_VALUE },
        ]);
        console.log(`第${index + 1}条广告 : ${unitNm} 创建成功\n`);
    }
    // 行级「刷新+重试」容错：首跑失败则刷新页面重试 2 次；仍失败则抛错中止整批（绝不跳行）
    for (let index = 0; index < df.length; index++) {
        // 断点续跑：已完成（BB 列有标记）的行直接跳过
        if (doneRows.has(index)) {
            continue;
        }
        await (0, utils_1.withRowRetry)(index, 2, (attempt) => processRow(index, attempt));
    }
    // 全部完成则删列收尾；否则保留以便续跑
    // ⛔ 删列收尾功能已临时关停：任务结束后不再删除 AS 及之后的列，原文件保留全部列。恢复时取消下行注释即可。
    // (0, utils_1.trimColumnsIfAllDone)(df, doneRows);
    (0, utils_1.waitForEnter)('广告创建完成，plz press enter and continue');
    } finally {
        // 即使中途抛错也确保关闭浏览器，避免残留 Chrome 进程
        await context.close();
        await browser.close();
    }
}
/**
 * 构建"点位 → 营销组件设置函数"映射。
 * 因 actionBtn/firstReply/floatCard/tagtag 现按行从 Excel 读取，故每行调用一次重建。
 */
function buildComponentMap(page, actionBtn, firstReply, floatCard, tagtag) {
    return {
        '朋友圈-卡片广告-横版大图-行动按钮': () => wxFriendsCardBp(page, actionBtn, firstReply, tagtag),
        '朋友圈-卡片广告-横版大图': () => wxFriendsCardBp(page, actionBtn, firstReply, tagtag),
        '朋友圈-卡片广告-横版视频-行动按钮': () => wxFriendsCardVideo(page, actionBtn, firstReply, tagtag),
        '朋友圈-卡片广告-横版视频': () => wxFriendsCardVideo(page, actionBtn, firstReply, tagtag),
        '朋友圈-竖版大图': () => wxFriendsShubanBp(page, actionBtn, firstReply),
        '朋友圈-橱窗广告-图片': () => wxFriendsWindows(page, actionBtn, firstReply),
        '订阅号消息列表-横版大图': () => wxSubBp(page, actionBtn),
        '订阅号消息列表-横版视频': () => wxSubVideo(page, actionBtn),
        '小程序封面广告': () => wxMiniProShubanBp(page),
        '视频号-竖版视频': () => wxTvShubanVideo(page, floatCard, tagtag),
        '视频号-横版视频': () => wxTvHengbanVideo(page, floatCard, tagtag),
        //'视频号评论区广告': () => wxTvShubanVideo(page, floatCard, tagtag), 废弃
        '视频号评论区广告-竖版视频': () => wxTvShubanVideo(page, floatCard, tagtag),
        '视频号评论区广告-横版视频': () => wxTvHengbanVideo(page, floatCard, tagtag),
        '视频号评论区广告-竖版大图': () => wxTvShubanBp(page),
        '视频号评论区广告-横版大图': () => wxTvHengbanBp(page),
        '竖版大图': () => gdtShubanBp(page, actionBtn),
        '横版大图': () => gdtHengbanBp(page, actionBtn),
        '闪屏视频': () => gdtFlashVideo(page, actionBtn)
    };
}
// 营销组件函数
async function wxFriendsCardBp(page, actionBtn, firstReply, tagtag) {
    await page.getByText('营销组件').first().click();
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '客服问答' }).click();
    //if (firstReply === '') {
    //    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '首评回复' }).click();
    //}
    if (tagtag !== '') {
        await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '标签' }).click();
    }
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '行动按钮' }).click();
    await page.locator('span.odc-text.ellipsis').filter({ hasText: '行动按钮' }).click();
    await page.getByText('请选择按钮文案').click();
    await page.getByRole('textbox', { name: '搜索' }).fill(actionBtn);
    const selector = await page.waitForSelector(`div.selection-name[data-value="${actionBtn}"]`, { timeout: 3000 });
    await selector.click();
    await page.getByRole('button', { name: '确定' }).click();
    if (tagtag !== '') {
        await page.locator('span.odc-text.ellipsis').filter({ hasText: '标签' }).click();
        await page.locator('div.tw-inline-flex.tw-items-center.tw-cursor-pointer.tw-transition-colors').filter({ hasText: new RegExp(`^${tagtag}$`) }).first().click();
    }
    if (firstReply !== '') {
        await page.locator('span.odc-text.ellipsis').filter({ hasText: '首评回复' }).click();
        await page.getByText(firstReply).first().click();
    }
}
async function wxFriendsCardVideo(page, actionBtn, firstReply, tagtag) {
    await page.getByText('营销组件').first().click();
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '客服问答' }).click();
    //if (firstReply === '') {
    //    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '首评回复' }).click();
    //}
    if (tagtag !== '') {
        await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '标签' }).click();
    }
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '行动按钮' }).click();
    await page.locator('span.odc-text.ellipsis').filter({ hasText: '行动按钮' }).click();
    await page.getByText('请选择按钮文案').click();
    await page.getByRole('textbox', { name: '搜索' }).fill(actionBtn);
    const selector = await page.waitForSelector(`div.selection-name[data-value="${actionBtn}"]`, { timeout: 3000 });
    await selector.click();
    await page.getByRole('button', { name: '确定' }).click();
    if (tagtag !== '') {
        await page.locator('span.odc-text.ellipsis').filter({ hasText: '标签' }).click();
        await page.locator('div.tw-inline-flex.tw-items-center.tw-cursor-pointer.tw-transition-colors').filter({ hasText: new RegExp(`^${tagtag}$`) }).first().click();
    }
    if (firstReply !== '') {
        await page.locator('span.odc-text.ellipsis').filter({ hasText: '首评回复' }).click();
        await page.getByText(firstReply).first().click();
    }
}
async function wxFriendsShubanBp(page, actionBtn, firstReply) {
    await page.getByText('营销组件').first().click();
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '图文链接' }).click();
    if (firstReply === '') {
        await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '首评回复' }).click();
    }
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '标签' }).click();
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '文字链' }).click();
    await page.locator('span.odc-text.ellipsis').filter({ hasText: '文字链' }).click();
    await page.getByText('请选择文字链文案').click();
    await page.getByRole('textbox', { name: '搜索' }).fill(actionBtn);
    const sel = await page.waitForSelector(`div.selection-name[data-value="${actionBtn}"]`, { timeout: 3000 });
    await sel.click();
    await page.getByRole('button', { name: '确定' }).click();
    if (firstReply !== '') {
        await page.locator('span.odc-text.ellipsis').filter({ hasText: '首评回复' }).click();
        await page.getByText(firstReply).first().click();
    }
}
async function wxFriendsWindows(page, actionBtn, firstReply) {
    await page.getByText('营销组件').first().click();
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '图文链接' }).click();
    if (firstReply === '') {
        await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '首评回复' }).click();
    }
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '标签' }).click();
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '文字链' }).click();
    await page.locator('span.odc-text.ellipsis').filter({ hasText: '文字链' }).click();
    await page.getByText('请选择文字链文案').click();
    await page.getByRole('textbox', { name: '搜索' }).fill(actionBtn);
    const sel = await page.waitForSelector(`div.selection-name[data-value="${actionBtn}"]`, { timeout: 3000 });
    await sel.click();
    await page.getByRole('button', { name: '确定' }).click();
    if (firstReply !== '') {
        await page.locator('span.odc-text.ellipsis').filter({ hasText: '首评回复' }).click();
        await page.getByText(firstReply).first().click();
    }
}
async function wxSubBp(page, actionBtn) {
    await page.getByText('营销组件').first().click();
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '行动按钮' }).click();
    await page.locator('span.odc-text.ellipsis').filter({ hasText: '行动按钮' }).click();
    await page.getByText('请选择按钮文案').click();
    await page.getByRole('textbox', { name: '搜索' }).fill(actionBtn);
    const selector = await page.waitForSelector(`div.selection-name[data-value="${actionBtn}"]`, { timeout: 3000 });
    await selector.click();
    await page.getByRole('button', { name: '确定' }).click();
}
async function wxSubVideo(page, actionBtn) {
    await page.getByText('营销组件').first().click();
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '图文链接' }).click();
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '行动按钮' }).click();
    await page.locator('span.odc-text.ellipsis').filter({ hasText: '行动按钮' }).click();
    await page.getByText('请选择按钮文案').click();
    await page.getByRole('textbox', { name: '搜索' }).fill(actionBtn);
    const selector = await page.waitForSelector(`div.selection-name[data-value="${actionBtn}"]`, { timeout: 3000 });
    await selector.click();
    await page.getByRole('button', { name: '确定' }).click();
}
async function wxMiniProShubanBp(page) {
    await page.getByText('营销组件').first().click();
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '图文链接' }).click();
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '标签' }).click();
}
async function wxTvShubanVideo(page, floatCard, tagtag) {
    await page.getByText('营销组件').first().click();
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '图文链接' }).click();
    if (tagtag === '') {
        await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '标签' }).click();
    }
    await page.locator('span.odc-text.ellipsis').filter({ hasText: '浮层卡片' }).click();
    await page.locator('span.tw-text-xs.tw-text-text-secondary.tw-font-semibold.tw-truncate').filter({ hasText: floatCard }).click();
    if (tagtag !== '') {
        await page.locator('span.odc-text.ellipsis').filter({ hasText: '标签' }).click();
        await page.locator('div.tw-inline-flex.tw-items-center.tw-cursor-pointer.tw-transition-colors').filter({ hasText: new RegExp(`^${tagtag}$`) }).first().click();
    }
}
async function wxTvHengbanVideo(page, floatCard, tagtag) {
    await page.getByText('营销组件').first().click();
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '图文链接' }).click();
    if (tagtag === '') {
        await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '标签' }).click();
    }
    await page.locator('span.odc-text.ellipsis').filter({ hasText: '浮层卡片' }).click();
    await page.locator('span.tw-text-xs.tw-text-text-secondary.tw-font-semibold.tw-truncate').filter({ hasText: floatCard }).click();
    if (tagtag !== '') {
        await page.locator('span.odc-text.ellipsis').filter({ hasText: '标签' }).click();
        await page.locator('div.tw-inline-flex.tw-items-center.tw-cursor-pointer.tw-transition-colors').filter({ hasText: new RegExp(`^${tagtag}$`) }).first().click();
    }
}
async function gdtShubanBp(page, actionBtn) {
    await page.getByText('营销组件').first().click();
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '客服问答' }).click();
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '标签' }).click();
    await page.locator('span.odc-text.ellipsis').filter({ hasText: '行动按钮' }).click();
    await page.getByText('请选择按钮文案').click();
    await page.getByRole('textbox', { name: '搜索' }).fill(actionBtn);
    const selector = await page.waitForSelector(`div.selection-name[data-value="${actionBtn}"]`, { timeout: 3000 });
    await selector.click();
    await page.getByRole('button', { name: '确定' }).click();
}
async function gdtHengbanBp(page, actionBtn) {
    await page.getByText('营销组件').first().click();
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '客服问答' }).click();
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '标签' }).click();
    await page.locator('span.odc-text.ellipsis').filter({ hasText: '行动按钮' }).click();
    await page.getByText('请选择按钮文案').click();
    await page.getByRole('textbox', { name: '搜索' }).fill(actionBtn);
    const selector = await page.waitForSelector(`div.selection-name[data-value="${actionBtn}"]`, { timeout: 3000 });
    await selector.click();
    await page.getByRole('button', { name: '确定' }).click();
}
async function gdtFlashVideo(page, actionBtn) {
    await page.getByText('营销组件').first().click();
    await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '客服问答' }).click();
    await page.locator('span.odc-text.ellipsis').filter({ hasText: '行动按钮' }).click();
    await page.getByText('请选择按钮文案').click();
    await page.getByRole('textbox', { name: '搜索' }).fill(actionBtn);
    const selector = await page.waitForSelector(`div.selection-name[data-value="${actionBtn}"]`, { timeout: 3000 });
    await selector.click();
    await page.getByRole('button', { name: '确定' }).click();
}
async function wxTvShubanBp(page) {
    //占位
}
async function wxTvHengbanBp(page) {
    //占位
}

/**
 * 创建定向模版
 */
async function runAdqCreTemplate(df, idSelector) {
    const { browser, context } = await (0, utils_1.launchBrowser)('auth_state_adq.json');
    try {
        const page = await context.newPage();
    await page.goto('https://ad.qq.com');
    (0, utils_1.waitForEnter)('确保当前已处于登录状态后，按下回车开始创建定向模版！\n');
    await (0, utils_1.saveAuthState)(context, 'auth_state_adq.json');
    const accountId = df.length > 0 ? Object.values(df[0])[0] : '';
    console.log(`创建定向模版账户为：${accountId}`);
    await page.goto(`https://ad.qq.com/atlas/${accountId}/addelivery/adgroups-add`);
    const num = Math.pow(2, idSelector.idCount) - 1;
    console.log(`预计创建 ${num} 个定向模版`);
    await page.getByRole('button', { name: '展开更多选项' }).click();
    await page.getByRole('button', { name: '手动定向' }).click();
    await page.getByRole('button', { name: '使用手动定向' }).click();
    await page.getByRole('button', { name: 'CPM', exact: true }).click();
    for (let i = 0; i < num; i++) {
        if (i === 0) {
            await page.getByRole('button', { name: '全部定向' }).click();
            await page.getByRole('button', { name: '排除人群' }).click();
        }
        else {
            await page.locator('a.spaui-cursor-pointer').filter({ hasText: /^清空$/ }).click();
        }
        const avoidList = idSelector.getNthChoice(i + 1);
        for (const avoid of avoidList) {
            await page.getByRole('textbox', { name: '搜索用户群' }).fill(String(avoid));
            await (0, utils_1.sleep)(800);
            await page.locator('tr[data-rowindex="0"] span.spaui-checkbox-indicator').first().click();
        }
        if (i === 0) {
            await page.getByRole('button', { name: '确定' }).click();
            await page.locator('h3.title[title="排除人群"]').click();
        }
        await page.getByRole('button', { name: '保存为定向模版' }).click();
        const templateNm = page.getByRole('textbox', { name: '请输入定向模版名称，最多50字' });
        await templateNm.fill(`No${i + 1}template${Date.now()}`);
        await page.getByRole('button', { name: '确定' }).click();
        console.log(`第${i + 1}条定向模版 : 创建成功\n`);
    }
    (0, utils_1.waitForEnter)('所有定向模版创建成功，press Enter and quit');
    } finally {
        // 即使中途抛错也确保关闭浏览器，避免残留 Chrome 进程
        await context.close();
        await browser.close();
    }
}
/**
 * 替换创意
 */
async function runAdqReplace(df) {
    const { browser, context } = await (0, utils_1.launchBrowser)('auth_state_adq.json');
    try {
        const page = await context.newPage();
    await page.goto('https://ad.qq.com');
    (0, utils_1.waitForEnter)('确保当前已处于登录状态后，按下回车开始替换！\n');
    await (0, utils_1.saveAuthState)(context, 'auth_state_adq.json');
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
        const accountId = String(values[0]); // 账户ID
        const adId = String(values[1]); // 广告ID
        const unitId = String(values[2]); // 创意ID
        const assetNm = values.length > 3 ? values[3] : ''; // 替换图片
        const copywriting = values.length > 4 ? values[4] : ''; // 文案
        const landing = values.length > 5 ? values[5] : ''; // 落地页
        const actionBtn = values.length > 6 ? values[6] : ''; // 行动按钮
        const actionBtnFloatCard = values.length > 7 ? values[7] : ''; // 行动按钮_浮层卡片
        await page.goto(`https://ad.qq.com/atlas/${accountId}/delivery-page/creatives-update?adgroup_id=${adId}&dynamic_creative_id=${unitId}`);
        if (assetNm && String(assetNm).trim() !== '') {
            await page.getByRole('button', { name: '清除' }).first().click();
            await page.locator('div.spaui-form-group-prefix button.x-filter-btn.spaui-button.spaui-button-text.spaui-button-sm.with-icon').first().click();
            await page.getByRole('textbox', { name: '请输入名称/ID' }).fill(String(assetNm));
            await page.getByRole('textbox', { name: '请输入名称/ID' }).press('Enter');
            await page.locator('div.odc-titlebar-desc.odc-line-clamp.break-all').filter({ hasText: new RegExp(`^ID:${assetNm}$`) }).first().click({ force: true });
        }
        // 文案
        if (await page.getByText('文案').count() > 0 && copywriting && String(copywriting).trim() !== '') {
            await page.getByText('文案').click();
            const metaInput = page.locator('div.meta-input');
            await metaInput.fill(String(copywriting));
        }
        // 落地页
        if (landing && String(landing).trim() !== '') {
            await page.locator('span').filter({ hasText: /^落地页$/ }).click();
            if (/^kfcapplinkurl/.test(String(landing))) {
                await page.locator('li.readonly.spaui-cursor-pointer').filter({ hasText: /^应用直达$/ }).click();
                await page.locator('span').filter({ hasText: String(landing) }).click({ force: true });
            }
            else {
                await page.locator('li.readonly.spaui-cursor-pointer').filter({ hasText: /^微信小程序$/ }).click();
                await page.locator('button.x-elem-add-btn.spaui-button.spaui-button-default.with-icon').first().click();
                await page.getByRole('textbox', { name: 'gh 开头的小程序原始 ID' }).fill('gh_f01f85672b87');
                await page.getByRole('textbox', { name: '请输入小程序链接' }).fill(String(landing));
                await page.getByRole('button', { name: '新建至账户' }).click();
            }
        }
        // 行动按钮
        if (actionBtn && String(actionBtn).trim() !== '') {
            await page.getByText('营销组件').first().click();
            await page.locator('div.x-comp-overv-info span.odc-text').filter({ hasText: '行动按钮' }).dblclick({ delay: 150 });
            await page.locator('span.odc-text.ellipsis').filter({ hasText: '行动按钮' }).click();
            await page.getByText('请选择按钮文案').click();
            await page.getByRole('textbox', { name: '搜索' }).fill(actionBtn);
            const selector = await page.waitForSelector(`div.selection-name[data-value="${actionBtn}"]`, { timeout: 3000 });
            await selector.click();
            await page.getByRole('button', { name: '确定' }).click();
        }

        // 行动按钮_浮层卡片
        if (actionBtnFloatCard && String(actionBtnFloatCard).trim() !== '') {
            await page.getByText('营销组件').first().click();
            await page.locator('span.odc-text.ellipsis').filter({ hasText: '浮层卡片' }).click();
            await page.locator('section.tw-text-xs.tw-text-coolgray-10.tw-px-2.tw-bg-gray-025a.tw-rounded.tw-flex.tw-items-center.tw-justify-center.tw-h-5').filter({ hasText: actionBtnFloatCard }).first().click();
        }

        await (0, utils_1.sleep)(500); // 1秒等待
        // 提交
        await page.getByRole('button', { name: '提交创意' }).click();
        await page.getByRole('button', { name: '返回创意管理' }).click();
        await page.getByRole('button', { name: '编辑' }).first().waitFor({ state: 'visible', timeout: 20000 });
        // 回写 BB 完成标记（断点续跑）
        doneRows.add(index);
        (0, utils_1.markRowAndPersist)(df, index, [{ col: utils_1.TAG_COL, value: utils_1.TAG_VALUE }]);
        console.log(`第${index + 1}条创意 : 修改成功\n`);
    }
    // 全部完成则删列收尾；否则保留以便续跑
    // ⛔ 删列收尾功能已临时关停：任务结束后不再删除 AS 及之后的列，原文件保留全部列。恢复时取消下行注释即可。
    // (0, utils_1.trimColumnsIfAllDone)(df, doneRows);
    (0, utils_1.waitForEnter)('所有创意修改成功，press Enter and quit');
    } finally {
        // 即使中途抛错也确保关闭浏览器，避免残留 Chrome 进程
        await context.close();
        await browser.close();
    }
}
