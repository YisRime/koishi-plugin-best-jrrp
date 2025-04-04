import { h } from 'koishi'
import { JrrpAlgorithm, UserData } from './index'
import { JrrpCalculator } from './JrrpCalculator'
import * as fs from 'fs'
import * as path from 'path'

/**
 * JRRP服务管理类
 * @class JrrpService
 * @description 负责今日人品相关数据的存储、计算和管理
 */
export class JrrpService {
  private dataPath: string
  private dataDir: string
  private userData: Record<string, UserData>
  private config: any

  /**
   * 构造函数
   * @param baseDir 基础目录路径
   * @param config 插件配置
   * @throws 如果数据文件创建或读取失败
   */
  constructor(baseDir: string, config: any) {
    this.dataDir = path.join(baseDir, 'data')
    this.dataPath = path.join(this.dataDir, 'jrrp.json')
    this.config = config
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
   * 从文件加载用户数据
   * @private
   * @returns 用户数据对象
   */
  private loadData(): Record<string, UserData> {
    try {
      return JSON.parse(fs.readFileSync(this.dataPath, 'utf8') || '{}')
    } catch (error) {
      return {}
    }
  }

  /**
   * 保存用户数据到文件
   * @private
   * @throws 如果数据保存失败
   */
  private saveData(): void {
    try {
      fs.writeFileSync(this.dataPath, JSON.stringify(this.userData, null, 2))
    } catch (error) {
      throw new Error(`Failed to save data: ${error.message}`)
    }
  }

  /**
   * 检查分数是否已过期（不是当天）
   * @private
   * @param timestamp 时间戳
   * @returns 是否已过期
   */
  private isExpired(timestamp: string): boolean {
    if (!timestamp) return true
    const today = new Date().toLocaleDateString('en-CA')
    const timestampDate = new Date(timestamp).toLocaleDateString('en-CA')
    return timestampDate !== today
  }

  /**
   * 清理用户的非持久化数据
   * @private
   * @param userId 用户ID
   */
  private cleanupNonPersistentData(userId: string): void {
    const userData = this.userData[userId]
    if (!userData) return
    const { identification_code, perfect_score } = userData
    if (!identification_code && !perfect_score) {
      delete this.userData[userId]
    } else {
      this.userData[userId] = {
        ...(identification_code && { identification_code }),
        ...(perfect_score && { perfect_score })
      }
    }
  }

  /**
   * 清理所有过期记录
   * @private
   */
  private cleanupExpiredRecords(): void {
    let hasChanges = false
    for (const userId in this.userData) {
      if (this.userData[userId].timestamp && this.isExpired(this.userData[userId].timestamp)) {
        this.cleanupNonPersistentData(userId)
        hasChanges = true
      }
    }
    if (hasChanges) this.saveData()
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
      this.cleanupNonPersistentData(userId)
      this.saveData()
    }
  }

  /**
   * 标记用户获得满分
   * @param userId 用户ID
   */
  async markPerfectScore(userId: string): Promise<void> {
    this.userData[userId] = {
      ...this.userData[userId] || {},
      perfect_score: true
    }
    this.saveData()
  }

  /**
   * 获取Random.org真随机分数
   * @private
   * @param userId 用户ID
   * @returns 随机分数，如果API请求失败则返回基础算法的分数
   */
  private async getRandomOrgScore(userId: string): Promise<number> {
    const userData = this.userData[userId]
    // 检查用户是否已有今天的有效分数
    if (userData?.randomScore !== undefined &&
        userData?.timestamp &&
        userData?.algorithm === JrrpAlgorithm.RANDOMORG &&
        !this.isExpired(userData.timestamp)) {
      return userData.randomScore
    }
    // 请求新的随机数
    const randomScore = await JrrpCalculator.getRandomOrgScore(this.config.randomOrgApi)
    return randomScore !== null ? randomScore :
      JrrpCalculator.calculateScoreWithAlgorithm(
        `${userId}-${new Date().toLocaleDateString('en-CA')}`,
        new Date(),
        JrrpAlgorithm.BASIC
      )
  }

