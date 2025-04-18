import { Context, Schema } from 'koishi'
import { FortuneCalc, FortuneResult } from './fortunecalc'
import { FortuneStore } from './fortunestore'
import { MsgBuilder, ScoreDisplayFormat } from './msgbuilder'
import { CodeStore } from './codestore'

export const name = 'best-jrrp'

/**
 * 人品计算算法枚举
 * @enum {string}
 */
export const enum JrrpAlgorithm {
  /** 正态分布算法 */
  GAUSSIAN = 'gaussian',
  /** 线性同余算法 */
  LINEAR = 'linear',
  /** Random.org真随机API */
  RANDOMORG = 'randomorg'
}

/**
 * 区间消息接口
 * @interface RangeMessage
 */
export interface RangeMessage {
  /** 区间最小值 */
  min: number
  /** 区间最大值 */
  max: number
  /** 对应消息文本 */
  message: string
}

/**
 * 特殊消息接口
 * @interface SpecialMessage
 */
export interface SpecialMessage {
  /** 触发条件（日期或分数） */
  condition: string | number
  /** 对应消息文本 */
  message: string
}

/**
 * 插件配置接口
 * @interface Config
 */
export interface Config {
  /** 计算算法 */
  algorithm: JrrpAlgorithm
  /** Random.org API密钥 */
  apiKey?: string
  /** 识别码算法密钥（6段，使用|分隔） */
  codeHashSecret?: string
  /** 消息模板 */
  template: string
  /** 区间消息列表 */
  rangeMessages: Array<RangeMessage>
  /** 特殊消息列表 */
  specialMessages: Array<SpecialMessage>
  /** 是否启用分数格式化 */
  enableScoreFormat: boolean
  /** 格式化启用日期 */
  formatDate: string
  /** 分数格式化样式 */
  scoreFormat: ScoreDisplayFormat
  /** 是否启用区间消息 */
  enableRange: boolean
  /** 是否启用特殊消息 */
  enableSpecial: boolean
  /** 是否启用日期查询 */
  enableDate: boolean
  /** 是否启用分数预测 */
  enableScore: boolean
  /** 是否启用排行榜 */
  enableRank: boolean
  /** 是否启用识别码功能 */
  enableCode: boolean
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    algorithm: Schema.union([
      Schema.const(JrrpAlgorithm.GAUSSIAN).description('算法 - 正态分布'),
      Schema.const(JrrpAlgorithm.LINEAR).description('算法 - 线性同余'),
      Schema.const(JrrpAlgorithm.RANDOMORG).description('真随机 - Random.org')
    ]).default(JrrpAlgorithm.LINEAR).description('计算模式'),
    apiKey: Schema.string().description('密钥 - Random.org API').role('secret'),
    codeHashSecret: Schema.string().description('密钥 - 识别码算法').role('secret')
  }).description('算法配置'),
  Schema.object({
    enableDate: Schema.boolean().description('启用日期查询').default(true),
    enableScore: Schema.boolean().description('启用分数预测').default(true),
    enableRank: Schema.boolean().description('启用排行榜').default(true),
    enableCode: Schema.boolean().description('启用识别码').default(false)
  }).description('指令配置'),
  Schema.object({
    enableScoreFormat: Schema.boolean().description('启用格式化显示').default(true),
    formatDate: Schema.string().description('启用日期（留空保持开启）').pattern(/^\d{1,2}-\d{1,2}$/).default('4-1'),
    scoreFormat: Schema.union([
      Schema.const('binary').description('二进制'),
      Schema.const('octal').description('八进制'),
      Schema.const('hex').description('十六进制'),
      Schema.const('simple').description('简单表达式'),
      Schema.const('complex').description('复杂表达式')
    ]).description('格式化样式').default('simple')
  }).description('分数显示配置'),
  Schema.object({
    template: Schema.string().description('消息内容，支持{at}、{username}、{score}、{message}、{image:URL}占位符与\\n换行符')
      .default('{at}你今天的人品值是：{score}{message}').role('textarea'),
    enableRange: Schema.boolean().description('启用区间消息').default(true),
    rangeMessages: Schema.array(Schema.object({
      min: Schema.number().description('区间最小值').min(0).max(100).default(0),
      max: Schema.number().description('区间最大值').min(0).max(100).default(100),
      message: Schema.string().description('对应消息')
    })).description('区间消息配置').default([
      { min: 0, max: 10, message: '……（是百分制哦）' },
      { min: 11, max: 19, message: '？！不会吧……' },
      { min: 20, max: 39, message: '！呜……' },
      { min: 40, max: 49, message: '！勉强还行吧……？' },
      { min: 50, max: 64, message: '！还行啦，还行啦。' },
      { min: 65, max: 89, message: '！今天运气不错呢！' },
      { min: 90, max: 97, message: '！好评如潮！' },
      { min: 98, max: 100, message: '！差点就到 100 了呢……' }
    ]).role('table'),
    enableSpecial: Schema.boolean().description('启用特殊消息').default(true),
    specialMessages: Schema.array(Schema.object({
      condition: Schema.string().description('触发条件（人品值或日期）').pattern(/^(\d+|\d{1,2}-\d{1,2})$/),
      message: Schema.string().description('对应消息')
    })).description('特殊消息配置').default([
      { condition: '0', message: '！差评如潮！' },
      { condition: '50', message: '！五五开……' },
      { condition: '100', message: '！100！100！！！！！' },
      { condition: '1-1', message: '！新年快乐！' },
      { condition: '4-1', message: '！愚人节快乐！' },
      { condition: '12-25', message: '！圣诞快乐！' }
    ]).role('table'),
  }).description('消息配置')
])

