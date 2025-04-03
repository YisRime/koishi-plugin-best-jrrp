import { DisplayMode, FoolConfig, FoolMode, JrrpAlgorithm, ExpressionType } from '.'
import { JrrpService } from './JrrpService'
import { expressions } from './expressions'

/**
 * Random.org API请求接口
 */
export interface RandomOrgRequest {
  jsonrpc: string;
  method: string;
  params: {
    apiKey: string;
    n: number;
    min: number;
    max: number;
    replacement: boolean;
  };
  id: number;
}

/**
 * Random.org API响应接口
 */
export interface RandomOrgResponse {
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
   * @param {string} code - 识别码
   * @param {Date} date - 日期对象
   * @param {string} password - 密码
   * @returns {number} JRRP值
   */
  static calculateJrrpWithCode(code: string, date: Date, password: string): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const year = date.getFullYear();
    const day = date.getDate();
    const getHash = (str: string): bigint => {
      let hash = BigInt(5381)
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << BigInt(5)) ^ hash ^ BigInt(str.charCodeAt(i))) & ((BigInt(1) << BigInt(64)) - BigInt(1))
      }
      return hash ^ BigInt('0xa98f501bc684032f')
    };
    const hash1 = getHash([
      'asdfgbn',
      String(dayOfYear),
      '12#3$45',
      String(year),
      'IUY'
    ].join(''));
    const hash2 = getHash([
      password,
      code,
      '0*8&6',
      String(day),
      'kjhg'
    ].join(''));
    const divisorThree = BigInt(3);
    const mergedHash = (hash1 / divisorThree + hash2 / divisorThree);
    const normalizedHash = Math.abs(Number(mergedHash) / 527.0);
    const randomValue = Math.round(normalizedHash) % 1001;
    return randomValue >= 970 ? 100 : Math.round((randomValue / 969.0) * 99.0);
  }

  /**
   * 从Random.org API获取真随机数
   * @param {string} apiKey - Random.org API密钥
   * @returns {Promise<number|null>} 随机数或null（如果请求失败）
   */
  static async getRandomOrgScore(apiKey: string): Promise<number|null> {
    try {
      const requestData: RandomOrgRequest = {
        jsonrpc: "2.0",
        method: "generateIntegers",
        params: {
          apiKey: apiKey,
          n: 1,
          min: 0,
          max: 100,
          replacement: true
        },
        id: 1
      };
      const response = await fetch('https://api.random.org/json-rpc/4/invoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
      });
      if (!response.ok) {
        return null;
      }
      const data: RandomOrgResponse = await response.json();
      if (data.error) {
        return null;
      }
      return data.result?.random.data[0] ?? null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 基于选择的算法计算JRRP分数
   * @param {string} userDateSeed - 用户日期种子
   * @param {Date} date - 计算日期
   * @param {JrrpAlgorithm} algorithm - 算法选择
   * @param {string} [Code] - 用户识别码
   * @param {string} [password] - 配置的密码
   * @returns {number} 计算得出的分数(0-100)
   */
  static calculateScoreWithAlgorithm(
    userDateSeed: string,
    date: Date,
    algorithm: JrrpAlgorithm,
    Code?: string,
    password?: string
  ): number {
    if (Code && password) {
      return this.calculateJrrpWithCode(Code, date, password)
    } else {
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
        default: {
          return Math.abs(JrrpService.hashCode(userDateSeed)) % 101
        }
      }
    }
  }

  /**
   * 根据娱乐模式格式化分数显示
   * @param {number} score - 分数
   * @param {Date} date - 日期对象
   * @param {FoolConfig} foolConfig - 娱乐模式配置
   * @returns {string} 格式化后的分数
   */
  static formatScore(score: number, date: Date, foolConfig: FoolConfig): string {
    try {
      const isValidFoolDate = !foolConfig.date ||
        (date.getMonth() + 1 === parseInt(foolConfig.date.split('-')[0]) &&
         date.getDate() === parseInt(foolConfig.date.split('-')[1]));
      if (foolConfig.type !== FoolMode.ENABLED || !isValidFoolDate) {
        return score.toString()
      }
      switch (foolConfig.displayType) {
        case DisplayMode.BINARY:
          return score.toString(2)
        case DisplayMode.EXPRESSION:
          // 根据表达式类型选择不同的表达式集合
          const expressionCollection = foolConfig.expressionType === ExpressionType.SIMPLE
            ? expressions.simple
            : expressions.complex;
          // 获取对应分数的表达式列表
          const scoreExpressions = expressionCollection[score];
          if (!scoreExpressions || scoreExpressions.length === 0) {
            return score.toString();
          }
          // 随机选择一个表达式
          const randomIndex = Math.floor(Math.random() * scoreExpressions.length);
          return scoreExpressions[randomIndex];
        default:
          return score.toString()
      }
    } catch (error) {
      return score.toString()
    }
  }
}
