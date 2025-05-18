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
 * @interface JrrpEntry
 * @property {string} userId 用户ID
 * @property {string} username 用户名
 * @property {string} algorithm 算法
 * @property {string} date 日期
 * @property {number} score 分数
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
 * @interface FortuneData
 * @property {string} username 用户名
 * @property {number} score 分数
 * @property {string} algorithm 算法
 */
export interface FortuneData {
  username: string
  score: number
  algorithm: string
}

/**
 * 简化的统计分析结果接口
 * @interface AnalysisResult
 * @property {number} count 记录数量
 * @property {number} mean 平均分
 * @property {number} median 中位数
 * @property {number} stdDev 标准差
 * @property {number} min 最低分
 * @property {number} max 最高分
 * @property {number[]} recentScores 最近的分数
 * @property {string} luckType 运气类型
 * @property {Object} distribution 分布统计
 * @property {number[]} histogram 直方图数据
 * @property {number} entropy 熵指数
 * @property {number} balance 平衡度
 * @property {number} extremeRate 极值率
 * @property {number[]} heatmap 热图数据（8个分段）
 * @property {string} trendGraph 走势图
 */
export interface AnalysisResult {
  count: number
  mean: number
  median: number
  stdDev: number
  min: number
  max: number
  recentScores?: number[]
  luckType?: string  // 改为字符串类型
  distribution?: { low: number, medium: number, high: number }
  histogram?: number[]
  entropy?: number
  balance?: number
  extremeRate?: number
  heatmap?: number[]
  trendGraph?: string
}

/**
 * 统计数据比较结果
 * @interface StatsComparison
 * @property {AnalysisResult} user 用户统计数据
 * @property {AnalysisResult} global 全局统计数据
 */
export interface StatsComparison {
  user: AnalysisResult
  global: AnalysisResult
}

/**
 * 人品数据存储类
 * @class FortuneStore
 */
