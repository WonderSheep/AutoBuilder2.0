"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentDir = getCurrentDir;
exports.getProjectRoot = getProjectRoot;
exports.getBrowserPath = getBrowserPath;
exports.launchBrowser = launchBrowser;
exports.saveAuthState = saveAuthState;
exports.sleep = sleep;
exports.readExcelFile = readExcelFile;
exports.readTxtFile = readTxtFile;
exports.getUrlParam = getUrlParam;
exports.promptUser = promptUser;
exports.waitForEnter = waitForEnter;
exports.writeBackInPlace = writeBackInPlace;
const fs = require("fs");
const path = require("path");
const os = require("os");
const XLSX = require("xlsx");
const iconv = require("iconv-lite");
const playwright_1 = require("playwright");
/**
 * 获取当前脚本的执行目录（使用相对路径）
 */
function getCurrentDir() {
    return __dirname;
}
/**
 * 获取项目根目录
 */
function getProjectRoot() {
    return path.join(getCurrentDir(), '..');
}
/**
 * 查找本地浏览器路径
 * 优先级: 本地Chrome > 本地Edge
 */
function getBrowserPath() {
    const platform = os.platform();
    // Chrome 路径配置
    const chromePaths = {
        win32: [
            path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            path.join(os.homedir(), 'AppData', 'Local', 'Chromium', 'Application', 'chrome.exe'),
        ],
        darwin: [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ],
        linux: [
            '/usr/bin/google-chrome',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
        ]
    };
    // Edge 路径配置
    const edgePaths = {
        win32: [
            path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        ],
        darwin: [
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        ],
        linux: [
            '/usr/bin/microsoft-edge',
            '/opt/microsoft/msedge/msedge',
        ]
    };
    // 优先查找Chrome
    for (const chromePath of chromePaths[platform] || []) {
        if (fs.existsSync(chromePath)) {
            console.log(`✅ 找到Chrome浏览器：${chromePath}\n`);
            return chromePath;
        }
    }
    // 未找到Chrome，查找Edge
    for (const edgePath of edgePaths[platform] || []) {
        if (fs.existsSync(edgePath)) {
            console.log(`⚠️  未找到Chrome，使用Edge浏览器：${edgePath}\n`);
            return edgePath;
        }
    }
    throw new Error('❌ 未找到本地Chrome或Edge浏览器！请安装Chrome或Edge后重试。\n');
}
/**
 * 启动浏览器（使用本地Chrome或Edge）
 */
async function launchBrowser(authFile = 'auth_state.json') {
    try {
        const browserPath = getBrowserPath();
        const launchOptions = {
            channel: undefined, // 使用自定义路径时不指定channel
            headless: false,
            executablePath: browserPath,
            args: [
                '--disable-blink-features=AutomationControlled', // 防止被检测为自动化
                '--disable-features=DialMediaRouteProvider,MediaRouter', // 禁用投屏/设备发现
                '--disable-device-discovery-notifications',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-background-networking',
            ]
        };
        const browser = await playwright_1.chromium.launch(launchOptions);
        // 尝试加载保存的登录状态
        const authPath = path.join(getProjectRoot(), authFile);
        let context;
        if (fs.existsSync(authPath)) {
            context = await browser.newContext({
                storageState: authPath,
                permissions: [], // 不授予任何权限
            });
            console.log('✅ 已加载登录状态\n');
        }
        else {
            context = await browser.newContext({
                permissions: [], // 不授予任何权限，屏蔽设备访问提示
            });
        }
        return { browser, context };
    }
    catch (error) {
        console.error(`❌ 启动浏览器失败：${error}\n`);
        throw error;
    }
}
/**
 * 保存登录状态
 */
async function saveAuthState(context, filename = 'auth_state.json') {
    const authPath = path.join(getProjectRoot(), filename);
    await context.storageState({ path: authPath });
}
/**
 * 睡眠函数（保留原有的time.sleep逻辑）
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * 读取Excel文件
 */
function readExcelFile() {
    const currentDir = getProjectRoot();
    const files = fs.readdirSync(currentDir);
    for (const filename of files) {
        const filePath = path.join(currentDir, filename);
        const isValidFile = fs.statSync(filePath).isFile() &&
            filename.endsWith('.xlsx') &&
            !filename.startsWith('~$') &&
            !filename.startsWith('$');
        if (isValidFile) {
            try {
                const workbook = XLSX.readFile(filePath);
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
                // 统一去除所有字符串单元格的头尾空格/回车，避免脏数据干扰匹配
                for (const row of data) {
                    for (const key of Object.keys(row)) {
                        if (typeof row[key] === 'string') {
                            row[key] = row[key].trim();
                        }
                    }
                }
                console.log(`✅ 成功读取文件：${filename}\n`);
                return data;
            }
            catch (error) {
                console.error(`❌ 读取文件 ${filename} 失败：${error}\n`);
                continue;
            }
        }
    }
    throw new Error('❌ 未找到有效.xlsx文件，请确保项目目录有非临时的xlsx文件！\n');
}
/**
 * 读取TXT文件（每行一个内容）
 */
