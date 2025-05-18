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
 * 趋势类型枚举
 * @enum {string}
 */
export enum TrendType {
  UP = 'up',
  DOWN = 'down',
  STABLE = 'stable',
  VOLATILE = 'volatile',
  UNKNOWN = 'unknown'
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
 * @property {TrendType} trend 分数趋势
 * @property {number} volatility 波动率 (0-100)
 * @property {number} percentile 百分位排名 (0-100)
 * @property {number} consecutiveUp 连续上升天数
 * @property {number} consecutiveDown 连续下降天数
 * @property {Record<string, number>} distribution 分数分布
 * @property {string} sparkline 迷你图表
 */
export interface AnalysisResult {
  count: number
  mean: number
  median: number
  stdDev: number
  min: number
  max: number
  recentScores?: number[]
  trend: TrendType
  volatility: number
  percentile: number
  consecutiveUp: number
  consecutiveDown: number
  distribution: Record<string, number>
  sparkline: string
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
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30); // 分析最近30天数据
      const cutoffDateStr = cutoffDate.toLocaleDateString('sv-SE');

      const [globalRecords, userRecords] = await Promise.all([
        this.ctx.database.select('jrrp').where({ date: { $gte: cutoffDateStr } }).execute(),
        this.ctx.database.select('jrrp').where({ date: { $gte: cutoffDateStr }, userId }).orderBy('date', 'asc').execute()
      ]);

      // 按照日期对全局记录进行分组，用于计算百分位排名
      const globalByDate: Record<string, number[]> = {};
      for (const record of globalRecords) {
        if (!globalByDate[record.date]) globalByDate[record.date] = [];
        globalByDate[record.date].push(record.score);
      }

      // 计算用户在每天的百分位排名
      let totalPercentile = 0;
      let percentileCount = 0;

      for (const record of userRecords) {
        const dailyScores = globalByDate[record.date];
        if (dailyScores && dailyScores.length > 1) {
          const belowCount = dailyScores.filter(s => s < record.score).length;
          const percentile = (belowCount / dailyScores.length) * 100;
          totalPercentile += percentile;
          percentileCount++;
        }
      }

      const avgPercentile = percentileCount > 0 ? totalPercentile / percentileCount : 50;

      // 分析用户数据，传入平均百分位排名
      const userAnalysis = this.analyzeData(userRecords, 15, avgPercentile);
      // 分析全局数据
      const globalAnalysis = this.analyzeData(globalRecords, undefined, 50);

      return { user: userAnalysis, global: globalAnalysis };
    } catch (error) {
      const emptyResult: AnalysisResult = {
        count: 0, mean: 0, median: 0, stdDev: 0, min: 0, max: 0,
        recentScores: [], trend: TrendType.UNKNOWN, volatility: 0,
        percentile: 50, consecutiveUp: 0, consecutiveDown: 0,
        distribution: {}, sparkline: ''
      };
      return { user: emptyResult, global: emptyResult };
    }
  }

  /**
   * 分析人品数据集合
   * @param {JrrpEntry[]} records 人品记录集合
   * @param {number} [recentLimit] 最近记录的限制数量
   * @param {number} [percentile] 平均百分位排名
   * @returns {AnalysisResult} 分析结果
   */
  analyzeData(records: JrrpEntry[], recentLimit?: number, percentile: number = 50): AnalysisResult {
    if (!records?.length) {
      return {
        count: 0, mean: 0, median: 0, stdDev: 0, min: 0, max: 0,
        recentScores: [], trend: TrendType.UNKNOWN, volatility: 0,
        percentile, consecutiveUp: 0, consecutiveDown: 0,
        distribution: {}, sparkline: ''
      };
    }

    const scores = records.map(e => e.score);
    const count = scores.length;
    const sorted = [...scores].sort((a, b) => a - b);
    const sum = scores.reduce((a, b) => a + b, 0);
    const mean = sum / count;
    const stdDev = Math.sqrt(scores.reduce((a, s) => a + Math.pow(s - mean, 2), 0) / count);

    // 计算分数分布
    const distribution: Record<string, number> = {};
    const ranges = ['0-20', '21-40', '41-60', '61-80', '81-100'];
    ranges.forEach(range => distribution[range] = 0);

    for (const score of scores) {
      if (score <= 20) distribution['0-20']++;
      else if (score <= 40) distribution['21-40']++;
      else if (score <= 60) distribution['41-60']++;
      else if (score <= 80) distribution['61-80']++;
      else distribution['81-100']++;
    }

    // 计算分数趋势
    let trend = TrendType.UNKNOWN;
    let consecutiveUp = 0;
    let consecutiveDown = 0;

    if (count >= 3) {
      const recent = recentLimit ? scores.slice(-recentLimit) : scores;

      // 计算最近的上升和下降趋势
      let ups = 0, downs = 0, sames = 0;
      for (let i = 1; i < recent.length; i++) {
        if (recent[i] > recent[i-1]) ups++;
        else if (recent[i] < recent[i-1]) downs++;
        else sames++;
      }

      // 计算连续上升下降天数
      for (let i = scores.length - 2; i >= 0; i--) {
        if (scores[i+1] > scores[i]) consecutiveUp++;
        else break;
      }

      for (let i = scores.length - 2; i >= 0; i--) {
        if (scores[i+1] < scores[i]) consecutiveDown++;
        else break;
      }

      const total = ups + downs + sames;
      if (total > 0) {
        const upPercent = ups / total * 100;
        const downPercent = downs / total * 100;

        if (upPercent >= 60) trend = TrendType.UP;
        else if (downPercent >= 60) trend = TrendType.DOWN;
        else if (sames >= total * 0.5) trend = TrendType.STABLE;
        else trend = TrendType.VOLATILE;
      }
    }

    // 计算波动率 (0-100)
    const volatility = Math.min(100, stdDev * 2);

    // 生成迷你图表
    const sparklineArray = recentLimit && scores.length > 1 ? scores.slice(-Math.min(recentLimit, scores.length)) : [];
    const sparkline = this.generateSparkline(sparklineArray);

    return {
      count, mean, median: sorted[Math.floor(count / 2)],
      stdDev, min: sorted[0], max: sorted[sorted.length - 1],
      recentScores: recentLimit ? scores.slice(-recentLimit) : undefined,
      trend, volatility, percentile,
      consecutiveUp, consecutiveDown,
      distribution, sparkline
    };
  }

  /**
   * 生成文本迷你图表
   * @param {number[]} scores 分数数组
   * @returns {string} 文本图表
   */
  private generateSparkline(scores: number[]): string {
    if (!scores.length) return '';

    const chars = '▁▂▃▄▅▆▇█';
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min || 1;

    return scores.map(score => {
      // 将分数映射到0-7的范围内
      const level = Math.floor(((score - min) / range) * (chars.length - 1));
      return chars.charAt(level);
    }).join('');
  }
}