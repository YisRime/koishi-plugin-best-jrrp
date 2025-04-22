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
    const actualDate = date || new Date().toLocaleDateString('sv-SE')
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
        date: new Date().toLocaleDateString('sv-SE'),
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
    const today = new Date().toLocaleDateString('sv-SE')
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

  /**
   * 清除人品数据
   * @param userId 可选，指定用户ID
   * @param date 可选，指定日期
   * @returns 清除的记录数量
   */
  async clearData(userId?: string, date?: string): Promise<number> {
    // 创建查询条件
    const query: Partial<JrrpEntry> = {};
    if (userId) query.userId = userId;
    if (date) query.date = date;
    // 需要至少一个条件
    if (!userId && !date) return 0;
    try {
      // 获取并删除记录
      const records = await this.ctx.database.get('jrrp', query);
      await this.ctx.database.remove('jrrp', query);
      return records.length;
    } catch (e) {
      return 0;
    }
  }

  /**
   * 获取用户历史人品记录
   * @param userId 用户ID
   * @param limit 可选，限制返回的记录数量
   * @returns 用户历史人品记录
   */
  async getUserHistory(userId: string, limit?: number): Promise<JrrpEntry[]> {
    // 构建查询
    let query = this.ctx.database
      .select('jrrp')
      .where({ userId })
      .orderBy('date', 'desc');
    // 如果有指定限制数量
    if (limit && limit > 0) {
      query = query.limit(limit);
    }
    return await query.execute();
  }

  /**
   * 获取全局人品统计数据
   * @returns 全局人品统计数据
   */
  async getGlobalStats(): Promise<{
    count: number;
    avgScore: number;
    maxScore: number;
    minScore: number;
    stdDev: number;
  }> {
    // 获取所有记录
    const records = await this.ctx.database
      .select('jrrp')
      .execute();
    if (records.length === 0) {
      return {
        count: 0,
        avgScore: 0,
        maxScore: 0,
        minScore: 0,
        stdDev: 0
      };
    }
    // 计算统计数据
    const scores = records.map(entry => entry.score);
    const count = scores.length;
    const sum = scores.reduce((a, b) => a + b, 0);
    const mean = sum / count;
    // 计算方差
    const variance = scores.reduce((acc, score) => acc + Math.pow(score - mean, 2), 0) / count;
    return {
      count,
      avgScore: mean,
      maxScore: Math.max(...scores),
      minScore: Math.min(...scores),
      stdDev: Math.sqrt(variance)
    };
  }
}