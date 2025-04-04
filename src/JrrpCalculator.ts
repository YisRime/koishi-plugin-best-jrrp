import { DisplayMode, FoolConfig, FoolMode, JrrpAlgorithm, ExpressionType } from './index'
import { JrrpService } from './JrrpService'
import { expressions } from './expressions'

/**
 * Random.org API响应接口
 * @interface RandomOrgResponse
 * @description 定义Random.org API返回的响应格式
 */
interface RandomOrgResponse {
  jsonrpc: string;
  result?: {
    random: {
      data: number[];
      completionTime: string;
    };
    bitsUsed: number;
    bitsLeft: number;
    requestsLeft: number;
    advisoryDelay: number;
  };
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: number;
}

/**
 * JRRP计算器类
 * @class JrrpCalculator
 * @description 处理所有JRRP值的计算逻辑
 */
export class JrrpCalculator {
  /**
   * 使用识别码计算JRRP值
   * @param code 用户识别码
   * @param date 计算日期
   * @param password 加密密钥
   * @returns 计算得到的JRRP分数(0-100)
   */
  static calculateJrrpWithCode(code: string, date: Date, password: string): number {
    // 计算当年的天数偏移
    const year = date.getFullYear();
    const day = date.getDate();
    const start = new Date(year, 0, 0);
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    // 哈希函数
    const getHash = (str: string): bigint => {
      let hash = BigInt(5381)
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << BigInt(5)) ^ hash ^ BigInt(str.charCodeAt(i))) & ((BigInt(1) << BigInt(64)) - BigInt(1))
      }
      return hash ^ BigInt('0xa98f501bc684032f')
    };
    // 混合哈希值生成
    const hash1 = getHash(['asdfgbn', String(dayOfYear), '12#3$45', String(year), 'IUY'].join(''));
    const hash2 = getHash([password, code, '0*8&6', String(day), 'kjhg'].join(''));
    const divisorThree = BigInt(3);
    const mergedHash = (hash1 / divisorThree + hash2 / divisorThree);
    const normalizedHash = Math.abs(Number(mergedHash) / 527.0);
    const randomValue = Math.round(normalizedHash) % 1001;
    return randomValue >= 970 ? 100 : Math.round((randomValue / 969.0) * 99.0);
  }

  /**
   * 从Random.org API获取真随机数
   * @param apiKey Random.org API密钥
   * @returns 获取的随机数，如果API请求失败则返回null
   */
  static async getRandomOrgScore(apiKey: string): Promise<number|null> {
    if (!apiKey) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('https://api.random.org/json-rpc/4/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "generateIntegers",
          params: {
            apiKey,
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
      const data: RandomOrgResponse = await response.json();
      return data.result?.random.data[0] ?? null;
    } catch (error) {
      clearTimeout(timeout);
      return null;
    }
  }

  /**
   * 基于选择的算法计算JRRP分数
   * @param userDateSeed 用户日期种子字符串
   * @param date 计算日期
   * @param algorithm 使用的算法类型
   * @param Code 可选的识别码
   * @param password 可选的密钥
   * @returns 计算得到的JRRP分数(0-100)
   */
  static calculateScoreWithAlgorithm(
    userDateSeed: string,
    date: Date,
    algorithm: JrrpAlgorithm,
    Code?: string,
    password?: string
  ): number {
    if (Code && password) {
      return this.calculateJrrpWithCode(Code, date, password);
    }
    switch (algorithm) {
      case JrrpAlgorithm.GAUSSIAN: {
        const normalRandom = (seed: string): number => {
          const hash = JrrpService.hashCode(seed)
          const randomFactor = Math.sin(hash) * 10000
          return randomFactor - Math.floor(randomFactor)
        }
        const toNormalLuck = (random: number): number => {
          const u1 = random
          const u2 = normalRandom(random.toString())
          const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2)
          return Math.min(100, Math.max(0, Math.round(z * 15 + 50)))
        }
        const dateWeight = (date.getDay() + 1) / 7
        const baseRandom = normalRandom(userDateSeed)
        const weightedRandom = (baseRandom + dateWeight) / 2
        return toNormalLuck(weightedRandom)
      }
      case JrrpAlgorithm.LINEAR: {
        const lcgSeed = JrrpService.hashCode(userDateSeed)
        return Math.floor(((lcgSeed * 9301 + 49297) % 233280) / 233280 * 101)
      }
      case JrrpAlgorithm.BASIC:
      default:
        return Math.abs(JrrpService.hashCode(userDateSeed)) % 101
    }
  }

  /**
   * 根据娱乐模式格式化分数显示
   * @param score 原始分数
   * @param date 日期
   * @param foolConfig 娱乐模式配置
   * @returns 格式化后的分数字符串
   */
  static formatScore(score: number, date: Date, foolConfig: FoolConfig): string {
    try {
      const isValidFoolDate = !foolConfig.date || (
        foolConfig.date === `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      );
      if (foolConfig.type !== FoolMode.ENABLED || !isValidFoolDate) {
        return score.toString();
      }
      switch (foolConfig.displayType) {
        case DisplayMode.BINARY:
          return score.toString(2);
        case DisplayMode.EXPRESSION: {
          const expressionType = foolConfig.expressionType || ExpressionType.SIMPLE;
          const expressionCollection = expressionType === ExpressionType.SIMPLE
            ? expressions.simple
            : expressions.complex;
          const scoreExpressions = expressionCollection[score];
          if (!scoreExpressions?.length) {
            return score.toString();
          }
          return scoreExpressions[Math.floor(Math.random() * scoreExpressions.length)];
        }
        default:
          return score.toString();
      }
    } catch (error) {
      return score.toString();
    }
  }
}