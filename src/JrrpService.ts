import { h } from 'koishi'
import { DisplayMode, FoolConfig, FoolMode, JrrpAlgorithm, ExpressionType, UserData } from './index'
import { expressions } from './expressions'
import * as fs from 'fs'
import * as path from 'path'

/**
 * RandomOrg API响应接口
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
 * 今日人品服务类
 */
export class JrrpService {
  private dataPath: string
  private dataDir: string
  private userData: Record<string, UserData>
  private config: any

  /**
   * 构造函数
   * @param baseDir 基础目录
   * @param config 配置信息
   */
  constructor(baseDir: string, config: any) {
    this.dataDir = path.join(baseDir, 'data')
    this.dataPath = path.join(this.dataDir, 'jrrp.json')
    this.config = config
    try {
      if (!fs.existsSync(this.dataPath)) {
        fs.writeFileSync(this.dataPath, JSON.stringify({}))
      }
      try {
        this.userData = JSON.parse(fs.readFileSync(this.dataPath, 'utf8') || '{}')
      } catch (error) {
        this.userData = {}
      }
    } catch (error) {
      this.userData = {}
      throw new Error(`Failed to ensure data file: ${error.message}`)
    }
  }

  /**
   * 保存用户数据到文件
   * @throws 保存失败时抛出错误
   */
  private saveData(): void {
    try {
      fs.writeFileSync(this.dataPath, JSON.stringify(this.userData, null, 2))
    } catch (error) {
      throw new Error(`Failed to save data: ${error.message}`)
    }
  }

  /**
   * 检查时间戳是否过期
   * @param timestamp 时间戳
   * @returns 是否过期
   */
  private isExpired(timestamp: string): boolean {
    if (!timestamp) return true
    const today = new Date().toLocaleDateString('en-CA')
    return new Date(timestamp).toLocaleDateString('en-CA') !== today
  }

  /**
   * 清理用户数据，只保留必要字段
   * @param userId 用户ID
   * @returns 是否需要保存
   */
  private cleanUserData(userId: string): boolean {
    const userData = this.userData[userId];
    if (!userData) return false;
    const { identification_code, perfect_score } = userData;
    if (!identification_code && !perfect_score) {
      delete this.userData[userId];
      return true;
    }
    this.userData[userId] = {
      ...(identification_code && { identification_code }),
      ...(perfect_score && { perfect_score })
    };
    return true;
  }

  /**
   * 绑定用户识别码
   * @param userId 用户ID
   * @param code 识别码
   * @returns 绑定是否成功
   */
  async bindIdentificationCode(userId: string, code: string): Promise<boolean> {
    try {
      if (!code?.trim()) return false
      const formattedCode = code.trim().toUpperCase()
      if (!/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(formattedCode)) {
        return false
      }
      this.userData[userId] = {
        ...this.userData[userId] || {},
        identification_code: formattedCode
      }
      this.saveData()
      return true
    } catch (error) {
      return false
    }
  }

  /**
   * 移除用户识别码
   * @param userId 用户ID
   */
  async removeIdentificationCode(userId: string): Promise<void> {
    if (this.userData[userId]?.identification_code) {
      delete this.userData[userId].identification_code
      if (this.cleanUserData(userId)) {
        this.saveData()
      }
    }
  }

  /**
   * 记录用户分数
   * @param userId 用户ID
   * @param score 分数
   * @param name 用户名称
   * @param algorithm 使用的算法
   */
  recordUserScore(userId: string, score: number, name?: string, algorithm?: string): void {
    // 清理过期数据
    if (this.userData[userId]?.timestamp && this.isExpired(this.userData[userId].timestamp)) {
      let hasChanges = false;
      for (const uid in this.userData) {
        if (this.userData[uid].timestamp && this.isExpired(this.userData[uid].timestamp)) {
          hasChanges = this.cleanUserData(uid) || hasChanges;
        }
      }
      if (hasChanges) this.saveData();
    }
    // 记录新分数
    this.userData[userId] = {
      ...this.userData[userId] || {},
      randomScore: score,
      timestamp: new Date().toISOString(),
      ...(name && { name }),
      ...(algorithm && { algorithm })
    }
    this.saveData()
  }

