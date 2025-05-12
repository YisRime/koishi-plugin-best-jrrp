import { Context, Schema } from 'koishi'
import { FortuneCalc } from './fortunecalc'
import { FortuneStore } from './fortunestore'
import { MsgBuilder, ScoreDisplayFormat } from './msgbuilder'
import { CodeStore } from './codestore'

export const name = 'best-jrrp'
export const inject = ['database']

export const usage = `
<div style="border-radius: 10px; border: 1px solid #ddd; padding: 16px; margin-bottom: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
  <h2 style="margin-top: 0; color: #4a6ee0;">📌 插件说明</h2>
  <p>📖 <strong>使用文档</strong>：请点击左上角的 <strong>插件主页</strong> 查看插件使用文档</p>
  <p>🔍 <strong>更多插件</strong>：可访问 <a href="https://github.com/YisRime" style="color:#4a6ee0;text-decoration:none;">苡淞的 GitHub</a> 查看本人的所有插件</p>
</div>

<div style="border-radius: 10px; border: 1px solid #ddd; padding: 16px; margin-bottom: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
  <h2 style="margin-top: 0; color: #e0574a;">❤️ 支持与反馈</h2>
  <p>🌟 喜欢这个插件？请在 <a href="https://github.com/YisRime" style="color:#e0574a;text-decoration:none;">GitHub</a> 上给我一个 Star！</p>
  <p>🐛 遇到问题？请通过 <strong>Issues</strong> 提交反馈，或加入 QQ 群 <a href="https://qm.qq.com/q/PdLMx9Jowq" style="color:#e0574a;text-decoration:none;"><strong>855571375</strong></a> 进行交流</p>
</div>
`

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
 * @property {number} min 区间最小值
 * @property {number} max 区间最大值
 * @property {string} message 对应消息文本
 */
export interface RangeMessage {
  min: number
  max: number
  message: string
}

/**
 * 特殊消息接口
 * @interface SpecialMessage
 * @property {string|number} condition 触发条件（日期或分数）
 * @property {string} message 对应消息文本
 */
export interface SpecialMessage {
  condition: string | number
  message: string
}

/**
 * 插件配置接口
 * @interface Config
 * @property {JrrpAlgorithm} algorithm 计算算法
 * @property {string} [apiKey] Random.org API密钥
 * @property {string|false} enableCode 识别码配置，字符串为密钥，false则禁用
 * @property {string} template 消息模板
 * @property {Array<RangeMessage>} rangeMessages 区间消息列表
 * @property {Array<SpecialMessage>} specialMessages 特殊消息列表
 * @property {boolean} enableScoreFormat 是否启用分数格式化
 * @property {string} formatDate 格式化启用日期
 * @property {ScoreDisplayFormat} scoreFormat 分数格式化样式
 * @property {boolean} enableRange 是否启用区间消息
 * @property {boolean} enableSpecial 是否启用特殊消息
 * @property {boolean} enableDate 是否启用日期查询
 * @property {boolean} enableScore 是否启用分数预测
 * @property {boolean} enableRank 是否启用排行榜
 * @property {string} [imagesPath] 占位符"{pixiv}"数据地址，可以是网址或本地目录
 */
export interface Config {
  algorithm: JrrpAlgorithm
  apiKey: string
  enableCode: string | false
  template: string
  rangeMessages: Array<RangeMessage>
  specialMessages: Array<SpecialMessage>
  enableScoreFormat: boolean
  formatDate: string
  scoreFormat: ScoreDisplayFormat
  enableRange: boolean
  enableSpecial: boolean
  enableDate: boolean
  enableScore: boolean
  enableRank: boolean
  imagesPath?: string
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    enableDate: Schema.boolean().description('启用日期查询').default(true),
    enableScore: Schema.boolean().description('启用分数预测').default(true),
    enableRank: Schema.boolean().description('启用分数排行').default(true),
    enableCode: Schema.union([
      Schema.const(false).description('禁用'),
      Schema.string().description('启用').role('secret')
    ]).description('启用识别码').default(false),
    algorithm: Schema.union([
      Schema.const(JrrpAlgorithm.GAUSSIAN).description('算法 - 正态分布'),
      Schema.const(JrrpAlgorithm.LINEAR).description('算法 - 线性同余'),
      Schema.const(JrrpAlgorithm.RANDOMORG).description('真随机 - Random.org')
    ]).default(JrrpAlgorithm.LINEAR).description('计算算法/方式'),
    apiKey: Schema.string().description('密钥 - Random.org API').role('secret')
  }).description('基础配置'),
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
    template: Schema.string().description('消息内容，支持{at}、{username}、{score}、{message}、{~}、{hitokoto}、{pixiv}、{image:URL}占位符')
      .default('{at}你今天的人品值是：{score}{message}').role('textarea'),
    imagesPath: Schema.string().description('占位符"{pixiv}"数据地址')
      .default('https://raw.githubusercontent.com/YisRime/koishi-plugin-onebot-tool/main/resource/pixiv.json'),
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
      { condition: '0', message: '？！' },
      { condition: '50', message: '！五五开……' },
      { condition: '100', message: '！100！100！！！！！' },
      { condition: '1-1', message: '！新年快乐！' },
      { condition: '4-1', message: '！愚人节快乐！' },
      { condition: '12-25', message: '！圣诞快乐！' }
    ]).role('table')
  }).description('消息配置')
])

