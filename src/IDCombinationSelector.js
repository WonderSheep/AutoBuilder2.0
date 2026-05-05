"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IDCombinationSelector = void 0;
/**
 * ID组合选择器（避投组合）
 *
 * 任意数量N个ID的组合选择器
 * 核心逻辑：初始化时一次性生成所有非空组合并缓存，后续查询直接取缓存，避免重复计算
 */
class IDCombinationSelector {
    customIds;
    _idCount;
    _totalValid;
    allSelected;
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
        // 第二步：一次性生成所有组合并缓存（核心逻辑，仅执行一次）
        this.allSelected = this.generateAllCombinations();
        console.log(`✅ 避投包初始化完成：${this._idCount} 个ID，共 ${this._totalValid} 种组合\n`);
    }
    /**
     * 私有方法：生成所有非空组合（单ID→双ID→…→N个ID），仅初始化时调用
     */
    generateAllCombinations() {
        const allComb = [];
        // 动态循环：从1个ID到N个ID的升序组合
        for (let selectNum = 1; selectNum <= this.idCount; selectNum++) {
            allComb.push(...this.getCombinations(this.customIds, selectNum));
        }
        return allComb;
    }
    /**
     * 获取指定长度的所有组合
     */
    getCombinations(arr, k) {
        if (k === 0)
            return [[]];
        if (arr.length === 0)
            return [];
        const [first, ...rest] = arr;
        const combsWithFirst = this.getCombinations(rest, k - 1).map(comb => [first, ...comb]);
        const combsWithoutFirst = this.getCombinations(rest, k);
        return [...combsWithFirst, ...combsWithoutFirst];
    }
    /**
     * 公共查询方法：获取第n次的ID组合（直接从缓存中取，不重复生成）
     * @param n 目标查询次数（1≤n≤总组合数）
     * @returns 第n次选用的ID数组
     */
    getNthChoice(n) {
        // 严格校验次数n的合法性
        if (!Number.isInteger(n)) {
            throw new TypeError(`查询次数必须是正整数！你输入的是${n}（类型：${typeof n}）`);
        }
        if (n < 1 || n > this._totalValid) {
            throw new Error(`查询次数超出有效范围！${this._idCount}个ID的有效次数是 1 ~ ${this._totalValid}（当前输入：${n}）`);
        }
        // 直接从缓存取值（索引n-1：数组从0开始，n从1开始）
        return [...this.allSelected[n - 1]];
    }
    get idCount() {
        return this._idCount;
    }
    get totalValid() {
        return this._totalValid;
    }
}
exports.IDCombinationSelector = IDCombinationSelector;