  /**
   * 获取今日排名列表
   * @returns 排名数组
   */
  getTodayRanking(): Array<{userId: string, score: number, name: string}> {
    return Object.entries(this.userData)
      .filter(([_, data]) => data.timestamp && data.randomScore !== undefined && !this.isExpired(data.timestamp))
      .map(([userId, data]) => ({
        userId,
        score: data.randomScore,
        name: data.name || userId
      })).sort((a, b) => b.score - a.score)
  }

  /**
   * 获取用户排名
   * @param userId 用户ID
   * @returns 用户排名，-1表示未找到
   */
  getUserRank(userId: string): number {
    const userIndex = this.getTodayRanking().findIndex(item => item.userId === userId)
    return userIndex !== -1 ? userIndex + 1 : -1
  }

  /**
   * 格式化今日人品消息
   * @param session 会话对象
   * @param dateForCalculation 计算日期
   * @param skipConfirm 是否跳过确认
   * @param isDateCommand 是否是日期命令
   * @returns 消息内容、分数和算法
   */
  async formatJrrpMessage(
    session: any,
    dateForCalculation: Date,
    skipConfirm = false,
    isDateCommand = false
  ): Promise<{ message: string | null, score: number, algorithm?: string }> {
    try {
      const monthDay = `${String(dateForCalculation.getMonth() + 1).padStart(2, '0')}-${String(dateForCalculation.getDate()).padStart(2, '0')}`
      const calCode = this.config.calCode ? this.userData[session.userId]?.identification_code : null
      const isCurrentDay = dateForCalculation.toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA')
      const todayDateStr = dateForCalculation.toLocaleDateString('en-CA')
      const hasCode = calCode && this.config.calCode
      const getRandomOrgScoreLocal = async (): Promise<number> => {
        const userData = this.userData[session.userId];
        if (userData?.randomScore !== undefined &&
            userData?.timestamp &&
            userData?.algorithm === JrrpAlgorithm.RANDOMORG &&
            !this.isExpired(userData.timestamp)) {
          return userData.randomScore;
        }
        const randomOrgScore = await JrrpService.getRandomOrgScoreStatic(this.config.randomOrgApi);
        return randomOrgScore !== null ? randomOrgScore :
          JrrpService.calculateScoreWithAlgorithm(
            `${session.userId}-${new Date().toLocaleDateString('en-CA')}`,
            new Date(),
            JrrpAlgorithm.BASIC
          );
      };
      let fortuneResult: {score: number, algorithm: string} | null = null;
      // 根据算法和条件确定分数
      if (this.config.algorithm === JrrpAlgorithm.RANDOMORG) {
        if (hasCode) {
          if (isCurrentDay && !isDateCommand) {
            const score = await getRandomOrgScoreLocal();
            fortuneResult = { score, algorithm: JrrpAlgorithm.RANDOMORG };
          } else {
            const score = JrrpService.calculateJrrpWithCode(calCode, dateForCalculation, this.config.calCode)
            fortuneResult = { score, algorithm: 'calCode' }
          }
        } else if (isCurrentDay && !isDateCommand) {
          const score = await getRandomOrgScoreLocal();
          fortuneResult = { score, algorithm: JrrpAlgorithm.RANDOMORG };
        }
      } else {
        if (hasCode) {
          const score = JrrpService.calculateJrrpWithCode(calCode, dateForCalculation, this.config.calCode)
          fortuneResult = { score, algorithm: 'calCode' }
        } else {
          const userDateSeed = `${session.userId}-${todayDateStr}`
          const score = JrrpService.calculateScoreWithAlgorithm(
            userDateSeed, dateForCalculation, this.config.algorithm
          )
          fortuneResult = { score, algorithm: this.config.algorithm }
        }
      }
      if (!fortuneResult) {
        const message = await session.send(h('at', { id: session.userId }) +
          session.text('commands.jrrp.messages.random_org_only_today'))
        await JrrpService.autoRecall(session, message)
        return { message: null, score: -1 }
      }
      const { score: userFortune, algorithm: usedAlgorithm } = fortuneResult
      // 零分确认处理
      if (!skipConfirm && userFortune === 0 && calCode && this.config.calCode) {
        return { message: null, score: 0, algorithm: usedAlgorithm }
      }
      // 格式化分数
      const foolConfig = {
        type: this.config.displayMode,
        date: this.config.displayDate,
        displayType: this.config.displayType,
        expressionType: this.config.expressionType
      }
      const formattedFortune = JrrpService.formatScore(userFortune, dateForCalculation, foolConfig)
      // 构建消息
      const messageParts = [
        h('at', { id: session.userId }),
        session.text('commands.jrrp.messages.result', [formattedFortune])
      ]
      // 处理满分情况
      if (calCode && userFortune === 100 && !this.userData[session.userId]?.perfect_score) {
        this.userData[session.userId] = {
          ...this.userData[session.userId] || {},
          perfect_score: true
        }
        this.saveData()
        messageParts.push(
          session.text(this.config.number[userFortune]),
          session.text('commands.jrrp.messages.identification_mode.perfect_score_first')
        )
      } else {
        // 根据分数获取对应文本
        let scoreMessage: string;
        if (this.config.number?.[userFortune]) {
          scoreMessage = session.text(this.config.number[userFortune]) +
            (this.config.date?.[monthDay] ? '\n' + session.text(this.config.date[monthDay]) : '');
        } else {
          let rangeMessage = '';
          for (const [range, msgKey] of Object.entries(this.config.range || {})) {
            const [min, max] = range.split('-').map(Number);
            if (userFortune >= min && userFortune <= max) {
              rangeMessage = session.text(msgKey);
              break;
            }
          }
          scoreMessage = rangeMessage +
            (this.config.date?.[monthDay] ? '\n' + session.text(this.config.date[monthDay]) : '');
        }
        messageParts.push(scoreMessage);
      }
      return {
        message: messageParts.join(''),
        score: userFortune,
        algorithm: usedAlgorithm
      }
    } catch (error) {
      return { message: session.text('commands.jrrp.messages.error'), score: -1 }
    }
  }