/**
 * 解析日期字符串为日期对象
 * @param {string} dateStr - 日期字符串，支持多种格式
 * @returns {Date|null} 解析后的日期对象，无效时返回null
 */
function parseDate(dateStr: string): Date | null {
  const pattern = /^(?:(\d{1,2})|(\d{2})|(\d{4}))[-\.\/](\d{1,2})(?:[-\.\/](\d{1,2}))?$/;
  const match = dateStr.match(pattern);
  // 检查是否匹配日期格式
  if (!match) return null;

  const currentYear = new Date().getFullYear();
  const currentCentury = Math.floor(currentYear / 100) * 100;
  let year = currentYear;
  let month: number, day: number;
  // 确定日期格式并解析
  if (match[1] && !match[5]) {
    month = parseInt(match[1], 10) - 1;
    day = parseInt(match[4], 10);
  } else if (match[2]) {
    year = currentCentury + parseInt(match[2], 10);
    month = parseInt(match[4], 10) - 1;
    day = parseInt(match[5], 10);
  } else if (match[3]) {
    year = parseInt(match[3], 10);
    month = parseInt(match[4], 10) - 1;
    day = parseInt(match[5], 10);
  } else {
    month = parseInt(match[4], 10) - 1;
    day = parseInt(match[5], 10);
  }

  const targetDate = new Date(year, month, day);
  return isNaN(targetDate.getTime()) ? null : targetDate;
}

/**
 * 自动撤回消息
 * @param {any} session - 会话对象
 * @param {any} message - 消息或消息数组
 * @param {number} delay - 延迟时间(ms)，默认10秒
 * @returns {Promise<void>}
 */
async function autoRecall(session: any, message: any, delay = 10000): Promise<void> {
  if (!message) return;
  setTimeout(async () => {
    try {
      const messages = Array.isArray(message) ? message : [message];
      for (const msg of messages) {
        const msgId = typeof msg === 'string' ? msg : msg?.id;
        // 检查消息ID和会话信息是否有效
        if (msgId && session.bot && session.channelId) {
          await session.bot.deleteMessage(session.channelId, msgId);
        }
      }
    } catch (error) {}
  }, delay);
}

/**
 * 插件主函数
 * @param {Context} ctx - Koishi上下文
 * @param {Config} config - 插件配置
 */
