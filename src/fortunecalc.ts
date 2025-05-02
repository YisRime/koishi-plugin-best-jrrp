import { JrrpAlgorithm } from './index'

/**
 * 人品计算结果接口
 * @interface FortuneResult
 * @property {number} score 人品分数
 * @property {JrrpAlgorithm} actualAlgorithm 实际使用的算法
 */
export interface FortuneResult {
  score: number
  actualAlgorithm: JrrpAlgorithm
}

/**
 * 人品计算器类
 * @class FortuneCalc
 */
export class FortuneCalc {
  private algorithm: JrrpAlgorithm
  private apiKey?: string

  /**
   * 创建人品计算器实例
   * @param {JrrpAlgorithm} algorithm - 计算算法
   * @param {string} [apiKey] - Random.org API密钥
   */
  constructor(algorithm: JrrpAlgorithm, apiKey?: string) {
    this.algorithm = algorithm
    this.apiKey = apiKey
  }

  /**
   * 计算人品值
   * @param {string} userId - 用户ID
   * @param {string} date - 日期字符串
   * @returns {Promise<FortuneResult>} 计算结果
   */
  async calculate(userId: string, date: string): Promise<FortuneResult> {
    // 尝试使用Random.org
    if (this.algorithm === JrrpAlgorithm.RANDOMORG && this.apiKey) {
      const score = await this.fetchRandom();
      if (score !== null) {
        return { score, actualAlgorithm: JrrpAlgorithm.RANDOMORG };
      }
    }
    // 本地算法计算
    const seed = this.generateSeed(userId, date);
    let score: number;
    if (this.algorithm === JrrpAlgorithm.GAUSSIAN) {
      const u1 = Math.abs(Math.sin(seed) * 10000 % 1) || 0.0001,
        u2 = Math.abs(Math.sin(seed + 127) * 10000 % 1) || 0.0001,
        z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      score = Math.max(0, Math.min(100, Math.round(z * 15 + 50)));
    } else {
      score = Math.floor(((1664525 * seed + 1013904223) % (2 ** 32)) / (2 ** 32) * 101);
    }
    return { score, actualAlgorithm: this.algorithm };
  }

  /**
   * 从Random.org获取真随机数
   * @private
   * @returns {Promise<number|null>} 随机数，失败返回null
   */
  private async fetchRandom(): Promise<number|null> {
    if (!this.apiKey) return null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const response = await fetch('https://api.random.org/json-rpc/4/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "generateIntegers",
          params: { apiKey: this.apiKey, n: 1, min: 0, max: 100 },
          id: 1
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) return null;
      const data = await response.json();
      return data?.result?.random?.data?.[0] ?? null;
    } catch { return null }
  }

  /**
   * 根据用户ID和日期生成种子
   * @private
   * @param {string} userId - 用户ID
   * @param {string} dateStr - 日期字符串
   * @returns {number} 生成的种子
   */
  private generateSeed(userId: string, dateStr: string): number {
    let hash = 0, str = userId + dateStr;
    for (let i = 0; i < str.length; i++)
      hash = ((hash << 5) - hash) + str.charCodeAt(i), hash |= 0;
    return Math.abs(hash);
  }
}