export class FortuneStore {
  /**
   * 构造函数，初始化数据库表结构
   * @param {Context} ctx Koishi 上下文
   */
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
   * @param {string} input 输入字符串
   * @returns {string} 清理后的字符串
   */
  sanitizeString(input: string): string {
    return input ? String(input)
      .replace(/[\x00-\x1F\x7F\u200B-\u200F\u2028-\u202F\uFEFF]|[<>`$()[\]{};'"\\\=]|\s+/g, ' ')
      .replace(/(.)\1{3,}/g, '$1$1$1$1$1…')
      .trim()
      .slice(0, 64) : ''
  }

  /**
   * 查询用户人品数据
   * @param {string} userId 用户ID
   * @param {string} [date] 可选，指定日期，默认为今天
   * @returns {Promise<FortuneData|null>} 查询结果
   */
  async getFortune(userId: string, date?: string): Promise<FortuneData | null> {
    const actualDate = date || new Date().toLocaleDateString('sv-SE')
    const records = await this.ctx.database.get('jrrp', { userId, date: actualDate })
    if (!records.length) return null
    const { username, algorithm, score } = records[0]
    return { username: username, algorithm, score }
  }

  /**
   * 保存人品数据
   * @param {string} userId 用户ID
   * @param {FortuneData} fortune 人品数据
   * @returns {Promise<boolean>} 是否保存成功
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
   * @returns {Promise<Array<{userId: string, data: FortuneData}>>}
   */
  async getAllTodayFortunes(): Promise<Array<{userId: string, data: FortuneData}>> {
    const today = new Date().toLocaleDateString('sv-SE')
    const records = await this.ctx.database
      .select('jrrp').where({ date: today }).orderBy('score', 'desc').execute()
    return records.map(r => ({
      userId: r.userId,
      data: { username: r.username, algorithm: r.algorithm, score: r.score }
    }))
  }

  /**
   * 清除人品数据
   * @param {string} [userId] 可选，指定用户ID
   * @param {string} [date] 可选，指定日期
   * @returns {Promise<number>} 清除的记录数量
   */
  async clearData(userId?: string, date?: string): Promise<number> {
    const query: Partial<JrrpEntry> = {};
    if (userId) query.userId = userId;
    if (date) query.date = date;
    if (!userId && !date) return 0;
    try {
      const records = await this.ctx.database.get('jrrp', query);
      await this.ctx.database.remove('jrrp', query);
      return records.length;
    } catch { return 0 }
  }

  /**
   * 获取用户和全局统计数据的比较
   * @param {string} userId 用户ID
   * @returns {Promise<StatsComparison>} 用户和全局统计数据比较结果
   */
  async getStatsComparison(userId: string): Promise<StatsComparison> {
    try {
      const cutoffDateStr = new Date(Date.now() - 15 * 24 * 3600 * 1000).toLocaleDateString('sv-SE');
      const [globalRecords, userRecords] = await Promise.all([
        this.ctx.database.select('jrrp').where({ date: { $gte: cutoffDateStr } }).execute(),
        this.ctx.database.select('jrrp').where({ date: { $gte: cutoffDateStr }, userId }).orderBy('date', 'desc').execute()
      ]);
      return { user: this.analyzeData(userRecords, 10), global: this.analyzeData(globalRecords) };
    } catch (error) {
      const emptyResult: AnalysisResult = { count: 0, mean: 0, median: 0, stdDev: 0, min: 0, max: 0, recentScores: [] };
      return { user: emptyResult, global: emptyResult };
    }
  }

  /**
   * 分析人品数据集合
   * @param {JrrpEntry[]} records 人品记录集合
   * @param {number} [recentLimit] 最近记录的限制数量
   * @returns {AnalysisResult} 分析结果
   */
  analyzeData(records: JrrpEntry[], recentLimit?: number): AnalysisResult {
    if (!records?.length) return {
      count: 0, mean: 0, median: 0, stdDev: 0, min: 0, max: 0,
      recentScores: [], distribution: { low: 0, medium: 0, high: 0 }
    };
    const scores = records.map(e => e.score);
    const count = scores.length;
    const sorted = [...scores].sort((a, b) => a - b);
    const sum = scores.reduce((a, b) => a + b, 0);
    const mean = sum / count;
    const stdDev = Math.sqrt(scores.reduce((a, s) => a + Math.pow(s - mean, 2), 0) / count);
    // 基本区间分布计算
    const distribution = {
      low: scores.filter(s => s <= 33).length / count,
      medium: scores.filter(s => s > 33 && s <= 66).length / count,
      high: scores.filter(s => s > 66).length / count
    };
    // 计算直方图数据
    const histogram = Array(10).fill(0);
    scores.forEach(s => histogram[Math.min(Math.floor(s / 10), 9)]++);
    const maxBin = Math.max(...histogram);
    const normalizedHistogram = maxBin > 0 ? histogram.map(bin => bin / maxBin) : histogram;
    // 确定运气类型
    let luckType = '均衡';
    if (distribution.high > 0.5) luckType = '较高';
    else if (distribution.low > 0.5) luckType = '较低';
    else if (stdDev > 30) luckType = '极端';
    else if (distribution.medium > 0.6) luckType = '中庸';
    // 熵指数计算
    const entropy = this.calculateEntropy(normalizedHistogram, count);
    // 平衡度和极值率
    const balance = (mean - 50) * 2;
    const extremeRate = (scores.filter(s => s <= 10 || s >= 90).length / count) * 100;
    // 热图数据
    const heatmap = [0,0,0,0,0,0,0,0];
    scores.forEach(s => heatmap[Math.min(Math.floor(s / 12.5), 7)]++);
    // 走势图生成
    const trendGraph = this.generateTrendGraph(scores.slice(0, Math.min(recentLimit || 10, scores.length)));
    return {
      count, mean, stdDev, min: sorted[0], max: sorted[count - 1],
      median: count % 2 ? sorted[Math.floor(count / 2)] : (sorted[count / 2 - 1] + sorted[count / 2]) / 2,
      recentScores: recentLimit ? scores.slice(0, recentLimit) : undefined,
      luckType, distribution, histogram: normalizedHistogram, entropy, balance, extremeRate, heatmap, trendGraph
    };
  }

  /**
   * 计算熵指数
   * @param {number[]} histogram 直方图数据
   * @param {number} count 总记录数
   * @returns {number} 熵指数(0-100)
   */
  private calculateEntropy(histogram: number[], count: number): number {
    const probabilities = histogram.map(h => h / count).filter(p => p > 0);
    if (probabilities.length === 0) return 0;
    const rawEntropy = -probabilities.reduce((sum, p) => sum + p * Math.log2(p), 0);
    return Math.min(100, (rawEntropy / Math.log2(10)) * 100);
  }

  /**
   * 生成走势图
   * @param {number[]} scores 分数列表
   * @returns {string} 走势图字符串
   */
  private generateTrendGraph(scores: number[]): string {
    if (!scores.length) return '';
    const chars = '▁▂▃▄▅▆▇█';
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min || 1;
    return scores.map(score => {
      const normalized = (score - min) / range;
      const charIndex = Math.min(Math.floor(normalized * chars.length), chars.length - 1);
      return chars[charIndex];
    }).join('');
  }
}