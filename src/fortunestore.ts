import { promises as fs } from 'fs'
import path from 'path'

/**
 * 人品数据接口
 * @interface FortuneData
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
 * 用户人品数据映射，用户ID到人品数据
 * @typedef {Record<string, FortuneData>} UserFortuneMap
 */
type UserFortuneMap = Record<string, FortuneData>

/**
 * 日期到用户映射的数据结构
 * @typedef {Record<string, UserFortuneMap>} FortuneMap
 */
type FortuneMap = Record<string, UserFortuneMap>

/**
 * 人品数据存储类
 * @class FortuneStore
 */
export class FortuneStore {
  private dataPath: string
  private lastCleanDate = ''

  /**
   * 创建人品数据存储实例
   * @param {string} baseDir - 基础目录
   */
  constructor(baseDir: string) {
    this.dataPath = path.join(baseDir, 'data', 'jrrp.json')
  }

  /**
   * 读取人品数据
   * @private
   * @returns {Promise<FortuneMap>} 人品数据映射
   */
  private async read(): Promise<FortuneMap> {
    try {
      const content = await fs.readFile(this.dataPath, 'utf-8')
      return JSON.parse(content) || {}
    } catch {
      return {}
    }
  }

  /**
   * 获取用户今日人品
   * @param {string} userId - 用户ID
   * @returns {Promise<FortuneData>} 人品数据，不存在则返回null
   */
  async getFortune(userId: string): Promise<FortuneData | null> {
    const data = await this.read()
    const todayStr = new Date().toISOString().slice(0, 10)
    return data[todayStr]?.[userId] ?? null
  }

  /**
   * 保存人品数据
   * @param {string} userId - 用户ID
   * @param {FortuneData} fortune - 人品数据
   * @returns {Promise<void>}
   */
  async save(userId: string, fortune: FortuneData): Promise<void> {
    try {
      const allData = await this.read()
      const todayStr = new Date().toISOString().slice(0, 10)
      // 确保今天的数据存在
      allData[todayStr] ??= {}
      allData[todayStr][userId] = fortune
      // 清理过期数据（如果日期变化）
      if (todayStr !== this.lastCleanDate) {
        this.lastCleanDate = todayStr
        // 只保留最近7天的数据
        const dates = Object.keys(allData).sort()
        if (dates.length > 7) {
          dates.slice(0, dates.length - 7).forEach(date => delete allData[date])
        }
      }

      await fs.writeFile(this.dataPath, JSON.stringify(allData, null, 2))
    } catch {}
  }

  /**
   * 获取所有今日人品数据，按分数排序
   * @returns {Promise<Array<{userId: string, data: FortuneData}>>} 排序后的人品数据
   */
  async getAllTodayFortunes(): Promise<Array<{userId: string, data: FortuneData}>> {
    const allData = await this.read()
    const todayStr = new Date().toISOString().slice(0, 10)
    const todayData = allData[todayStr] ?? {}

    return Object.entries(todayData)
      .map(([userId, data]) => ({ userId, data }))
      .sort((a, b) => b.data.score - a.data.score)
  }
}