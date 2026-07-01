"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentDir = getCurrentDir;
exports.getProjectRoot = getProjectRoot;
exports.getBrowserPath = getBrowserPath;
exports.launchBrowser = launchBrowser;
exports.saveAuthState = saveAuthState;
exports.sleep = sleep;
exports.robustRefresh = robustRefresh;
exports.withRowRetry = withRowRetry;
exports.keepAwake = keepAwake;
exports.stopKeepAwake = stopKeepAwake;
exports.readExcelFile = readExcelFile;
exports.readTxtFile = readTxtFile;
exports.getUrlParam = getUrlParam;
exports.promptUser = promptUser;
exports.waitForEnter = waitForEnter;
exports.writeBackInPlace = writeBackInPlace;
exports.assertExcelWritable = assertExcelWritable;
const fs = require("fs");
const path = require("path");
const os = require("os");
const XLSX = require("xlsx");
const iconv = require("iconv-lite");
const playwright_1 = require("playwright");
const child_process = require("child_process");
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
 * 鲁棒的页面刷新：先 goto 到一个干净 URL 逃出卡死/脏状态；若 goto 抛错（页面彻底卡死），
 * 则关闭旧 tab、在同一 context 下新开一个 tab（共享登录态，无需重登）；若仍失败则原样返回旧 page。
 * 永不抛错，始终返回一个可用 page。用于行级重试前重置页面（实测刷新后重试可解决约 80% 瞬时错误）。
 */
async function robustRefresh(page, context, url) {
    try {
        await page.goto(url, { timeout: 20000, waitUntil: 'domcontentloaded' });
        return page;
    }
    catch {
        // 旧 tab 已卡死，关掉它（关不掉也无所谓）
        try {
            await page.close();
        }
        catch { /* 忽略 */ }
        try {
            return await context.newPage();
        }
        catch {
            return page; // 实在没办法，原样返回
        }
    }
}
/**
 * 行级「刷新 + 重试」容错：把单行搭建包进来，首跑失败则刷新页面重试，最多 retries 次重试（共 retries+1 次尝试）。
 * run(attempt) 为本行搭建逻辑；attempt=0 是首跑（无额外开销），attempt>0 时由调用方在 run 内自行做
 * robustRefresh + sleep（内存 df 已由 markRowAndPersist 在回写时经 applyRowToMemory 同步，BA/BB 守卫能直接读到上次写入，无需再 readExcelFile 重读）。
 * 致命错误（run 内抛 e.fatal=true，如回写失败）不重试，立即向上抛中止整批——重试无益且重跑会重复创建广告/创意。
 * 非致命错误全部尝试均失败 → 抛聚合错误（交由外层 main 兜底中止整批）；绝不跳行。
 */
async function withRowRetry(index, retries, run) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            await run(attempt);
            return; // 本行成功
        }
        catch (e) {
            // 致命错误（如回写失败）不重试：重试也会失败，且重跑行体会重复创建广告/创意，立即中止交人工处理
            if (e && e.fatal) {
                throw e;
            }
            const msg = (e && e.message) ? e.message : String(e);
            if (attempt < retries) {
                console.warn(`⚠️  第${index + 1}行 第${attempt + 1}次执行失败：${msg}；刷新页面重试...\n`);
            }
            else {
                throw new Error(`第${index + 1}行 连续 ${retries + 1} 次执行均失败（已刷新重试 ${retries} 次），需人工介入。最后错误：${msg}\n`);
            }
        }
    }
}
let keepAwakeProc = null;
/**
 * 防休眠：起一个后台 PowerShell 调用 Win32 SetThreadExecutionState，让 Windows 在搭建期间
 * （含登录等待）不进入休眠/熄屏。公司机系统休眠设置锁不住、也不需要管理员权限；不改任何系统设置，
 * 只在该进程存活期间生效，stopKeepAwake 或进程退出即解除。
 * 0x80000003 = ES_CONTINUOUS(0x80000000) | ES_SYSTEM_REQUIRED(0x1) | ES_DISPLAY_REQUIRED(0x2)，
 * 含 DISPLAY 是因为非 headless 浏览器需要显示会话，熄屏会致 Playwright 超时崩溃。
 * for 循环最多撑 2 小时（120×60s）自退，防 Node 被强杀后该进程变孤儿、长期防休眠。
 */