/**
 * 解析日期字符串为日期对象
 * @param {string} dateStr - 日期字符串，支持多种格式
 * @returns {Date|null} 解析后的日期对象，无效时返回null
 */
function parseDate(dateStr: string): Date | null {
  const formats = [
    /^(\d{1,2})-(\d{1,2})$/,
    /^(\d{1,2})[\/\.](\d{1,2})$/,
    /^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})$/,
    /^(\d{2})[-\/\.](\d{1,2})[-\/\.](\d{1,2})$/
  ];
  for (const f of formats) {
    const m = dateStr.match(f);
    if (!m) continue;
    let year = new Date().getFullYear(), month: number, day: number;
    if (m.length === 3) { month = +m[1] - 1; day = +m[2]; }
    else if (m.length === 4 && m[1].length === 4) { year = +m[1]; month = +m[2] - 1; day = +m[3]; }
    else if (m.length === 4) { year = Math.floor(year / 100) * 100 + +m[1]; month = +m[2] - 1; day = +m[3]; }
    else continue;
    const date = new Date(year, month, day);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
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
      for (const msg of Array.isArray(message) ? message : [message]) {
        const msgId = typeof msg === 'string' ? msg : msg?.id;
        if (msgId && session.bot && session.channelId)
          await session.bot.deleteMessage(session.channelId, msgId);
      }
    } catch {}
  }, delay);
}

/**
 * 插件主函数
 * @param {Context} ctx - Koishi上下文
 * @param {Config} config - 插件配置
 */
