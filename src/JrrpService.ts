import { JrrpAlgorithm, UserData } from '.'
import { JrrpCalculator, ExpressionGenerator } from './JrrpCalculator'
import { h } from 'koishi'
import * as fs from 'fs'
import * as path from 'path'

/**
 * JRRP服务管理类
 * @class JrrpService
 * @description 整合所有JRRP相关功能的统一服务类
 */
export class JrrpService {
  private dataPath: string
  private dataDir: string
  private userData: Record<string, UserData>
  private expressionGenerator: ExpressionGenerator
  private config: any

  /**
   * @constructor
   * @param {string} baseDir - 基础目录路径
   * @param {any} config - 插件配置
   */
  constructor(baseDir: string, config: any) {
    this.dataDir = path.join(baseDir, 'data')
    this.dataPath = path.join(this.dataDir, 'jrrp.json')
    this.config = config
    this.expressionGenerator = new ExpressionGenerator()
    try {
      if (!fs.existsSync(this.dataPath)) {
        fs.writeFileSync(this.dataPath, JSON.stringify({}))
      }
      this.userData = this.loadData()
    } catch (error) {
      this.userData = {}
      throw new Error(`Failed to ensure data file: ${error.message}`)
    }
  }

  /**
   * 加载JSON数据
   * @returns {Record<string, UserData>} 用户数据记录
   */
  private loadData(): Record<string, UserData> {
    try {
      const data = fs.readFileSync(this.dataPath, 'utf8')
      return JSON.parse(data)
    } catch (error) {
      return
    }
  }

