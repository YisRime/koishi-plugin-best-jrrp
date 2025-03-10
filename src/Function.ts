/**
 * @file JRRP功能类库
 * @description 包含文件管理、JRRP计算、表达式生成、用户管理等核心功能类
 */
import { DisplayMode, FoolConfig, FoolMode, UserData } from '.'
import * as fs from 'fs'
import * as path from 'path'

/**
 * 文件管理器类
 * @class FileManager
 * @description 处理插件数据的持久化存储
 */
export class FileManager {
  private dataPath: string
  private dataDir: string

  /**
   * @constructor
   * @param {string} baseDir - 基础目录路径
   */
  constructor(baseDir: string) {
    this.dataDir = path.join(baseDir, 'data')
    this.dataPath = path.join(this.dataDir, 'jrrp.json')
    try {
      if (!fs.existsSync(this.dataPath)) {
        fs.writeFileSync(this.dataPath, JSON.stringify({}))
      }
    } catch (error) {
      throw new Error(`Failed to ensure data file: ${error.message}`)
    }
  }

  /**
   * 加载JSON数据
   * @returns {Record<string, UserData>} 用户数据记录
   */
  loadData(): Record<string, UserData> {
    try {
      const data = fs.readFileSync(this.dataPath, 'utf8')
      return JSON.parse(data)
    } catch (error) {
      console.error('Failed to load data:', error)
      return {}
    }
  }

  /**
   * 保存用户数据到JSON文件
   * @param {Record<string, UserData>} data - 要保存的用户数据
   */
  saveData(data: Record<string, UserData>): void {
    try {
      fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2))
    } catch (error) {
      throw new Error(`Failed to save data: ${error.message}`)
    }
  }

  /**
   * 获取数据文件路径
   * @returns {string} 数据文件的完整路径
   */
  getDataPath(): string {
    return this.dataPath
  }
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
}

/**
 * 表达式生成器类
 * @class ExpressionGenerator
 * @description 生成各种形式的数学表达式
 */
export class ExpressionGenerator {
  private digitExpressions = new Map<number, string>()
  private expressionsInitialized = false

  constructor() {
    this.initializeExpressions();
  }

  /**
   * 初始化表达式映射
   * @private
   */
  private initializeExpressions(): void {
    if (!this.expressionsInitialized) {
      this.expressionsInitialized = true;
    }
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
      this.digitExpressions.set(b, String(b));

      // 设置1-9的数字表达式
      for (let i = 1; i <= 9; i++) {
        if (i === b) continue;
        if (i <= 9) {
          this.digitExpressions.set(i, String(b === i ? b : i));
        }
      }

      this.digitExpressions.set(0, `(${b} ^ ${b})`);
      this.digitExpressions.set(10, `((${b} << ${b} / ${b}) + (${b} >> ${b} / ${b}))`);

      // 设置特殊表达式
      if (b !== 1) this.digitExpressions.set(1, `(${b} / ${b})`);
      if (b !== 2) this.digitExpressions.set(2, `(${b} >> (${b} / ${b})`);
      if (b !== 3) this.digitExpressions.set(3, `(${b} / (${b} / ${b} << ${b} / ${b}))`);
      if (b !== 4) this.digitExpressions.set(4, `(${b} & (${b} | (${b} / ${b})))`);
      if (b !== 5) this.digitExpressions.set(5, `(${b} - ${b} / ${b})`);
      if (b !== 6) this.digitExpressions.set(6, `(${b} + (${b} / ${b} >> ${b} / ${b}))`);
      if (b !== 7) this.digitExpressions.set(7, `(${b} + ${b} / ${b})`);
      if (b !== 8) this.digitExpressions.set(8, `(${b} + ${b} / ${b} << ${b} / ${b})`);
      if (b !== 9) this.digitExpressions.set(9, `(${b} | (${b} >> ${b} / ${b}))`);

      this.expressionsInitialized = true;
    }