  /**
   * 记录用户的今日人品分数
   * @param userId 用户ID
   * @param score 分数
   * @param name 用户名
   * @param algorithm 使用的算法
   */
  recordUserScore(userId: string, score: number, name?: string, algorithm?: string): void {
    this.cleanupExpiredRecords()
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
   * @returns 排名数组，包含用户ID、分数和名称
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
   * 获取用户在今日排名中的位置
   * @param userId 用户ID
   * @returns 排名位置，如果用户不在排名中则返回-1
   */
  getUserRank(userId: string): number {
    const todayRanks = this.getTodayRanking()
    const userIndex = todayRanks.findIndex(item => item.userId === userId)
    return userIndex !== -1 ? userIndex + 1 : -1
  }

  /**
   * 获取分数对应的消息文本
   * @param score 分数
   * @param monthDay 月日格式字符串 (MM-DD)
   * @param session 会话对象
   * @returns 格式化后的消息文本
   */
  getScoreMessage(score: number, monthDay: string, session: any): string {
    // 检查特殊分数
    if (this.config.number?.[score]) {
      return session.text(this.config.number[score]) +
        (this.config.date?.[monthDay] ? '\n' + session.text(this.config.date[monthDay]) : '')
    }
    // 检查分数区间
    for (const [range, msgKey] of Object.entries(this.config.range || {})) {
      const [min, max] = range.split('-').map(Number)
      if (score >= min && score <= max) {
        return session.text(msgKey) +
          (this.config.date?.[monthDay] ? '\n' + session.text(this.config.date[monthDay]) : '')
      }
    }
    return this.config.date?.[monthDay] ? session.text(this.config.date[monthDay]) : ''
  }

  /**
   * 计算用户的运势分数
   * @private
   * @param userId 用户ID
   * @param date 日期
   * @param isToday 是否为当天
   * @param isDateCommand 是否为日期命令
   * @param calCode 计算用的识别码
   * @returns 计算结果对象，包含分数和使用的算法，如果无法计算则返回null
   */
  private async calculateUserFortune(
    userId: string,
    date: Date,
    isToday: boolean,
    isDateCommand: boolean,
    calCode: string
  ): Promise<{score: number, algorithm: string}|null> {
    const todayDateStr = date.toLocaleDateString('en-CA')
    const hasCode = calCode && this.config.calCode
    // 真随机算法模式
    if (this.config.algorithm === JrrpAlgorithm.RANDOMORG) {
      if (hasCode) {
        // 有识别码：今日使用真随机，其他日期使用识别码算法
        if (isToday && !isDateCommand) {
          const score = await this.getRandomOrgScore(userId)
          return { score, algorithm: JrrpAlgorithm.RANDOMORG }
        } else {
          const score = JrrpCalculator.calculateJrrpWithCode(calCode, date, this.config.calCode)
          return { score, algorithm: 'calCode' }
        }
      } else {
        // 无识别码：只能查当天
        if (isToday && !isDateCommand) {
          const score = await this.getRandomOrgScore(userId)
          return { score, algorithm: JrrpAlgorithm.RANDOMORG }
        }
        return null
      }
    } else {
      // 基础算法模式
      if (hasCode) {
        // 有识别码：使用识别码算法
        const score = JrrpCalculator.calculateJrrpWithCode(calCode, date, this.config.calCode)
        return { score, algorithm: 'calCode' }
      } else {
        // 无识别码：使用相应基础算法
        const userDateSeed = `${userId}-${todayDateStr}`
        const score = JrrpCalculator.calculateScoreWithAlgorithm(
          userDateSeed, date, this.config.algorithm
        )
        return { score, algorithm: this.config.algorithm }
      }
    }
  }

  /**
   * 格式化JRRP消息
   * @param session 会话对象
   * @param dateForCalculation 计算用的日期
   * @param skipConfirm 是否跳过确认步骤
   * @param isDateCommand 是否为日期命令
   * @returns 包含消息、分数和算法的结果对象
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
      // 计算用户分数
      const fortuneResult = await this.calculateUserFortune(
        session.userId, dateForCalculation, isCurrentDay, isDateCommand, calCode
      )
      if (!fortuneResult) {
        const message = await session.send(h('at', { id: session.userId }) +
          session.text('commands.jrrp.messages.random_org_only_today'))
        await JrrpService.autoRecall(session, message)
        return { message: null, score: -1 }
      }
      const { score: userFortune, algorithm: usedAlgorithm } = fortuneResult
      // 零分确认检查
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
      const formattedFortune = JrrpCalculator.formatScore(userFortune, dateForCalculation, foolConfig)
      // 构建消息
      const messageParts = [
        h('at', { id: session.userId }),
        session.text('commands.jrrp.messages.result', [formattedFortune])
      ]
      // 添加额外消息
      if (calCode && userFortune === 100 && !this.userData[session.userId]?.perfect_score) {
        await this.markPerfectScore(session.userId)
        messageParts.push(
          session.text(this.config.number[userFortune]),
          session.text('commands.jrrp.messages.identification_mode.perfect_score_first')
        )
      } else {
        messageParts.push(this.getScoreMessage(userFortune, monthDay, session))
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
   * 处理零分确认交互
   * @param session 会话对象
   * @param dateForCalculation 计算用的日期
   * @returns 包含消息、分数和算法的结果对象
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
   * 计算字符串的哈希值
   * @param str 输入字符串
   * @returns 计算得到的哈希值
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
   * @returns 解析后的Date对象，如果解析失败则返回null
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
   * @param range 区间消息配置对象
   * @throws 如果区间配置无效
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
   * @param message 消息对象或ID
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
}