  /**
   * 处理零分确认
   * @param session 会话对象
   * @param dateForCalculation 计算日期
   * @returns 处理结果
   */
  async handleZeroConfirmation(session: any, dateForCalculation: Date): Promise<{ message: string | null, score: number, algorithm?: string }> {
    await session.send(session.text('commands.jrrp.messages.identification_mode.zero_prompt'))
    try {
      const response = await session.prompt(10000)
      if (!response || response.toLowerCase() !== 'y') {
        const message = await session.send(session.text('commands.jrrp.messages.cancel'))
        await JrrpService.autoRecall(session, message)
        return { message: null, score: -1 }
      }
      return await this.formatJrrpMessage(session, dateForCalculation, true)
    } catch (error) {
      return { message: session.text('commands.jrrp.messages.error'), score: -1 }
    }
  }

  /**
   * 计算字符串哈希值
   * @param str 输入字符串
   * @returns 哈希值
   */
  static hashCode(str: string): number {
    let hash = 5381
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i)
      hash = hash >>> 0
    }
    return hash
  }

  /**
   * 解析日期字符串
   * @param dateStr 日期字符串
   * @param defaultDate 默认日期
   * @returns 解析后的日期或null
   */
  static parseDate(dateStr: string, defaultDate: Date): Date | null {
    if (!dateStr?.trim()) return null
    const normalized = dateStr.trim().replace(/[\s.\/]/g, '-').replace(/-+/g, '-')
    const fullDateRegex = /^(\d{1,4})-(\d{1,2})-(\d{1,2})$/
    const shortDateRegex = /^(\d{1,2})-(\d{1,2})$/
    let year, month, day;
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
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    const date = new Date(year, month - 1, day)
    return (date.getFullYear() === year &&
            date.getMonth() === month - 1 &&
            date.getDate() === day) ? date : null
  }

  /**
   * 验证范围消息配置
   * @param range 范围消息配置
   * @throws 配置无效时抛出错误
   */
  static validateRangeMessages(range: Record<string, string>): void {
    const rangeIntervals: [number, number][] = []
    for (const rangeKey of Object.keys(range)) {
      const [start, end] = rangeKey.split('-').map(Number)
      if (isNaN(start) || isNaN(end) || start > end || start < 0 || end > 100) {
        throw new Error(`Invalid range format: ${rangeKey}`)
      }
      rangeIntervals.push([start, end])
    }
    rangeIntervals.sort((a, b) => a[0] - b[0])
    if (rangeIntervals[0][0] !== 0 || rangeIntervals[rangeIntervals.length - 1][1] !== 100) {
      throw new Error('Ranges must completely cover 0 to 100')
    }
    for (let i = 1; i < rangeIntervals.length; i++) {
      if (rangeIntervals[i][0] !== rangeIntervals[i-1][1] + 1) {
        throw new Error(`Overlap or gap between ranges ${rangeIntervals[i-1][1]} and ${rangeIntervals[i][0]}`)
      }
    }
  }

  /**
   * 自动撤回消息
   * @param session 会话对象
   * @param message 消息对象
   * @param delay 延迟时间(ms)
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
      } catch (error) {}
    }, delay)
  }

  /**
   * 使用识别码计算今日人品值
   * @param code 识别码
   * @param date 日期
   * @param password 密码
   * @returns 计算的分数
   */
  static calculateJrrpWithCode(code: string, date: Date, password: string): number {
    const year = date.getFullYear();
    const day = date.getDate();
    const start = new Date(year, 0, 0);
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const getHash = (str: string): bigint => {
      let hash = BigInt(5381)
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << BigInt(5)) ^ hash ^ BigInt(str.charCodeAt(i))) & ((BigInt(1) << BigInt(64)) - BigInt(1))
      }
      return hash ^ BigInt('0xa98f501bc684032f')
    };
    const hash1 = getHash(['asdfgbn', String(dayOfYear), '12#3$45', String(year), 'IUY'].join(''));
    const hash2 = getHash([password, code, '0*8&6', String(day), 'kjhg'].join(''));
    const divisorThree = BigInt(3);
    const mergedHash = (hash1 / divisorThree + hash2 / divisorThree);
    const normalizedHash = Math.abs(Number(mergedHash) / 527.0);
    const randomValue = Math.round(normalizedHash) % 1001;
    return randomValue >= 970 ? 100 : Math.round((randomValue / 969.0) * 99.0);
  }

  /**
   * 从Random.org获取随机分数
   * @param apiKey API密钥
   * @returns 随机分数或null
   */
  static async getRandomOrgScoreStatic(apiKey: string): Promise<number|null> {
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
   * 使用指定算法计算分数
   * @param userDateSeed 用户日期种子
   * @param date 日期
   * @param algorithm 算法类型
   * @param Code 识别码
   * @param password 密码
   * @returns 计算的分数
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
   * 格式化分数显示
   * @param score 分数
   * @param date 日期
   * @param foolConfig 愚人节配置
   * @returns 格式化后的分数字符串
   */
  static formatScore(score: number, date: Date, foolConfig: FoolConfig): string {
    try {
      const monthDay = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const isValidFoolDate = !foolConfig.date || foolConfig.date === monthDay;
      if (foolConfig.type !== FoolMode.ENABLED || !isValidFoolDate) {
        return score.toString();
      }
      if (foolConfig.displayType === DisplayMode.BINARY) {
        return score.toString(2);
      }
      if (foolConfig.displayType === DisplayMode.EXPRESSION) {
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
      return score.toString();
    } catch (error) {
      return score.toString();
    }
  }
}