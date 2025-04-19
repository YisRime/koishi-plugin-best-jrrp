import { promises as fs } from 'fs'
import path from 'path'

/**
 * 人品数据存储模块
 * 负责用户今日人品数据的存储、读取和管理
 * @module fortunestore
 */

/**
 * 人品数据接口
 */
interface FortuneData {
  /** 用户名 */
  username: string
  /** 人品分数 */
  score: number
  /** 使用的算法 */
  algorithm: string
}

/**
 * 人品记录接口，包含完整信息
 */
interface FortuneRecord extends FortuneData {
  /** 日期字符串 */
  date: string
  /** 用户ID */
  userId: string
}

/**
 * 用户的历史人品记录
 * @typedef {Record<string, FortuneData>} UserHistory - 日期到人品数据的映射
 */
type UserHistory = Record<string, FortuneData>

/**
 * 存储结构接口
 */
interface StorageData {
  /** 用户历史记录（用户ID -> 日期 -> 人品数据） */
  users: Record<string, UserHistory>
  /** 日期索引（日期 -> 用户ID列表） */
  dateIndex: Record<string, string[]>
  /** 最后更新时间 */
  lastUpdated: string
}

/**
 * 人品数据存储类
 * 提供人品数据的读取、保存和查询功能
 */
export class FortuneStore {
  private dataPath: string
  private lastCleanDate = ''

  /**
   * 创建人品数据存储实例
   * @param {string} baseDir - 基础目录路径
   */
  constructor(baseDir: string) {
    this.dataPath = path.join(baseDir, 'data', 'jrrp.json')
  }

  /**
   * 获取当前本地日期字符串（YYYY-MM-DD 格式）
   * @returns {string} 格式化的日期字符串
   * @private
   */
  private getLocalDateString(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }

  /**
   * 读取人品数据
   * @returns {Promise<StorageData>} 读取到的存储数据
   * @private
   */
  private async read(): Promise<StorageData> {
    try {
      const content = await fs.readFile(this.dataPath, 'utf-8')
      const data = JSON.parse(content) as StorageData
      // 验证数据完整性
      if (data && typeof data === 'object' && data.users && data.dateIndex) {
        return data
      }
    } catch {}
    // 文件不存在或读取错误
    return {
      users: {},
      dateIndex: {},
      lastUpdated: this.getLocalDateString()
    }
  }

  /**
   * 写入人品数据
   * @param {StorageData} data - 要写入的数据
   * @returns {Promise<void>}
   * @private
   */
  private async write(data: StorageData): Promise<void> {
    data.lastUpdated = this.getLocalDateString()
    await fs.writeFile(this.dataPath, JSON.stringify(data, null, 2))
  }

  /**
   * 清理过期数据，只保留最近28天
   * @param {StorageData} data - 需要清理的数据
   * @param {string} todayStr - 今天的日期字符串
   * @returns {StorageData} 清理后的数据
   * @private
   */
  private cleanExpiredData(data: StorageData, todayStr: string): StorageData {
    if (todayStr === this.lastCleanDate) return data

    this.lastCleanDate = todayStr
    const dates = Object.keys(data.dateIndex).sort()
    // 只保留最近28天的数据
    if (dates.length > 28) {
      const keepDates = dates.slice(-28)
      const newData: StorageData = {
        users: {},
        dateIndex: {},
        lastUpdated: data.lastUpdated
      }
      // 只保留要保留的日期数据
      Object.entries(data.users).forEach(([userId, userHistory]) => {
        newData.users[userId] = {}

        keepDates.forEach(date => {
          if (userHistory[date]) {
            newData.users[userId][date] = userHistory[date]

            newData.dateIndex[date] = newData.dateIndex[date] || []
            if (!newData.dateIndex[date].includes(userId)) {
              newData.dateIndex[date].push(userId)
            }
          }
        })
        // 如果用户没有任何记录，删除该用户
        if (Object.keys(newData.users[userId]).length === 0) {
          delete newData.users[userId]
        }
      })

      return newData
    }

    return data
  }

  /**
   * 获取用户今日人品
   * @param {string} userId - 用户ID
   * @returns {Promise<FortuneData | null>} 用户今日人品数据，如不存在则返回null
   */
  async getFortune(userId: string): Promise<FortuneData | null> {
    const data = await this.read()
    const todayStr = this.getLocalDateString()
    return data.users[userId]?.[todayStr] ?? null
  }

  /**
   * 获取用户指定日期的人品
   * @param {string} userId - 用户ID
   * @param {string} date - 日期字符串，格式为YYYY-MM-DD
   * @returns {Promise<FortuneData | null>} 指定日期的人品数据，如不存在则返回null
   */
  async getFortuneByDate(userId: string, date: string): Promise<FortuneData | null> {
    const data = await this.read()
    return data.users[userId]?.[date] ?? null
  }

  /**
   * 获取用户的历史人品记录
   * @param {string} userId - 用户ID
   * @param {number} [limit=15] - 限制返回的记录数量
   * @returns {Promise<FortuneRecord[]>} 用户历史人品记录列表，按日期降序排序
   */
  async getUserHistory(userId: string, limit = 15): Promise<FortuneRecord[]> {
    const data = await this.read()
    const userHistory = data.users[userId] || {}

    return Object.entries(userHistory)
      .map(([date, fortuneData]) => ({ ...fortuneData, date, userId }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit)
  }

  /**
   * 保存人品数据
   * @param {string} userId - 用户ID
   * @param {FortuneData} fortune - 要保存的人品数据
   * @returns {Promise<void>}
   */
  async save(userId: string, fortune: FortuneData): Promise<void> {
    try {
      let data = await this.read()
      const todayStr = this.getLocalDateString()
      // 初始化用户记录和日期索引
      if (!data.users[userId]) data.users[userId] = {}
      if (!data.dateIndex[todayStr]) data.dateIndex[todayStr] = []
      // 保存用户当天记录
      data.users[userId][todayStr] = fortune
      // 添加用户到日期索引
      if (!data.dateIndex[todayStr].includes(userId)) {
        data.dateIndex[todayStr].push(userId)
      }
      // 清理过期数据并保存
      data = this.cleanExpiredData(data, todayStr)
      await this.write(data)
    } catch {}
  }

  /**
   * 获取所有今日人品数据，按分数排序
   * @returns {Promise<Array<{userId: string, data: FortuneData}>>} 所有用户今日的人品数据，按分数降序排序
   */
  async getAllTodayFortunes(): Promise<Array<{userId: string, data: FortuneData}>> {
    const data = await this.read()
    const todayStr = this.getLocalDateString()
    const userIds = data.dateIndex[todayStr] || []

    return userIds
      .map(userId => ({ userId, data: data.users[userId][todayStr] }))
      .filter(item => item.data)
      .sort((a, b) => b.data.score - a.data.score)
  }
}