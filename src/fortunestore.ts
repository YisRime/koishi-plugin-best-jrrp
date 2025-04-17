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
  /** 生成的时间戳 */
  timestamp: number
}

/**
 * 人品数据映射，用户ID到人品数据
 * @typedef {Record<string, FortuneData>} FortuneMap
 */
type FortuneMap = Record<string, FortuneData>

/**
 * 人品数据存储类
 * @class FortuneStore
 */
export class FortuneStore {
  private dataPath: string
  private lastCleanTimestamp = 0

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
   * 获取当天开始的时间戳（UTC）
   * @private
   * @returns {number} 时间戳
   */
  private getDayStartTimestamp(): number {
    const now = new Date()
    return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  }

  /**
   * 获取用户今日人品
   * @param {string} userId - 用户ID
   * @returns {Promise<FortuneData|null>} 人品数据，不存在或过期则返回null
   */
  async getFortune(userId: string): Promise<FortuneData | null> {
    const data = await this.read()
    const userFortune = data[userId]
    const todayStart = this.getDayStartTimestamp()
    // 检查是否有用户数据且为今天的数据
    return userFortune && userFortune.timestamp >= todayStart ? userFortune : null
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
      allData[userId] = fortune
      const todayStart = this.getDayStartTimestamp()
      // 检查是否需要清理过期数据（日期变化时）
      if (todayStart > this.lastCleanTimestamp) {
        this.lastCleanTimestamp = todayStart
        // 清理过期数据
        Object.keys(allData).forEach(id => {
          // 检查数据是否过期（不是今天的）
          if (allData[id].timestamp < todayStart) delete allData[id]
        })
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
    const todayStart = this.getDayStartTimestamp()

    return Object.entries(allData)
      .filter(([, fortune]) => fortune.timestamp >= todayStart)
      .map(([userId, data]) => ({ userId, data }))
      .sort((a, b) => b.data.score - a.data.score)
  }
}