function keepAwake() {
    if (keepAwakeProc) {
        return;
    }
    // 注意：PS 把 0x80000003 当 Int32 解析会溢出成负数、转 uint32 失败，故用十进制 2147483651（=0x80000003）。
    const ps = `$s='[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);';$t=Add-Type -MemberDefinition $s -Name P -Namespace W -PassThru;[void]$t::SetThreadExecutionState([uint32]2147483651);for($i=0;$i -lt 120;$i++){Start-Sleep -Seconds 60}`;
    try {
        keepAwakeProc = child_process.spawn('powershell.exe', ['-NoProfile', '-Command', ps], { windowsHide: true, stdio: 'ignore' });
        keepAwakeProc.unref();
        console.log(`☕  已开启防休眠（最长 2 小时，搭建结束自动解除）\n`);
    }
    catch (e) {
        const msg = (e && e.message) ? e.message : String(e);
        console.warn(`⚠️  开启防休眠失败（不影响搭建，仅可能因休眠中断）：${msg}\n`);
    }
}
/**
 * 解除防休眠：杀掉 keepAwake 起的 PowerShell。进程被杀后其线程结束，Windows 自动恢复默认休眠行为。
 */
function stopKeepAwake() {
    if (!keepAwakeProc) {
        return;
    }
    try {
        keepAwakeProc.kill();
    }
    catch { /* 忽略 */ }
    keepAwakeProc = null;
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
 * 启动前检测：Excel 文件是否被占用（在 Excel 中打开会独占写权限，导致回写断点状态静默失败）。
 * 用 'r+' 申请读写权限尝试打开：能打开说明未被占用（立即关闭，不改动文件）；抛错说明被占用。
 */
function assertExcelWritable() {
    const root = getProjectRoot();
    const files = fs.readdirSync(root);
    let target = null;
    for (const filename of files) {
        const isValid = filename.endsWith('.xlsx') &&
            !filename.startsWith('~$') &&
            !filename.startsWith('$') &&
            fs.statSync(path.join(root, filename)).isFile();
        if (isValid) {
            target = filename;
            break;
        }
    }
    if (!target) {
        throw new Error('❌ 未找到有效的 .xlsx 文件，无法检测是否被占用\n');
    }
    const fullPath = path.join(root, target);
    let fd;
    try {
        fd = fs.openSync(fullPath, 'r+'); // 申请读写权限；Excel 占用时抛 EBUSY/EPERM/EACCES
    }
    catch (e) {
        if (e && (e.code === 'EBUSY' || e.code === 'EPERM' || e.code === 'EACCES')) {
            throw new Error(`❌ Excel 文件 "${target}" 被占用（或无写权限），请在 Excel 中关闭后重试\n`);
        }
        throw e; // 其它异常原样抛出
    }
    finally {
        if (fd !== undefined) {
            fs.closeSync(fd);
        }
    }
    console.log(`✅ Excel 未被占用，可正常回写：${target}\n`);
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
 * 回写用的工作簿缓存。运行期间 Excel 必须关闭（assertExcelWritable 已保证），只有本进程在写、
 * 每次 writeFile 都落盘 → 内存累积态 ≡ 磁盘最新态。故缓存整个工作簿对象复用同一份即可，
 * 免去每次回写都 readFile 整本表（#1 性能优化：批量场景省去数百次全量读）。
 */
let _writeWbCache = null;
function getWriteWorkbook() {
    if (_writeWbCache) {
        return _writeWbCache;
    }
    const root = getProjectRoot();
    const files = fs.readdirSync(root).filter(f => f.endsWith('.xlsx') &&
        !f.startsWith('~$') && !f.startsWith('$') &&
        fs.statSync(path.join(root, f)).isFile());
    for (const f of files) {
        try {
            const tplPath = path.join(root, f);
            const workbook = XLSX.readFile(tplPath);
            _writeWbCache = { tplPath, workbook };
            return _writeWbCache;
        }
        catch {
            // 尝试下一个文件
        }
    }
    return null;
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
    const cache = getWriteWorkbook();
    if (!cache) {
        throw new Error('❌ 未找到原 xlsx 文件，无法回写断点状态！\n');
    }
    const { tplPath, workbook } = cache;
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
// BA/BB 断点标记列（0-based）。原 52/53，因创意内容列扩展（加卖点图等）后移 5 列到 57/58，
// 给前面创意内容腾空间、避免与数据列冲突。三平台共用：adq/dy 用 BA+BB，bili 仅 BB。
const BA_COL = 57;
const TAG_COL = 58;
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
 * value=null 表示清空该单元格；undefined/空串跳过；其他写入。
 * 磁盘写成功后同步更新内存 df[rowIndex]（applyRowToMemory），使同进程行级重试时 BA/BB 守卫
 * 能直接读到最新值，免去重试前 readExcelFile()[index] 全量重读（#2 性能优化）。
 * 顺序关键：先写磁盘、成功后才更内存，保证内存永不超前磁盘（崩溃重启以磁盘为准）。
 * 回写失败（磁盘满/权限/Excel 被占用等持续性故障）：抛"致命错误"（fatal:true）让 withRowRetry
 * 立即中止整批、不重试——重试也会失败，且重跑行体会重复创建广告/创意；故中止交人工处理
 * （清理平台半成品 + 修磁盘后重启续跑）。
 */
function markRowAndPersist(df, rowIndex, cells) {
    const perRowUpdates = df.map((_, i) => (i === rowIndex ? cells : []));
    try {
        writeBackInPlace(df, perRowUpdates);
        applyRowToMemory(df, rowIndex, cells);
    }
    catch (e) {
        const err = new Error(`❌ 回写断点状态失败（请关闭 Excel、检查磁盘空间/权限后重试）：${e && e.message ? e.message : e}\n`);
        err.fatal = true;
        throw err;
    }
}
/**
 * 把 cells 反映到内存 df[rowIndex]（键为表头名、按列号定位，与 runners 的 Object.values(row)[col] 一致）。
 * 陷阱①：不能赋值给 Object.values(row)[col]（那是临时数组副本，赋值无效），必须经 Object.keys 映射到键名；
 * 陷阱②：若该行列数不足（如 BA/BB 在 col57/58 超出原表头列数），补 __PAD_ 占位键扩展到目标列，保持列对齐、绝不读盘。
 */
function applyRowToMemory(df, rowIndex, cells) {
    const row = df[rowIndex];
    if (!row) {
        return;
    }
    for (const u of cells) {
        if (u.value === null) {
            // 清空：内存里把对应键置空串（键已存在时）
            const keys = Object.keys(row);
            if (u.col < keys.length) {
                row[keys[u.col]] = '';
            }
            continue;
        }
        if (u.value === undefined || String(u.value).trim() === '') {
            continue;
        }
        // 确保 row 键数 > u.col：不足则补 __PAD_ 占位键，保持 Object.values(row)[col] 列对齐、绝不读盘。
        // （BA/BB 在 col57/58 常超出 Excel 原表头列数；旧逻辑回退 readExcelFile 会导致每行读盘+刷日志）
        let keys = Object.keys(row);
        while (keys.length <= u.col) {
            row[`__PAD_${keys.length}`] = '';
            keys = Object.keys(row);
        }
        row[keys[u.col]] = String(u.value);
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
exports.BA_COL = BA_COL;
exports.TAG_COL = TAG_COL;
exports.TAG_VALUE = TAG_VALUE;
exports.TRIM_MAX_COL = TRIM_MAX_COL;
exports.readDoneRows = readDoneRows;
exports.markRowAndPersist = markRowAndPersist;
exports.trimColumnsInPlace = trimColumnsInPlace;
exports.trimColumnsIfAllDone = trimColumnsIfAllDone;