    return this.digitExpressions.get(n) || String(n);
  }

  /**
   * 生成十进制表达式
   * @param {number} target - 目标数字
   * @param {number} baseNumber - 基础数字
   * @returns {string} 生成的表达式
   */
  generateDecimalExpression(target: number, baseNumber: number): string {
    if (target <= 10) return this.getDigitExpr(target, baseNumber)

    const cached = this.digitExpressions.get(target);
    if (cached) return cached;

    let expr: string;
    if (target === 100) {
      expr = `(${this.getDigitExpr(10, baseNumber)} * ${this.getDigitExpr(10, baseNumber)})`;
    } else {
      const tens = Math.floor(target / 10);
      const ones = target % 10;

      if (target <= 20) {
        expr = `(${this.getDigitExpr(10, baseNumber)} + ${this.getDigitExpr(ones, baseNumber)})`;
      } else if (ones === 0) {
        expr = `(${this.getDigitExpr(tens, baseNumber)} * ${this.getDigitExpr(10, baseNumber)})`;
      } else if (target <= 50) {
        expr = `((${this.getDigitExpr(tens, baseNumber)} * ${this.getDigitExpr(10, baseNumber)}) + ${this.getDigitExpr(ones, baseNumber)})`;
      } else {
        const nearestTen = tens * 10;
        if (ones <= 5) {
          expr = `(${this.generateDecimalExpression(nearestTen, baseNumber)} + ${this.getDigitExpr(ones, baseNumber)})`;
        } else {
          const nextTen = (tens + 1) * 10;
          expr = `(${this.generateDecimalExpression(nextTen, baseNumber)} - ${this.getDigitExpr(10 - ones, baseNumber)})`;
        }
      }
    }

    this.digitExpressions.set(target, expr);
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
    if (expr) return expr;
    if (target === 100) return `(${this.getDigitExpr(10, baseNumber)} * ${this.getDigitExpr(10, baseNumber)})`;
    // 递归分解函数
    const decompose = (num: number): string => {
      if (num <= 10) return this.getDigitExpr(num, baseNumber);
      const predefinedExpr = this.digitExpressions.get(num);
      if (predefinedExpr) return predefinedExpr;
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
    if (cached) return cached;

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

    this.digitExpressions.set(target, expr);
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

      switch (foolConfig.displayMode) {
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

/**
 * 用户管理器类
 * @class UserManager
 * @description 管理用户数据和识别码
 */
export class UserManager {
  private userData: Record<string, UserData>
  private fileManager: FileManager

  /**
   * @constructor
   * @param {FileManager} fileManager - 文件管理器实例
   */
  constructor(fileManager: FileManager) {
    this.fileManager = fileManager
    this.userData = this.fileManager.loadData()
  }

  private saveData(): void {
    this.fileManager.saveData(this.userData)
  }

  /**
   * 获取用户的识别码
   * @param {string} userId - 用户ID
   * @returns {Promise<string|undefined>} 用户的识别码，如果不存在则返回undefined
   */
  async getIdentificationCode(userId: string): Promise<string | undefined> {
    return this.userData[userId]?.identification_code
  }

  /**
   * 为用户绑定识别码
   * @param {string} userId - 用户ID
   * @param {string} code - 要绑定的识别码
   * @returns {Promise<boolean>} 绑定是否成功
   */
  async bindIdentificationCode(userId: string, code: string): Promise<boolean> {
    try {
      if (!code?.trim()) return false

      const formattedCode = code.trim().toUpperCase()
      if (!this.validateIdentificationCode(formattedCode)) {
        return false
      }

      if (!this.userData[userId]) {
        this.userData[userId] = {
          perfect_score: false,
          identification_code: formattedCode
        }
      } else {
        this.userData[userId].identification_code = formattedCode
      }

      this.saveData()
      return true
    } catch (error) {
      console.error('Failed to bind identification code:', error)
      return false
    }
  }

  /**
   * 移除用户的识别码
   * @param {string} userId - 用户ID
   */
  async removeIdentificationCode(userId: string): Promise<void> {
    if (this.userData[userId]) {
      delete this.userData[userId].identification_code
      this.saveData()
    }
  }

  /**
   * 验证识别码格式是否正确
   * @param {string} code - 要验证的识别码
   * @returns {boolean} 是否符合格式要求
   */
  validateIdentificationCode(code: string): boolean {
    return /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(code)
  }

  /**
   * 检查用户是否首次获得满分
   * @param {string} userId - 用户ID
   * @returns {Promise<boolean>} 是否是首次满分
   */
  async isPerfectScoreFirst(userId: string): Promise<boolean> {
    return !this.userData[userId]?.perfect_score
  }

  /**
   * 标记用户已获得过满分
   * @param {string} userId - 用户ID
   */
  async markPerfectScore(userId: string): Promise<void> {
    if (!this.userData[userId]) {
      this.userData[userId] = {
        perfect_score: true
      }
    } else {
      this.userData[userId].perfect_score = true
    }
    this.saveData()
  }
}

/**
 * JRRP工具类
 * @class JrrpUtils
 * @description 提供各种工具函数和静态方法
 */
export class JrrpUtils {
  /**
   * 计算字符串的哈希值
   * @param {string} str - 输入字符串
   * @returns {number} 哈希值
   */
  static hashCode(str: string): number {
    let hash = 5381;
    for (let i = 0; str.length > i; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash >>> 0;
    }
    return hash;
  }

  /**
   * 解析日期字符串，使用正则优化
   * @param {string} dateStr - 日期字符串，格式可以是 YYYY-MM-DD 或 MM-DD
   * @param {Date} defaultDate - 默认日期，用于补充年份
   * @returns {Date|null} 解析后的日期对象，解析失败返回null
   */
  static parseDate(dateStr: string, defaultDate: Date): Date | null {
    if (!dateStr?.trim()) return null

    const normalized = dateStr.trim().replace(/[\s.\/]/g, '-').replace(/-+/g, '-')
    const fullDateRegex = /^(\d{1,4})-(\d{1,2})-(\d{1,2})$/
    const shortDateRegex = /^(\d{1,2})-(\d{1,2})$/

    let year: number, month: number, day: number

    const fullDateMatch = normalized.match(fullDateRegex)
    const shortDateMatch = normalized.match(shortDateRegex)

    if (fullDateMatch) {
      year = parseInt(fullDateMatch[1], 10)
      month = parseInt(fullDateMatch[2], 10)
      day = parseInt(fullDateMatch[3], 10)

      if (year < 100) {
        const currentYear = defaultDate.getFullYear()
        const threshold = (currentYear % 100 + 20) % 100
        year = year > threshold ? 1900 + year : 2000 + year
      }
    } else if (shortDateMatch) {
      year = defaultDate.getFullYear()
      month = parseInt(shortDateMatch[1], 10)
      day = parseInt(shortDateMatch[2], 10)
    } else {
      return null
    }

    // 验证日期有效性
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null
    }

    const date = new Date(year, month - 1, day)
    return (date.getFullYear() === year &&
            date.getMonth() === month - 1 &&
            date.getDate() === day) ? date : null
  }

  /**
   * 验证区间消息配置的有效性
   * @param {Record<string, string>} rangeMessages - 区间消息配置
   * @throws {Error} 当配置无效时抛出错误
   */
  static validateRangeMessages(rangeMessages: Record<string, string>): void {
    const rangeIntervals: [number, number][] = [];

    for (const rangeKey of Object.keys(rangeMessages)) {
      const [start, end] = rangeKey.split('-').map(Number);
      if (isNaN(start) || isNaN(end) || start > end || start < 0 || end > 100) {
        throw new Error(`Invalid range format: ${rangeKey}`);
      }
      rangeIntervals.push([start, end]);
    }

    rangeIntervals.sort((a, b) => a[0] - b[0]);

    if (rangeIntervals[0][0] !== 0 || rangeIntervals[rangeIntervals.length - 1][1] !== 100) {
      throw new Error('Ranges must completely cover 0 to 100');
    }

    for (let i = 1; i < rangeIntervals.length; i++) {
      if (rangeIntervals[i][0] !== rangeIntervals[i-1][1] + 1) {
        throw new Error(`Overlap or gap between ranges ${rangeIntervals[i-1][1]} and ${rangeIntervals[i][0]}`);
      }
    }
  }

  /**
   * 自动撤回消息
   * @param {any} session - 会话上下文
   * @param {string|object|Array} message - 要撤回的消息或消息ID
   * @param {number} [delay=10000] - 延迟撤回时间(毫秒)
   */
  static async autoRecall(session: any, message: any, delay = 10000): Promise<void> {
    if (!message) return

    setTimeout(async () => {
      try {
        const messages = Array.isArray(message) ? message : [message]
        await Promise.all(messages.map(async msg => {
          const msgId = typeof msg === 'string' ? msg : msg?.id
          if (msgId && session.bot && session.channelId) {
            await session.bot.deleteMessage(session.channelId, msgId)
          }
        }))
      } catch (error) {
        console.warn('Failed to execute auto recall:', error)
      }
    }, delay)
  }

  /**
   * 格式化月日为MM-DD格式
   * @param {Date} date - 日期对象
   * @returns {string} 格式化后的月日字符串
   */
  static formatMonthDay(date: Date): string {
    return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
}
