import { Context } from 'koishi'

/**
 * 定义数据库表结构
 */
declare module 'koishi' {
  interface Tables {
    jrrp: JrrpEntry
  }
}

/**
 * 人品数据表结构
 */
export interface JrrpEntry {
  userId: string
  username: string
  algorithm: string
  date: string
  score: number
}

/**
 * 完整的人品数据
 */
export interface FortuneData {
  username: string
  score: number
  algorithm: string
}

/**
 * 人品数据存储类
 */
export class FortuneStore {
  constructor(private ctx: Context) {
    ctx.model.extend('jrrp', {
      userId: 'string',
      username: 'string',
      algorithm: 'string',
      date: 'string',
      score: 'integer',
    }, {
      primary: ['userId', 'date'],
    })
  }

  /**
   * 清理字符串，移除不可见字符和特殊字符，限制长度
   */
  sanitizeString(input: string): string {
    if (!input) return ''
    return String(input)
      .replace(/[\x00-\x1F\x7F\u200B-\u200F\u2028-\u202F\uFEFF]|[<>`$()[\]{};'"\\\=]|\s+/g, ' ')
      .replace(/(.)\1{3,}/g, '$1$1$1$1$1…')
      .trim()
      .slice(0, 64)
  }

  /**
   * 查询用户人品数据
   * @param userId 用户ID
   * @param date 可选，指定日期，默认为今天
   */
  async getFortune(userId: string, date?: string): Promise<FortuneData | null> {
    const actualDate = date || new Date().toISOString().slice(0, 10)
    const records = await this.ctx.database.get('jrrp', { userId, date: actualDate })
    if (!records.length) return null
    const { username, algorithm, score } = records[0]
    return {
      username: this.sanitizeString(username),
      algorithm,
      score
    }
  }

  /**
   * 保存人品数据
   */
  async save(userId: string, fortune: FortuneData): Promise<boolean> {
    try {
      await this.ctx.database.upsert('jrrp', [{
        userId,
        date: new Date().toISOString().slice(0, 10),
        username: this.sanitizeString(fortune.username),
        algorithm: fortune.algorithm,
        score: fortune.score
      }])
      return true
    } catch (e) {
      return false
    }
  }

  /**
   * 获取所有今日人品数据，按分数排序
   */
  async getAllTodayFortunes(): Promise<Array<{userId: string, data: FortuneData}>> {
    const today = new Date().toISOString().slice(0, 10)
    const records = await this.ctx.database
      .select('jrrp')
      .where({ date: today })
      .orderBy('score', 'desc')
      .execute()
    return records.map(record => ({
      userId: record.userId,
      data: {
        username: this.sanitizeString(record.username),
        algorithm: record.algorithm,
        score: record.score
      }
    }))
  }
}