function readTxtFile() {
    const currentDir = getProjectRoot();
    const files = fs.readdirSync(currentDir);
    const result = [];
    for (const filename of files) {
        const filePath = path.join(currentDir, filename);
        const isValidFile = fs.statSync(filePath).isFile() &&
            filename.endsWith('.txt') &&
            !filename.startsWith('~$') &&
            !filename.startsWith('$');
        if (isValidFile) {
            try {
                let content = '';
                try {
                    // 优先尝试utf-8
                    content = fs.readFileSync(filePath, 'utf-8');
                }
                catch {
                    // utf-8失败则尝试gbk，使用iconv-lite
                    const buffer = fs.readFileSync(filePath);
                    content = iconv.decode(buffer, 'gbk');
                }
                const lines = content.split('\n');
                for (const line of lines) {
                    const cleanLine = line.trim();
                    if (cleanLine) {
                        result.push(cleanLine);
                    }
                }
                console.log(`✅ 成功读取避投包人群文件：${filename}`);
                console.log(`✅ 共计 ${result.length} 个避投人群包，最多有 ${Math.pow(2, result.length) - 1} 种避投组合\n`);
                return result;
            }
            catch (error) {
                console.error(`❌ 读取TXT文件 ${filename} 失败：${error}\n`);
                continue;
            }
        }
    }
    throw new Error('❌ 未找到有效.txt文件，请确保项目目录有非临时的txt文件！\n');
}
/**
 * 从URL中提取查询参数
 */
function getUrlParam(url, paramName) {
    const match = url.match(new RegExp(`[?&]${paramName}=([^&]*)`));
    return match ? match[1] : null;
}
/**
 * 用户输入提示（同步）
 */
function promptUser(question) {
    const readline = require('readline-sync');
    return readline.question(question);
}
/**
 * 等待用户确认
 */
function waitForEnter(message) {
    const readline = require('readline-sync');
    readline.question(message);
}
/**
 * 就地把每行指定列写回根目录的原 xlsx（保留原工作簿的全部格式）。
 * 用于断点续跑：把每次算出的状态（如已建计划ID、已完成标记）写回，
 * 下次 readExcelFile 读到的就是带状态的文件，从而可恢复进度。
 *
 * @param df              readExcelFile 读出的对象数组，行序对应数据行（sheet 第 2 行起）
 * @param perRowUpdates   df[i] 对应的写入项数组；col 为 0-based 列号，value 为要写的值（空值跳过）
 */
function writeBackInPlace(df, perRowUpdates) {
    const root = getProjectRoot();
    const files = fs.readdirSync(root).filter(f => f.endsWith('.xlsx') &&
        !f.startsWith('~$') && !f.startsWith('$') &&
        fs.statSync(path.join(root, f)).isFile());
    if (files.length === 0) {
        throw new Error('❌ 未找到原 xlsx 文件，无法回写断点状态！\n');
    }
    // 找到第一个可读取的文件（与 readExcelFile 选择逻辑一致）
    let tplPath = null;
    let workbook = null;
    for (const f of files) {
        try {
            tplPath = path.join(root, f);
            workbook = XLSX.readFile(tplPath);
            break;
        }
        catch {
            // 尝试下一个文件
        }
    }
    if (!workbook) {
        throw new Error('❌ 读取原 xlsx 失败，无法回写断点状态！\n');
    }
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    // df[i] 对应 sheet 第 i+1 行（第 0 行是表头）
    for (let i = 0; i < df.length; i++) {
        const updates = perRowUpdates[i] || [];
        for (const u of updates) {
            const addr = XLSX.utils.encode_cell({ r: i + 1, c: u.col });
            if (u.value === null) {
                // 显式清空：删除该单元格（用于清空复制源等列）
                delete worksheet[addr];
                continue;
            }
            if (u.value === undefined || String(u.value).trim() === '') {
                continue;
            }
            worksheet[addr] = { t: 's', v: String(u.value) };
            // 若写入超出原数据范围，扩展 !ref，确保 Excel 能显示这些列
            if (u.col > range.e.c) {
                range.e.c = u.col;
            }
            if (i + 1 > range.e.r) {
                range.e.r = i + 1;
            }
        }
    }
    worksheet['!ref'] = XLSX.utils.encode_range(range);
    XLSX.writeFile(workbook, tplPath);
}
// ===== 断点续跑（三平台统一）：BB 列完成标记 + 循环后删列 =====
// BB 列（第 54 列，0-based 53）填 TAG_VALUE 表示"该行已完成"，三平台共用。
// 用户可在 Excel 里直接增删该值来控制重跑：删掉→该行重跑；填上→强制跳过。
const TAG_COL = 53;
const TAG_VALUE = '1';
// 删列时保留 A-AR（0-based 0-43），删除 AS 及之后（含 BB），与原裁剪逻辑一致。
const TRIM_MAX_COL = 43;
/**
 * 读取已完成的行号集合（BB 列值为 TAG_VALUE 的行）。
 */
