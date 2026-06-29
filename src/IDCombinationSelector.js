"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IDCombinationSelector = void 0;
/**
 * ID组合选择器（避投组合）
 *
 * 任意数量N个ID的组合选择器。
 * 核心逻辑：第 n 次的组合由 n 的二进制位直接决定（bit i=1 → 取第 i 个 ID），按需生成、不预存。
 * 唯一性/完备性：n∈[1, 2^N-1] 的整数 ↔ N 位非零二进制串 ↔ 非空子集，三者一一对应（双射），
 * 故不同 n 必得不同组合，且 1..2^N-1 恰不重不漏地遍历全部 2^N-1 个非空组合。
 * 业务只要求"每行排除一个不同的避投组合"，出现顺序无所谓，故无需预生成、每次查询 O(N)。
 */
class IDCombinationSelector {
    customIds;
    _idCount;
    _totalValid;
    constructor(customIds) {
        // 第一步：校验ID列表不能为空
        if (!Array.isArray(customIds)) {
            throw new TypeError(`必须传入数组类型的ID集合！你当前传入的是${typeof customIds}`);
        }
        this._idCount = customIds.length;
        if (this._idCount === 0) {
            throw new Error('传入的ID列表不能为空！至少需要1个ID');
        }
        this.customIds = customIds;
        this._totalValid = Math.pow(2, this._idCount) - 1;
        // JS 位运算是 32 位有符号，N>31 时 n 可能 ≥2^31 导致按位生成失真；避投包业务 N 远小于此，此处仅防御性告警。
        if (this._idCount > 31) {
            console.warn(`⚠️  ID 数量 ${this._idCount} >31，超出按位生成的 32 位安全范围，组合可能不完整\n`);
        }
        console.log(`✅ 避投包初始化完成：${this._idCount} 个ID，共 ${this._totalValid} 种组合（按需生成，不预存）\n`);
    }
    /**
     * 公共查询方法：获取第n次的ID组合（按 n 的二进制位按需生成，不重复、不遗漏）。
     * @param n 目标查询次数（1≤n≤总组合数 2^N-1）
     * @returns 第n次选用的ID数组（元素按 customIds 原始顺序）
     *
     * 证明：n 的二进制表示唯一确定一个子集；n∈[1,2^N-1] 遍历所有非零 N 位串 → 所有非空子集各一次。
     */
    getNthChoice(n) {
        // 严格校验次数n的合法性
        if (!Number.isInteger(n)) {
            throw new TypeError(`查询次数必须是正整数！你输入的是${n}（类型：${typeof n}）`);
        }
        if (n < 1 || n > this._totalValid) {
            throw new Error(`查询次数超出有效范围！${this._idCount}个ID的有效次数是 1 ~ ${this._totalValid}（当前输入：${n}）`);
        }
        // bit i=1 → 取 customIds[i]；无符号右移遍历至 bits=0（最多 N 次迭代）
        const result = [];
        let bits = n;
        for (let i = 0; bits > 0; i++) {
            if (bits & 1) {
                result.push(this.customIds[i]);
            }
            bits >>>= 1;
        }
        return result;
    }
    get idCount() {
        return this._idCount;
    }
    get totalValid() {
        return this._totalValid;
    }
}
exports.IDCombinationSelector = IDCombinationSelector;