export function apply(ctx: Context, config: Config) {
  const calc = new FortuneCalc(config.algorithm, config.apiKey)
  const store = new FortuneStore(ctx)
  const builder = new MsgBuilder({
    rangeMessages: config.rangeMessages,
    specialMessages: config.specialMessages,
    template: config.template,
    display: { enabled: config.enableScoreFormat, date: config.formatDate, mode: config.scoreFormat },
    enableRange: config.enableRange,
    enableSpecial: config.enableSpecial
  }, {
    baseDir: ctx.baseDir,
    logger: ctx.logger,
    imagesPath: config.imagesPath
  })
  const jrrp = ctx.command('jrrp', '今日人品')
    .usage('查询今日人品值' + (config.algorithm === JrrpAlgorithm.RANDOMORG ? '（真随机模式）' : ''))
    .action(async ({ session }) => {
      if (!session.userId) { autoRecall(session, await session.send('无法获取用户信息')); return }
      const cached = await store.getFortune(session.userId);
      let result = cached ? { score: cached.score, actualAlgorithm: cached.algorithm as JrrpAlgorithm }
        : await calc.calculate(session.userId, new Date().toLocaleDateString());
      if (!cached) store.save(session.userId, { username: session.username || session.userId, score: result.score, algorithm: result.actualAlgorithm });
      const msg = await builder.build(result.score, session.userId, session.username || session.userId);
      if (Array.isArray(msg)) {
        for (const seg of msg) await session.sendQueued(seg);
        return;
      }
      return msg;
    });
  if (config.algorithm !== JrrpAlgorithm.RANDOMORG && config.enableScore)
    jrrp.subcommand('.score [score:integer]', '获取指定人品值日期')
      .usage('输入人品值查询下一次获得该值的日期')
      .action(async ({ session }, score = 100) => {
        if (!session.userId) { autoRecall(session, await session.send('无法获取用户信息')); return }
        if (score < 0 || score > 100) return autoRecall(session, await session.send('人品值必须在 0-100 之间'));
        const today = new Date();
        for (let i = 0; i < 3650; i++) {
          const checkDate = new Date(); checkDate.setDate(today.getDate() + i);
          const result = await calc.calculate(session.userId, checkDate.toLocaleDateString());
          if (result.score === score)
            return `你${checkDate.getMonth() + 1}月${checkDate.getDate()}日的人品值是：${score}分`;
        }
        autoRecall(session, await session.send(`你未来十年内不会出现人品值是：${score}分`));
      });
  if (config.algorithm !== JrrpAlgorithm.RANDOMORG && config.enableDate)
    jrrp.subcommand('.date [date:string]', '获取指定日期人品值')
      .usage('输入日期查询该日期的人品值\n支持格式: MM.DD、YY/MM/DD、YYYY-MM-DD')
      .action(async ({ session }, date) => {
        if (!session.userId) { autoRecall(session, await session.send('无法获取用户信息')); return }
        let targetDate = date ? parseDate(date) : new Date();
        if (!targetDate) return autoRecall(session, await session.send('日期格式不正确或无效'));
        const result = await calc.calculate(session.userId, targetDate.toLocaleDateString());
        const msg = await builder.build(result.score, session.userId, session.username || session.userId);
        if (Array.isArray(msg)) {
          for (const seg of msg) await session.sendQueued(seg);
          return;
        }
        return msg;
      });
  if (config.enableRank)
    jrrp.subcommand('.rank', '查看今日人品排行')
      .usage('显示今天所有获取过人品值的用户排名')
      .action(async ({ session }) => {
        const allRanks = await store.getAllTodayFortunes();
        if (!allRanks.length) return '今天还没有人获取过人品值';
        let msg = '——今日人品排行——\n';
        allRanks.slice(0, 10).forEach((item, i) => msg += `No.${i + 1} ${item.data.username} - ${item.data.score}分\n`);
        if (session.userId) {
          const userRank = allRanks.findIndex(item => item.userId === session.userId);
          msg += userRank >= 0 ? `你位于第${userRank + 1}名（共${allRanks.length}人）` : '你还没有获取今日人品';
        }
        return msg;
      });
  jrrp.subcommand('.analyse', '分析人品数据')
    .usage('分析你近15天的人品数据统计')
    .action(async ({ session }) => {
      if (!session.userId) { autoRecall(session, await session.send('无法获取用户信息')); return }
      const stats = await store.getStatsComparison(session.userId);
      if (stats.user.count === 0) return '暂无人品记录可供分析';
      const getCompareSymbol = (user: number, global: number) => {
        if (user > global) return '▲';
        if (user < global) return '▼';
        return '━';
      };
      const msg = [
        `——${session.username}的人品分析——`,
        `平均分: ${stats.user.mean.toFixed(1)} ${getCompareSymbol(stats.user.mean, stats.global.mean)} [${stats.global.mean.toFixed(1)}]`,
        `中位数: ${stats.user.median.toFixed(1)}  [${stats.user.min}~${stats.user.max}]`,
        `标准差: ${stats.user.stdDev.toFixed(1)} ${getCompareSymbol(stats.user.stdDev, stats.global.stdDev)} [${stats.global.stdDev.toFixed(1)}]`,
        `——近期记录——`
      ];
      if (stats.user.recentScores && stats.user.recentScores.length > 0) {
        for (let i = 0; i < stats.user.recentScores.length; i += 5) {
          msg.push(stats.user.recentScores.slice(i, i + 5).map(s => s.toString().padStart(2)).join(' | '));
        }
      }
      return msg.join('\n');
    });
  jrrp.subcommand('.clear', '清除人品数据', { authority: 4 })
    .usage('清除人品数据')
    .option('user', '-u <userId> 指定用户ID')
    .option('date', '-d <date> 指定日期')
    .action(async ({ options }) => {
      const { user: userId, date: dateInput } = options;
      let dateStr: string;
      if (dateInput) {
        const parsedDate = parseDate(dateInput);
        if (!parsedDate) return '日期格式不正确';
        dateStr = parsedDate.toISOString().slice(0, 10);
      }
      const count = await store.clearData(userId, dateStr);
      const target = [userId && `用户:${userId}`, dateStr && `日期:${dateInput}`].filter(Boolean).join('、') || '全部';
      return `成功删除了${target}的${count}条记录`;
    });
  if (config.enableCode && typeof config.enableCode === 'string') {
    const hashKeys = config.enableCode.split('|');
    if (hashKeys.length >= 6) {
      const codeStore = new CodeStore(ctx.baseDir, {
        key1: hashKeys[0], key2: hashKeys[1], key3: hashKeys[2],
        key4: hashKeys[3], key5: hashKeys[4], key6: hashKeys[5]
      });
      codeStore.registerCommands({
        checkUserId: async (session) => {
          if (!session.userId) { autoRecall(session, await session.send('无法获取用户信息')); return false }
          return true
        },
        autoRecall, parseDate, jrrp
      });
    }
  }
}