  /**
   * 保存用户数据到JSON文件
   */
  private saveData(): void {
    try {
      fs.writeFileSync(this.dataPath, JSON.stringify(this.userData, null, 2))
    } catch (error) {
      throw new Error(`Failed to save data: ${error.message}`)
    }
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
      if (!/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(formattedCode)) {
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

  /**
   * 获取用户的Random.org分数
   * @param {string} userId - 用户ID
   * @param {string} [userName] - 用户名称
   * @returns {Promise<number>} 随机分数
   */
  private async getRandomOrgScore(userId: string, userName?: string): Promise<number> {
    // 检查用户是否已有今天的分数和时间戳
    if (this.userData[userId]?.randomScore !== undefined &&
        this.userData[userId]?.timestamp) {
      const date = new Date(this.userData[userId].timestamp);
      const today = new Date();
      if (date.getDate() === today.getDate() &&
          date.getMonth() === today.getMonth() &&
          date.getFullYear() === today.getFullYear()) {
        return this.userData[userId].randomScore;
      }
    }
    // 请求新的随机数
    const randomScore = await JrrpCalculator.getRandomOrgScore(this.config.randomOrgApi);
    // 后备基础算法
    const score = randomScore !== null ? randomScore :
      JrrpCalculator.calculateScoreWithAlgorithm(`${userId}-${new Date().toISOString().split('T')[0]}`, new Date(), JrrpAlgorithm.BASIC);
    // 保存分数和时间戳
    this.recordUserScore(userId, score, userName);
    return score;
  }

  /**
   * 记录用户的JRRP分数
   * @param {string} userId - 用户ID
   * @param {number} score - JRRP分数
   * @param {string} [name] - 用户名称
   */
  recordUserScore(userId: string, score: number, name?: string): void {
    if (!this.userData[userId]) {
      this.userData[userId] = {
        perfect_score: false,
        randomScore: score,
        timestamp: new Date().toISOString(),
        name: name || userId
      };
    } else {
      this.userData[userId].randomScore = score;
      this.userData[userId].timestamp = new Date().toISOString();
      // 更新名字
      if (name) this.userData[userId].name = name;
    }
    this.saveData();
  }

  /**
   * 获取今日JRRP排行榜
   * @returns {Array<{userId: string, score: number, name: string}>} 排行榜数据
   */
  getTodayRanking(): Array<{userId: string, score: number, name: string}> {
    const todayRanks = Object.entries(this.userData)
      .filter(([_, data]) => {
        if (!data.timestamp || data.randomScore === undefined) return false;
        const date = new Date(data.timestamp);
        const today = new Date();
        return date.getDate() === today.getDate() &&
               date.getMonth() === today.getMonth() &&
               date.getFullYear() === today.getFullYear();
      })
      .map(([userId, data]) => ({
        userId,
        score: data.randomScore,
        name: data.name || userId
      }))
      .sort((a, b) => b.score - a.score);
    return todayRanks;
  }

  /**
   * 获取用户在今日JRRP中的排名
   * @param {string} userId - 用户ID
   * @returns {number} 排名，如果未查询过则返回-1
   */
  getUserRank(userId: string): number {
    const todayRanks = this.getTodayRanking();
    const userIndex = todayRanks.findIndex(item => item.userId === userId);
    return userIndex !== -1 ? userIndex + 1 : -1;
  }

  /**
   * 获取适用于用户分数的消息
   * @param {number} score - 用户分数
   * @param {string} monthDay - 月日字符串 (MM-DD)
   * @param {any} session - 会话上下文
   * @returns {string} 消息文本
   */
  getScoreMessage(score: number, monthDay: string, session: any): string {
    let message = ''
    // 检查特殊分数
    if (this.config.number?.[score]) {
      message = session.text(this.config.number[score])
    } else {
      // 检查分数区间
      for (const [range, msgKey] of Object.entries(this.config.range || {})) {
        const [min, max] = range.split('-').map(Number)
        if (score >= min && score <= max) {
          message = session.text(msgKey)
          break
        }
      }
    }
    // 添加节日消息
    if (this.config.date?.[monthDay]) {
      message += '\n' + session.text(this.config.date[monthDay])
    }
    return message
  }

  /**
   * 格式化JRRP结果消息
   * @param {any} session - 会话上下文
   * @param {Date} dateForCalculation - 计算用的日期
   * @param {boolean} skipConfirm - 是否跳过零分确认
   * @param {boolean} isDateCommand - 是否是通过date子命令调用的
   * @returns {Promise<string|null>} 格式化后的消息文本
   */
  async formatJrrpMessage(
    session: any,
    dateForCalculation: Date,
    skipConfirm = false,
    isDateCommand = false
  ): Promise<string | null> {
    try {
      const monthDay = `${String(dateForCalculation.getMonth() + 1).padStart(2, '0')}-${String(dateForCalculation.getDate()).padStart(2, '0')}`
      let userFortune: number;
      // 需启用识别码模式
      const calCode = this.config.calCode ? this.userData[session.userId]?.identification_code : null;
      const isToday = dateForCalculation.toDateString() === new Date().toDateString();
      // 获取用户名
      let userName;
      try {
        const userInfo = await session.bot.getUser(session.userId);
        userName = userInfo?.name;
      } catch (e) {
        userName = null;
      }
      // 根据不同算法和条件计算分数
      if (this.config.algorithm === JrrpAlgorithm.RANDOM_ORG) {
        // 真随机算法模式
        if (calCode && this.config.calCode) {
          // 有识别码
          if (isToday && !isDateCommand) {
            // 今日人品：使用真随机 API
            userFortune = await this.getRandomOrgScore(session.userId, userName);
          } else if (isToday && isDateCommand) {
            // 当天：使用识别码算法
            userFortune = JrrpCalculator.calculateJrrpWithCode(
              calCode,
              dateForCalculation,
              this.config.calCode
            );
          } else {
            // 其他日期：使用识别码算法
            userFortune = JrrpCalculator.calculateJrrpWithCode(
              calCode,
              dateForCalculation,
              this.config.calCode
            );
          }
        } else {
          // 无识别码
          if (isToday) {
            // 当天：使用真随机 API
            userFortune = await this.getRandomOrgScore(session.userId, userName);
          } else {
            // 非当天：发送提示信息
            const message = await session.send(h('at', { id: session.userId }) +
              session.text('commands.jrrp.messages.random_org_only_today'));
            await JrrpService.autoRecall(session, message);
            return
          }
        }
      } else {
        // 基础算法模式
        if (calCode && this.config.calCode) {
          // 有识别码：使用识别码算法
          userFortune = JrrpCalculator.calculateJrrpWithCode(
            calCode,
            dateForCalculation,
            this.config.calCode
          );
        } else {
          // 无识别码：使用相应基础算法
          const userDateSeed = `${session.userId}-${dateForCalculation.getFullYear()}-${monthDay}`;
          userFortune = JrrpCalculator.calculateScoreWithAlgorithm(
            userDateSeed,
            dateForCalculation,
            this.config.algorithm,
            null,
            this.config.calCode
          );
        }
      }
      // 零分确认检查 - 需启用识别码模式
      if (!skipConfirm && userFortune === 0 && calCode && this.config.calCode) {
        return null;
      }
      // 格式化分数
      const foolConfig = {
        type: this.config.displayMode,
        date: this.config.displayDate,
        displayType: this.config.displayType,
        baseNumber: this.config.baseNumber
      }
      // 格式化分数显示
      const formattedFortune = this.expressionGenerator.formatScore(userFortune, dateForCalculation, foolConfig)
      let fortuneResultText = h('at', { id: session.userId }) +
        `${session.text('commands.jrrp.messages.result', [formattedFortune])}`
      // 添加额外消息
      if (calCode && userFortune === 100 && !this.userData[session.userId]?.perfect_score) {
        await this.markPerfectScore(session.userId)
        fortuneResultText += session.text(this.config.number[userFortune]) +
          '\n' + session.text('commands.jrrp.messages.identification_mode.perfect_score_first')
      } else {
        fortuneResultText += this.getScoreMessage(userFortune, monthDay, session)
      }
      return fortuneResultText
    } catch (error) {
      return session.text('commands.jrrp.messages.error')
    }
  }

  /**
   * 处理零分确认
   * @param {any} session - 会话上下文
   * @param {Date} dateForCalculation - 计算用的日期
   * @returns {Promise<string|null>} 处理后的结果消息
   */
  async handleZeroConfirmation(session: any, dateForCalculation: Date): Promise<string|null> {
    await session.send(session.text('commands.jrrp.messages.identification_mode.zero_prompt'))
    try {
      const response = await session.prompt(10000)
      if (!response || response.toLowerCase() !== 'y') {
        const message = await session.send(session.text('commands.jrrp.messages.cancel'))
        await JrrpService.autoRecall(session, message)
        return null
      }
      return await this.formatJrrpMessage(session, dateForCalculation, true)
    } catch (error) {
      return session.text('commands.jrrp.messages.error')
    }
  }

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
   * @param {Record<string, string>} range - 区间消息配置
   * @throws {Error} 当配置无效时抛出错误
   */
  static validateRangeMessages(range: Record<string, string>): void {
    const rangeIntervals: [number, number][] = [];
    for (const rangeKey of Object.keys(range)) {
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
      } catch (error) {}
    }, delay)
  }
}