import { DisplayMode, FoolConfig, FoolMode, JrrpAlgorithm } from '.'
import { JrrpService } from './JrrpService'

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
   * 获取指定日期在一年中的天数
   * @param {Date} date - 日期对象
   * @returns {number} 天数(1-366)
   */
  static getDayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  }

  /**
   * 计算字符串的64位哈希值
   * @param {string} str - 输入字符串
   * @returns {bigint} 哈希值
   */
  static getHash(str: string): bigint {
    let hash = BigInt(5381)
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << BigInt(5)) ^ hash ^ BigInt(str.charCodeAt(i))) & ((BigInt(1) << BigInt(64)) - BigInt(1))
    }
    return hash ^ BigInt('0xa98f501bc684032f')
  }

  /**
   * 使用识别码计算JRRP值
   * @param {string} code - 识别码
   * @param {Date} date - 日期对象
   * @param {string} password - 密码
   * @returns {number} JRRP值
   */
  static calculateJrrpWithCode(code: string, date: Date, password: string): number {
    const dayOfYear = this.getDayOfYear(date);
    const year = date.getFullYear();
    const day = date.getDate();
    const hash1 = this.getHash([
      'asdfgbn',
      String(dayOfYear),
      '12#3$45',
      String(year),
      'IUY'
    ].join(''));
    const hash2 = this.getHash([
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
        console.error(`HTTP error! Status: ${response.status}`);
        return null;
      }

      const data: RandomOrgResponse = await response.json();

      if (data.error) {
        console.error('Random.org API error:', data.error);
        return null;
      }

      return data.result?.random.data[0] ?? null;
    } catch (error) {
      console.error('Failed to fetch random number from Random.org:', error);
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
}

/**
 * 表达式生成器类
 * @class ExpressionGenerator
 * @description 生成各种形式的数学表达式
 */
export class ExpressionGenerator {
  private digitExpressions = new Map<number, string[]>()
  private expressionsInitialized = false
  constructor() {
    this.expressionsInitialized = true;
  }

  /**
   * 获取数字基础表达式
   * @private
   * @param {number} n - 目标数字
   * @param {number} baseNumber - 基础数字
   * @returns {string} 基础表达式
   */
  private getDigitExpr(n: number, baseNumber: number): string {
    if (!this.expressionsInitialized) {
      const b = baseNumber;
      this.digitExpressions.set(b, [String(b)]);
      // 设置1-9的数字表达式
      for (let i = 1; i <= 9; i++) {
        if (i === b) continue;
        if (i <= 9) {
          this.digitExpressions.set(i, [String(i)]);
        }
      }
      this.digitExpressions.set(0, [`(${b} - ${b})`, `(${b} ^ ${b})`]);
      this.digitExpressions.set(10, [`((${b} << ${b} / ${b}) + (${b} >> ${b} / ${b}))`, `(${b} + ${b})`]);
      // 设置特殊表达式
      if (b !== 1) this.digitExpressions.set(1, [`(${b} / ${b})`, `(${b} % (${b} + ${b}))`]);
      if (b !== 2) this.digitExpressions.set(2, [`(${b} >> (${b} / ${b})`, `(${b} & ${b})`]);
      if (b !== 3) this.digitExpressions.set(3, [`(${b} / (${b} / ${b} << ${b} / ${b}))`, `(${b} - (${b} / ${b}))`]);
      if (b !== 4) this.digitExpressions.set(4, [`(${b} & (${b} | (${b} / ${b})))`, `(${b} - (${b} / ${b}) + ${b})`]);
      if (b !== 5) this.digitExpressions.set(5, [`(${b} - ${b} / ${b})`, `(${b} + (${b} / ${b} << ${b}))`]);
      if (b !== 6) this.digitExpressions.set(6, [`(${b} + (${b} / ${b} >> ${b} / ${b}))`, `(${b} + (${b} & ${b}))`]);
      if (b !== 7) this.digitExpressions.set(7, [`(${b} + ${b} / ${b})`, `(${b} + ${b} - (${b} / ${b}))`]);
      if (b !== 8) this.digitExpressions.set(8, [`(${b} + ${b} / ${b} << ${b} / ${b})`, `(${b} | (${b} & ${b}))`]);
      if (b !== 9) this.digitExpressions.set(9, [`(${b} | (${b} >> ${b} / ${b}))`, `(${b} + ${b} - ${b} / ${b})`]);
      this.expressionsInitialized = true;
    }
    const expressions = this.digitExpressions.get(n);
    return expressions ? expressions[Math.floor(Math.random() * expressions.length)] : String(n);
  }

  /**
   * 生成十进制表达式
   * @param {number} target - 目标数字
   * @param {number} baseNumber - 基础数字
   * @returns {string} 生成的表达式
   */
  generateDecimalExpression(target: number, baseNumber: number): string {
    if (target <= 10) return this.getDigitExpr(target, baseNumber)
    const cachedExpressions = this.digitExpressions.get(target);
    if (cachedExpressions && cachedExpressions.length > 0 && Math.random() > 0.3) {
      return cachedExpressions[Math.floor(Math.random() * cachedExpressions.length)];
    }
    let expr: string;
    if (target === 100) {
      expr = `(${this.getDigitExpr(10, baseNumber)} * ${this.getDigitExpr(10, baseNumber)})`;
    } else {
      const tens = Math.floor(target / 10);
      const ones = target % 10;
      // 增加随机性：随机选择策略
      const strategy = Math.floor(Math.random() * 3);
      if (strategy === 0 && target <= 20) {
        expr = `(${this.getDigitExpr(10, baseNumber)} + ${this.getDigitExpr(ones, baseNumber)})`;
      } else if (strategy === 1 && ones === 0) {
        expr = `(${this.getDigitExpr(tens, baseNumber)} * ${this.getDigitExpr(10, baseNumber)})`;
      } else if (strategy === 2 && target <= 50) {
        expr = `((${this.getDigitExpr(tens, baseNumber)} * ${this.getDigitExpr(10, baseNumber)}) + ${this.getDigitExpr(ones, baseNumber)})`;
      } else {
        const nearestTen = tens * 10;
        if (Math.random() > 0.5 && ones <= 5) {
          expr = `(${this.generateDecimalExpression(nearestTen, baseNumber)} + ${this.getDigitExpr(ones, baseNumber)})`;
        } else {
          const nextTen = (tens + 1) * 10;
          expr = `(${this.generateDecimalExpression(nextTen, baseNumber)} - ${this.getDigitExpr(10 - ones, baseNumber)})`;
        }
      }
    }
    // 存储生成的表达式
    if (!cachedExpressions) {
      this.digitExpressions.set(target, [expr]);
    } else if (cachedExpressions.length < 3) {
      cachedExpressions.push(expr);
    }
    return expr;
  }

  /**
   * 生成质因数分解表达式
   * @param {number} target - 目标数字
   * @param {number} baseNumber - 基础数字
   * @returns {string} 生成的表达式
   */
  generatePrimeFactorsExpression(target: number, baseNumber: number): string {
    if (target <= 10) return this.getDigitExpr(target, baseNumber);
    const expr = this.digitExpressions.get(target);
    if (expr) return expr[Math.floor(Math.random() * expr.length)];
    if (target === 100) return `(${this.getDigitExpr(10, baseNumber)} * ${this.getDigitExpr(10, baseNumber)})`;
    // 递归分解函数
    const decompose = (num: number): string => {
      if (num <= 10) return this.getDigitExpr(num, baseNumber);
      const predefinedExpr = this.digitExpressions.get(num);
      if (predefinedExpr) return predefinedExpr[Math.floor(Math.random() * predefinedExpr.length)];
      // 尝试因式分解
      for (let i = Math.min(9, Math.floor(Math.sqrt(num))); i >= 2; i--) {
        if (num % i === 0) {
          const quotient = num / i;
          if (quotient <= 10) {
            return `(${this.getDigitExpr(i, baseNumber)} * ${this.getDigitExpr(quotient, baseNumber)})`;
          }
          return `(${this.getDigitExpr(i, baseNumber)} * ${decompose(quotient)})`;
        }
      }
      // 无法分解时使用加减法
      const base = Math.floor(num / 10) * 10;
      const diff = num - base;
      if (diff === 0) {
        return decompose(num / 10) + ` * ${this.getDigitExpr(10, baseNumber)}`;
      }
      return diff > 0
        ? `(${decompose(base)} + ${this.getDigitExpr(diff, baseNumber)})`
        : `(${decompose(base)} - ${this.getDigitExpr(-diff, baseNumber)})`;
    };
    return decompose(target);
  }

  /**
   * 生成混合运算表达式
   * @param {number} target - 目标数字
   * @param {number} baseNumber - 基础数字
   * @returns {string} 生成的表达式
   */
  generateMixedOperationsExpression(target: number, baseNumber: number): string {
    if (target <= 10) return this.getDigitExpr(target, baseNumber);
    const cached = this.digitExpressions.get(target);
    if (cached && cached.length > 0 && Math.random() > 0.3) {
      return cached[Math.floor(Math.random() * cached.length)];
    }
    const b = this.getDigitExpr(baseNumber, baseNumber);
    let expr = '';
    if (target === 0) {
      expr = `(${b} - ${b})`;
    } else if (target === 100) {
      expr = `(${b} * ${this.generateMixedOperationsExpression(Math.floor(100/baseNumber), baseNumber)})`;
    } else {
      const strategies = [
        () => {
          const base = Math.floor(target / 10) * 10;
          const diff = target - base;
          return diff >= 0
            ? `(${this.generateMixedOperationsExpression(base, baseNumber)} + ${this.getDigitExpr(diff, baseNumber)})`
            : `(${this.generateMixedOperationsExpression(base, baseNumber)} - ${this.getDigitExpr(-diff, baseNumber)})`;
        },
        () => {
          // 找到最接近的能被基数整除的数
          const quotient = Math.floor(target / baseNumber);
          const remainder = target % baseNumber;
          if (remainder === 0) {
            // 能整除的情况
            return `(${b} * ${this.generateMixedOperationsExpression(quotient, baseNumber)})`;
          } else if (remainder <= baseNumber / 2) {
            // 余数较小时，使用加法
            return `((${b} * ${this.generateMixedOperationsExpression(quotient, baseNumber)}) + ${this.getDigitExpr(remainder, baseNumber)})`;
          } else {
            // 余数较大时，使用减法（向上取整）
            return `((${b} * ${this.generateMixedOperationsExpression(quotient + 1, baseNumber)}) - ${this.getDigitExpr(baseNumber - remainder, baseNumber)})`;
          }
        },
        () => {
          const maxShift = Math.floor(Math.log2(target));
          const base = 1 << maxShift;
          const remainder = target - base;
          if (remainder === 0) {
            return `(${b} << ${this.getDigitExpr(maxShift, baseNumber)})`;
          } else if (remainder < 0) {
            // 如果目标值小于2的幂，使用减法
            return `((${b} << ${this.getDigitExpr(maxShift, baseNumber)}) - ${this.generateMixedOperationsExpression(-remainder, baseNumber)})`;
          } else {
            // 如果有余数，递归处理余数部分
            return `((${b} << ${this.getDigitExpr(maxShift, baseNumber)}) + ${this.generateMixedOperationsExpression(remainder, baseNumber)})`;
          }
        },
        () => {
          // 尝试找到最接近的可以简单表示的数
          for (let i = 1; i <= Math.min(10, target); i++) {
            if (target % i === 0) {
              const quotient = target / i;
              if (quotient <= 10) {
                return `(${this.getDigitExpr(i, baseNumber)} * ${this.getDigitExpr(quotient, baseNumber)})`;
              }
            }
          }
          // 如果找不到合适的因子，使用加减法
          const mid = Math.floor(target / 2);
          return `(${this.generateMixedOperationsExpression(mid, baseNumber)} + ${this.generateMixedOperationsExpression(target - mid, baseNumber)})`;
        }
      ];
      expr = strategies[Math.floor(Math.random() * strategies.length)]();
    }
    // 存储生成的表达式
    if (!cached) {
      this.digitExpressions.set(target, [expr]);
    } else if (cached.length < 3) {
      cached.push(expr);
    }
    return expr;
  }

  /**
   * 根据娱乐模式格式化分数显示
   * @param {number} score - 分数
   * @param {Date} date - 日期对象
   * @param {FoolConfig} foolConfig - 娱乐模式配置
   * @returns {string} 格式化后的分数
   */
  formatScore(score: number, date: Date, foolConfig: FoolConfig): string {
    try {
      const isValidFoolDate = () => {
        if (!foolConfig.date) return true
        const [month, day] = foolConfig.date.split('-').map(Number)
        return date.getMonth() + 1 === month && date.getDate() === day
      }
      if (foolConfig.type !== FoolMode.ENABLED || !isValidFoolDate()) {
        return score.toString()
      }
      // 每次生成表达式前清除缓存，确保随机性
      this.digitExpressions.clear();
      this.expressionsInitialized = false;
      this.expressionsInitialized = true;
      switch (foolConfig.displayType) {
        case DisplayMode.BINARY:
          return score.toString(2)
        case DisplayMode.EXPRESSION:
          const baseNumber = foolConfig.baseNumber ?? 6
          const rand = Math.random()
          if (rand < 0.33) {
            return this.generateDecimalExpression(score, baseNumber)
          } else if (rand < 0.66) {
            return this.generatePrimeFactorsExpression(score, baseNumber)
          } else {
            return this.generateMixedOperationsExpression(score, baseNumber)
          }
        default:
          return score.toString()
      }
    } catch (error) {
      console.error('Error formatting score:', error)
      return score.toString()
    }
  }
}
