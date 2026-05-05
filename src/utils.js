"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentDir = getCurrentDir;
exports.getProjectRoot = getProjectRoot;
exports.getBrowserPath = getBrowserPath;
exports.launchBrowser = launchBrowser;
exports.saveAuthState = saveAuthState;
exports.sleep = sleep;
exports.readExcelFile = readExcelFile;
exports.readTxtFile = readTxtFile;
exports.saveExcelFile = saveExcelFile;
exports.getUrlParam = getUrlParam;
exports.promptUser = promptUser;
exports.waitForEnter = waitForEnter;
exports.trimAndSaveExcel = trimAndSaveExcel;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const XLSX = __importStar(require("xlsx"));
const iconv = __importStar(require("iconv-lite"));
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
 * 保存Excel文件
 */
function saveExcelFile(data, filename = 'media_id_检查无误后可上传MOP.xlsx') {
    // 读取原始模板，保留Sheet名称、样式、自动筛选等格式
    const tplFiles = fs.readdirSync(getProjectRoot())
        .filter(f => f.startsWith('media_id_import_template') && f.endsWith('.xlsx'));
    if (tplFiles.length === 0) {
        throw new Error('❌ 未找到模板文件(media_id_import_template*.xlsx)，无法保留格式！');
    }
    const tplPath = path.join(getProjectRoot(), tplFiles[0]);
    const workbook = XLSX.readFile(tplPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // 读取模板表头（第1行）
    const headerRow = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' })[0];
    const headers = headerRow.filter(h => h); // 过滤掉空列头

    // 清除旧数据（保留第1行表头），从第2行开始清除
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const addr = XLSX.utils.encode_cell({ r: R, c: C });
            delete worksheet[addr];
        }
    }

    // 写入新数据（从第2行开始）
    data.forEach((row, rowIdx) => {
        headers.forEach((header, colIdx) => {
            if (row[header] !== undefined) {
                const addr = XLSX.utils.encode_cell({ r: rowIdx + 1, c: colIdx });
                worksheet[addr] = { t: typeof row[header] === 'number' ? 'n' : 's', v: row[header] };
            }
        });
    });

    // 更新数据范围
    const newEndRow = data.length; // 数据行数
    const newEndCol = headerRow.length - 1; // 保持模板原始列数
    worksheet['!ref'] = XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: newEndRow, c: newEndCol }
    });

    // 更新自动筛选范围
    if (worksheet['!autofilter']) {
        worksheet['!autofilter'].ref = XLSX.utils.encode_range({
            s: { r: 0, c: 0 },
            e: { r: newEndRow, c: newEndCol }
        });
    }

    const outputPath = path.join(getProjectRoot(), filename);
    XLSX.writeFile(workbook, outputPath);
    console.log(`✅ 文件已保存（基于模板格式）：${outputPath}\n`);
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
 * 输出文件到Excel（只保留前44列）
 */
function trimAndSaveExcel(data, columns = 44) {
    const trimmedData = data.map(row => {
        const newRow = {};
        const keys = Object.keys(row);
        for (let i = 0; i < Math.min(columns, keys.length); i++) {
            newRow[keys[i]] = row[keys[i]];
        }
        return newRow;
    });
    saveExcelFile(trimmedData);
}
