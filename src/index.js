"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
const IDCombinationSelector_1 = require("./IDCombinationSelector");
const run_adq_1 = require("./run_adq");
const run_bili_1 = require("./run_bili");
const run_dy_1 = require("./run_dy");
/**
 * 主函数
 */
async function main() {
    console.log('========================================');
    console.log('      广告自动化搭建工具 v2.0 (TS)     ');
    console.log('========================================\n');
    try {
        // 启动前检测：Excel 必须关闭，否则回写断点状态会静默失败、重启可能产生重复
        (0, utils_1.assertExcelWritable)();
        // 读取Excel文件
        const df = (0, utils_1.readExcelFile)();
        // 获取数据信息
        const totalCols = Object.keys(df[0] || {}).length;
        const totalRows = df.length;
        console.log(`📊 数据统计: ${totalRows} 行, ${totalCols} 列\n`);
        // 检测媒体类型并执行相应操作
        if (totalCols >= 13 && Object.keys(df[0] || {})[12] === '媒体') {
            // B站
            console.log('🎬 检测到B站广告数据\n');
            await (0, run_bili_1.runBili)(df);
        }
        else if (totalCols >= 14 && (Object.values(df[0])[13] === '抖音' || Object.values(df[0])[13] === '番茄系媒体')) {
            // 抖音/番茄
            console.log('🎵 检测到抖音/番茄广告数据\n');
            await (0, run_dy_1.runDy)(df);
        }
        else if (totalCols >= 14 && (/(微信|QQ|腾讯音乐|游戏)/.test(String(Object.values(df[0])[13])))) {
            // 腾讯广告
            console.log('💬 检测到腾讯广告数据\n');
            let idSelector = null;
            const bitouInput = (0, utils_1.promptUser)('若搭建cpc广告，请输入大写的 Y 并 回车，否则直接 回车\n');
            if (bitouInput.toUpperCase() === 'Y') {
                const bitouList = (0, utils_1.readTxtFile)();
                idSelector = new IDCombinationSelector_1.IDCombinationSelector(bitouList);
            }
            await (0, run_adq_1.runAdq)(df, idSelector);
        }
        else if (totalCols === 1 && totalRows === 0) {
            // 创建定向模版
            console.log('📋 创建定向模版模式\n');
            const bitouList = (0, utils_1.readTxtFile)();
            const idSelector = new IDCombinationSelector_1.IDCombinationSelector(bitouList);
            await (0, run_adq_1.runAdqCreTemplate)(df, idSelector);
        }
        else {
            // 替换创意
            console.log('🔄 替换创意模式\n');
            await (0, run_adq_1.runAdqReplace)(df);
        }
    }
    catch (error) {
        console.error(`❌ 程序执行出错：${error}\n`);
        process.exit(1);
    }
    console.log('✅ 程序执行完成！\n');
}
// 执行主函数
main().catch(error => {
    console.error(`❌ 未捕获的异常：${error}\n`);
    process.exit(1);
});