export function apply(ctx: Context, config: Config) {
  const calc = new FortuneCalc(config.algorithm, config.apiKey)
  const store = new FortuneStore(ctx.baseDir)
  const builder = new MsgBuilder({
    rangeMessages: config.rangeMessages,
    specialMessages: config.specialMessages,
    template: config.template,
    display: {
      enabled: config.enableScoreFormat,
      date: config.formatDate,
      mode: config.scoreFormat
    },
    enableRange: config.enableRange,
    enableSpecial: config.enableSpecial
  })

  /**
   * 检查用户ID是否有效
   * @param {any} session - 会话对象
   * @returns {Promise<boolean>} 用户ID是否有效
   */
  const checkUserId = async (session): Promise<boolean> => {
    if (!session.userId) {
      autoRecall(session, await session.send('无法获取用户信息'));
      return false;
    }
    return true;
  };

  const jrrp = ctx.command('jrrp', '今日人品')
    .action(async ({ session }) => {
      if (!await checkUserId(session)) return;
      // 先查询缓存
      const cachedResult = await store.getFortune(session.userId);
      let result: FortuneResult;
      let needSave = false;
      // 检查是否有有效缓存
      if (cachedResult) {
        // 检查是否使用Random.org或算法是否一致
        if (config.algorithm === JrrpAlgorithm.RANDOMORG ||
            cachedResult.algorithm === config.algorithm) {
          result = {
            score: cachedResult.score,
            actualAlgorithm: cachedResult.algorithm as JrrpAlgorithm
          };
        } else {
          // 本地算法不同，重新计算
          result = await calc.calculate(
            session.userId, new Date().toLocaleDateString()
          );
          needSave = true;
        }
      } else {
        // 无缓存，计算新结果
        result = await calc.calculate(
          session.userId, new Date().toLocaleDateString()
        );
        needSave = true;
      }
      // 生成消息并保存结果
      const message = builder.build(result.score, session.userId, session.username || session.userId);
      if (needSave) {
        store.save(session.userId, {
          username: session.username || session.userId,
          score: result.score,
          algorithm: result.actualAlgorithm
        });
      }

      return message;
    });

  // 检查是否为Random.org模式
  if (config.algorithm !== JrrpAlgorithm.RANDOMORG) {
    // 检查是否启用分数预测功能
    if (config.enableScore) {
      jrrp.subcommand('.score [score:integer]', '获取指定人品值日期')
        .usage('输入人品值查询下一次获得该值的日期')
        .action(async ({ session }, score = 100) => {
          if (!await checkUserId(session)) return;
          // 确保score在0-100之间
          if (score < 0 || score > 100) {
            autoRecall(session, await session.send('人品值必须在 0-100 之间'));
            return;
          }
          // 计算从今天开始找到匹配分数的日期
          const today = new Date();
          for (let i = 0; i < 3650; i++) {
            const checkDate = new Date();
            checkDate.setDate(today.getDate() + i);
            const dateStr = checkDate.toLocaleDateString();
            const calculatedResult = await calc.calculate(session.userId, dateStr);
            // 检查是否找到匹配的分数
            if (calculatedResult.score === score) {
              const month = checkDate.getMonth() + 1;
              const day = checkDate.getDate();
              return `你${month}月${day}日的人品值是：${score}分`;
            }
          }
          autoRecall(session, await session.send(`你未来十年内不会出现人品值是：${score}分`));
        });
    }
    // 检查是否启用日期查询功能
    if (config.enableDate) {
      jrrp.subcommand('.date [date:string]', '获取指定日期人品值')
        .usage('输入日期查询该日期的人品值\n支持格式: MM.DD、YY/MM/DD、YYYY-MM-DD')
        .action(async ({ session }, date) => {
          if (!await checkUserId(session)) return;

          let targetDate: Date | null;
          if (!date) {
            // 不提供日期时，使用当天日期
            targetDate = new Date();
          } else {
            targetDate = parseDate(date);
            // 检查日期格式是否有效
            if (!targetDate) {
              autoRecall(session, await session.send('日期格式不正确或无效'));
              return;
            }
          }

          const dateStr = targetDate.toLocaleDateString();
          const calculatedResult = await calc.calculate(session.userId, dateStr);
          return builder.build(calculatedResult.score, session.userId, session.username || session.userId);
        });
    }
  }

  // 检查是否启用排行榜功能
  if (config.enableRank) {
    jrrp.subcommand('.rank', '查看今日人品排行')
      .usage('显示今天所有获取过人品值的用户排名')
      .action(async ({ session }) => {
        const allRanks = await store.getAllTodayFortunes();
        // 检查是否有人获取过人品值
        if (allRanks.length === 0) {
          return '今天还没有人获取过人品值';
        }

        let message = '——今日人品排行——\n';
        allRanks.slice(0, 10).forEach((item, index) => {
          message += `No.${index + 1} ${item.data.username} - ${item.data.score}分\n`;
        });

        if (session.userId) {
          const userRank = allRanks.findIndex(item => item.userId === session.userId);
          // 检查用户是否在排行榜中
          message += userRank >= 0
            ? `你位于第${userRank + 1}名（共${allRanks.length}人）`
            : '你还没有获取今日人品';
        }
        return message;
      });
  }

  // 识别码功能
  if (config.enableCode && config.codeHashSecret) {
    const hashKeys = config.codeHashSecret.split('|');
    if (hashKeys.length >= 6) {
      const codeStore = new CodeStore(ctx.baseDir, {
        key1: hashKeys[0], key2: hashKeys[1], key3: hashKeys[2],
        key4: hashKeys[3], key5: hashKeys[4], key6: hashKeys[5]
      });
      // 注册识别码命令
      codeStore.registerCommands({ checkUserId, autoRecall, parseDate, jrrp });
    }
  }
}