function readDoneRows(df) {
    const doneRows = new Set();
    for (let i = 0; i < df.length; i++) {
        const v = Object.values(df[i]);
        if (v.length > TAG_COL && String(v[TAG_COL] || '').trim() === TAG_VALUE) {
            doneRows.add(i);
        }
    }
    return doneRows;
}
/**
 * 就地把指定行的若干单元格写回原 xlsx（其余行不动），用于断点续跑的增量持久化。
 * value=null 表示清空该单元格；undefined/空串跳过；其他写入。回写失败只告警不中断。
 */
function markRowAndPersist(df, rowIndex, cells) {
    const perRowUpdates = df.map((_, i) => (i === rowIndex ? cells : []));
    try {
        writeBackInPlace(df, perRowUpdates);
    }
    catch (e) {
        console.warn(`⚠️  回写断点状态失败（请关闭 Excel 后重试）：${e}\n`);
    }
}
/**
 * 就地删除超过 maxCol 的列（删 AS 及之后，含 BB），写回原 xlsx，保留其余格式。
 */
function trimColumnsInPlace(maxCol = TRIM_MAX_COL) {
    const root = getProjectRoot();
    const files = fs.readdirSync(root).filter(f => f.endsWith('.xlsx') &&
        !f.startsWith('~$') && !f.startsWith('$') &&
        fs.statSync(path.join(root, f)).isFile());
    if (files.length === 0) {
        throw new Error('❌ 未找到原 xlsx 文件，无法删列！\n');
    }
    let tplPath = null;
    let workbook = null;
    for (const f of files) {
        try {
            tplPath = path.join(root, f);
            workbook = XLSX.readFile(tplPath);
            break;
        }
        catch {
            // 尝试下一个文件
        }
    }
    if (!workbook) {
        throw new Error('❌ 读取原 xlsx 失败，无法删列！\n');
    }
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    // 删除所有列号 > maxCol 的单元格
    for (const addr in worksheet) {
        if (addr.startsWith('!')) {
            continue; // 跳过 !ref / !merges / !autofilter 等特殊键
        }
        const cell = XLSX.utils.decode_cell(addr);
        if (cell.c > maxCol) {
            delete worksheet[addr];
        }
    }
    // 收缩 !ref 到 maxCol
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    if (range.e.c > maxCol) {
        range.e.c = maxCol;
    }
    worksheet['!ref'] = XLSX.utils.encode_range(range);
    XLSX.writeFile(workbook, tplPath);
}
/**
 * 若所有行都已完成（doneRows 覆盖全部），就地删列收尾；否则保留文件以便续跑。
 * 返回是否执行了删列。
 */
function trimColumnsIfAllDone(df, doneRows) {
    if (df.length > 0 && doneRows.size >= df.length) {
        trimColumnsInPlace(TRIM_MAX_COL);
        console.log(`✂️  全部完成，已删除 AS 及之后的列（含 BB 标记），原文件即为最终产物\n`);
        return true;
    }
    console.log(`⏸️  尚未全部完成（${doneRows.size}/${df.length}），保留全部列以便断点续跑\n`);
    return false;
}
exports.TAG_COL = TAG_COL;
exports.TAG_VALUE = TAG_VALUE;
exports.TRIM_MAX_COL = TRIM_MAX_COL;
exports.readDoneRows = readDoneRows;
exports.markRowAndPersist = markRowAndPersist;
exports.trimColumnsInPlace = trimColumnsInPlace;
exports.trimColumnsIfAllDone = trimColumnsIfAllDone;
