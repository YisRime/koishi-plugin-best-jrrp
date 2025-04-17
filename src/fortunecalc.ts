import { JrrpAlgorithm } from './index'

/**
 * 人品计算结果接口
 * @interface FortuneResult
 */
export interface FortuneResult {
  /** 人品分数 */
  score: number
  /** 实际使用的算法 */
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
    // 检查是否使用Random.org且有API密钥
    if (this.algorithm === JrrpAlgorithm.RANDOMORG && this.apiKey) {
      const score = await this.fetchRandom();
      // 检查是否获取成功
      if (score !== null) {
        return { score, actualAlgorithm: JrrpAlgorithm.RANDOMORG };
      }
    }
    // 使用本地算法计算
    const seed = this.generateSeed(userId, date);
    const score = this.algorithm === JrrpAlgorithm.GAUSSIAN ?
      this.gaussianDistribution(seed) : this.linearCongruential(seed);
    return { score, actualAlgorithm: this.algorithm };
  }

  /**
   * 从Random.org获取真随机数
   * @private
   * @returns {Promise<number|null>} 随机数，失败返回null
   */
  private async fetchRandom(): Promise<number|null> {
    if (!this.apiKey) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch('https://api.random.org/json-rpc/4/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "generateIntegers",
          params: {
            apiKey: this.apiKey,
            n: 1,
            min: 0,
            max: 100,
            replacement: true
          },
          id: 1
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);
      if (!response.ok) return null;

      const data = await response.json();
      return data?.result?.random?.data?.[0] ?? null;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  /**
   * 根据用户ID和日期生成种子
   * @private
   * @param {string} userId - 用户ID
   * @param {string} dateStr - 日期字符串
   * @returns {number} 生成的种子
   */
  private generateSeed(userId: string, dateStr: string): number {
    let seed = 0;
    const str = userId + dateStr;

    for (let i = 0; i < str.length; i++) {
      seed = ((seed << 5) - seed) + str.charCodeAt(i);
      seed |= 0;
    }

    return Math.abs(seed);
  }

  /**
   * 使用高斯分布计算人品值
   * @private
   * @param {number} seed - 种子
   * @returns {number} 人品值(0-100)
   */
  private gaussianDistribution(seed: number): number {
    const u1 = Math.abs(Math.sin(seed) * 10000 % 1) || 0.0001;
    const u2 = Math.abs(Math.sin(seed + 127) * 10000 % 1) || 0.0001;
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    return Math.max(0, Math.min(100, Math.round(z * 15 + 50)));
  }

  /**
   * 使用线性同余法计算人品值
   * @private
   * @param {number} seed - 种子
   * @returns {number} 人品值(0-100)
   */
  private linearCongruential(seed: number): number {
    return Math.floor(((1664525 * seed + 1013904223) % (2 ** 32)) / (2 ** 32) * 101);
  }
}