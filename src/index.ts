import { Context, Schema } from 'koishi'
import { JrrpService } from './JrrpService'
import { JrrpCalculator } from './JrrpCalculator'

export const name = 'best-jrrp'

/**
 * 用户数据接口
 * @interface UserData
 * @property {string} [identification_code] - 用户的识别码
 * @property {boolean} perfect_score - 是否已获得过满分
 * @property {number} [randomScore] - Random.org API获取的分数
 * @property {string} [timestamp] - 分数获取的时间戳
 */
export interface UserData {
  identification_code?: string
  perfect_score: boolean
  randomScore?: number
  timestamp?: string
}

/**
 * 插件配置接口
 */
export const enum JrrpAlgorithm {
  BASIC = 'basic',
  GAUSSIAN = 'gaussian',
  LINEAR = 'linear',
  RANDOM_ORG = 'random_org'
}
export const enum FoolMode {
  DISABLED = 'disabled',
  ENABLED = 'enabled'
}
export const enum DisplayMode {
  BINARY = 'binary',
  EXPRESSION = 'expression'
}
export interface FoolConfig {
  type: FoolMode
  date?: string
  displayType?: DisplayMode
  baseNumber?: number
}

/**
 * JRRP算法基本配置
 * @interface Config
 */
export interface Config {
  algorithm: JrrpAlgorithm
  calCode: string
  displayMode: FoolMode
  displayDate?: string
  displayType?: DisplayMode
  baseNumber?: number
  range?: Record<string, string>
  number?: Record<number, string>
  date?: Record<string, string>
  randomOrgApi?: string
}

/**
 * 插件配置Schema定义
 * @const Config
 */
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    algorithm: Schema.union([
      Schema.const(JrrpAlgorithm.BASIC),
      Schema.const(JrrpAlgorithm.GAUSSIAN),
      Schema.const(JrrpAlgorithm.LINEAR),
      Schema.const(JrrpAlgorithm.RANDOM_ORG),
    ]).default(JrrpAlgorithm.BASIC),
    calCode: Schema.string().default('CODE').role('secret'),
    displayMode: Schema.union([FoolMode.DISABLED, FoolMode.ENABLED]).default(FoolMode.DISABLED),
  }).i18n({
    'zh-CN': require('./locales/zh-CN')._config,
    'en-US': require('./locales/en-US')._config,
  }),
  Schema.union([
    Schema.object({
      displayMode: Schema.const(FoolMode.DISABLED),
    }),
    Schema.intersect([
      Schema.object({
        displayMode: Schema.const(FoolMode.ENABLED).required(),
        displayDate: Schema.string().default('4-1'),
        displayType: Schema.union([DisplayMode.BINARY, DisplayMode.EXPRESSION]).default(DisplayMode.BINARY),
      }),
      Schema.union([
        Schema.object({
          displayType: Schema.const(DisplayMode.BINARY),
        }),
        Schema.object({
          displayType: Schema.const(DisplayMode.EXPRESSION).required(),
          baseNumber: Schema.number().default(6).min(1).max(9),
        }),
      ]),
    ]),
  ]).i18n({
    'zh-CN': require('./locales/zh-CN')._config,
    'en-US': require('./locales/en-US')._config,
  }),
  Schema.union([
    Schema.object({
      algorithm: Schema.union([
        Schema.const(JrrpAlgorithm.BASIC),
        Schema.const(JrrpAlgorithm.GAUSSIAN),
        Schema.const(JrrpAlgorithm.LINEAR),
      ]).hidden(),
    }),
    Schema.object({
      algorithm: Schema.const(JrrpAlgorithm.RANDOM_ORG).required(),
      randomOrgApi: Schema.string().role('secret'),
    }),
  ]).i18n({
    'zh-CN': require('./locales/zh-CN')._config,
    'en-US': require('./locales/en-US')._config,
  }),
  Schema.object({
    range: Schema.dict(String).default({
      '0-10': 'commands.jrrp.messages.range.1',
      '11-19': 'commands.jrrp.messages.range.2',
      '20-39': 'commands.jrrp.messages.range.3',
      '40-49': 'commands.jrrp.messages.range.4',
      '50-64': 'commands.jrrp.messages.range.5',
      '65-89': 'commands.jrrp.messages.range.6',
      '90-97': 'commands.jrrp.messages.range.7',
      '98-100': 'commands.jrrp.messages.range.8'
    }),
    number: Schema.dict(String).default({
      0: 'commands.jrrp.messages.number.1',
      50: 'commands.jrrp.messages.number.2',
      100: 'commands.jrrp.messages.number.3'
    }),
    date: Schema.dict(String).default({
      '01-01': 'commands.jrrp.messages.date.1',
      '04-01': 'commands.jrrp.messages.date.2',
      '12-25': 'commands.jrrp.messages.date.3'
    })
  }).i18n({
    'zh-CN': require('./locales/zh-CN')._config,
    'en-US': require('./locales/en-US')._config,
  }),
])

/**
 * 插件主函数
 * @param {Context} ctx - Koishi 上下文
 * @param {Config} config - 插件配置
 */
export async function apply(ctx: Context, config: Config) {
  const jrrpService = new JrrpService(ctx.baseDir, config)
  JrrpService.validateRangeMessages(config.range)

  ctx.i18n.define('zh-CN', require('./locales/zh-CN'))
  ctx.i18n.define('en-US', require('./locales/en-US'))

  const jrrp = ctx.command('jrrp')
    .action(async ({ session }) => {
      try {
        const dateForCalculation = new Date()
        const monthDay = JrrpService.formatMonthDay(dateForCalculation)
        // 处理节日消息
        if (config.date?.[monthDay]) {
          const holidayMessage = session.text(config.date[monthDay])
          const promptMessage = await session.send(holidayMessage + '\n' + session.text('commands.jrrp.messages.prompt'))
          await JrrpService.autoRecall(session, promptMessage)
          const response = await session.prompt(10000)
          if (!response) {
            await session.send(session.text('commands.jrrp.messages.cancel'))
            return
          }
        }
        let fortuneResultText = await jrrpService.formatJrrpMessage(session, dateForCalculation, false, false)
        // 处理零分确认
        if (fortuneResultText === null) {
          fortuneResultText = await jrrpService.handleZeroConfirmation(session, dateForCalculation)
        }
        if (fortuneResultText) {
          await session.send(fortuneResultText)
        }
        // 获取分数并记录
        const calCode = await jrrpService.getIdentificationCode(session.userId)
        let userFortune: number
        if (config.algorithm === JrrpAlgorithm.RANDOM_ORG && !calCode) {
        } else {
          // 手动记录分数
          if (calCode) {
            userFortune = JrrpCalculator.calculateJrrpWithCode(
              calCode,
              dateForCalculation,
              config.calCode
            )
          } else {
            const userDateSeed = `${session.userId}-${dateForCalculation.getFullYear()}-${JrrpService.formatMonthDay(dateForCalculation)}`
            userFortune = JrrpCalculator.calculateScoreWithAlgorithm(
              userDateSeed,
              dateForCalculation,
              config.algorithm === JrrpAlgorithm.RANDOM_ORG ? JrrpAlgorithm.BASIC : config.algorithm,
              null,
              config.calCode
            )
          }
          jrrpService.recordUserScore(session.userId, userFortune)
        }
      } catch (error) {
        const message = await session.send(session.text('commands.jrrp.messages.error'))
        await JrrpService.autoRecall(session, message)
      }
    })
  jrrp.subcommand('.date <date:text>')
    .action(async ({ session }, date) => {
      try {
        if (!date?.trim()) {
          const message = await session.send(session.text('commands.jrrp.errors.invalid_date'))
          await JrrpService.autoRecall(session, message)
          return
        }
        const dateForCalculation = JrrpService.parseDate(date, new Date())
        if (!dateForCalculation) {
          const message = await session.send(session.text('commands.jrrp.errors.invalid_date'))
          await JrrpService.autoRecall(session, message)
          return
        }
        let fortuneResultText = await jrrpService.formatJrrpMessage(session, dateForCalculation, false, true)
        // 处理零分确认
        if (fortuneResultText === null) {
          fortuneResultText = await jrrpService.handleZeroConfirmation(session, dateForCalculation)
        }
        if (fortuneResultText) {
          await session.send(fortuneResultText)
        }
      } catch (error) {
        const message = await session.send(session.text('commands.jrrp.messages.error'))
        await JrrpService.autoRecall(session, message)
      }
    })
  jrrp.subcommand('.score <score:number>')
    .action(async ({ session }, score) => {
      try {
        if (score < 0 || score > 100) {
          const message = await session.send(session.text('commands.jrrp.messages.invalid_number'));
          await JrrpService.autoRecall(session, message);
          return;
        }
        const calCode = await jrrpService.getIdentificationCode(session.userId);
        const currentDate = new Date();
        for (let daysAhead = 1; daysAhead <= 365; daysAhead++) {
          const futureDate = new Date(currentDate);
          futureDate.setDate(currentDate.getDate() + daysAhead);
          const dateStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;
          const userDateSeed = `${session.userId}-${dateStr}`;
          const calculatedScore = JrrpCalculator.calculateScoreWithAlgorithm(
            userDateSeed,
            futureDate,
            config.algorithm === JrrpAlgorithm.RANDOM_ORG ? JrrpAlgorithm.BASIC : config.algorithm,
            calCode,
            config.calCode
          );
          if (calculatedScore === score) {
            const formattedDate = `${futureDate.getFullYear().toString().slice(-2)}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;
            await session.send(session.text('commands.jrrp.messages.found_date', [score, formattedDate]));
            return;
          }
        }
        await session.send(session.text('commands.jrrp.messages.not_found', [score]));
      } catch (error) {
        const message = await session.send(session.text('commands.jrrp.messages.error'));
        await JrrpService.autoRecall(session, message);
      }
    })
  jrrp.subcommand('.rank')
    .action(async ({ session }) => {
      try {
        const rankings = jrrpService.getTodayRanking()
        const topTen = rankings.slice(0, 10)
        const totalUsers = jrrpService.getTodayUserCount()
        const userRank = jrrpService.getUserRank(session.userId)
        let response = `${session.text('commands.jrrp.messages.rank_title')}\n`
        // 显示前10名
        for (let i = 0; i < topTen.length; i++) {
          const user = topTen[i]
          const username = await session.bot.getUser(user.userId)
          const name = username.name || user.userId
          response += session.text('commands.jrrp.messages.rank_item', [i + 1, name, user.score]) + '\n'
        }
        // 显示用户自己的排名
        if (userRank !== -1) {
          response += session.text('commands.jrrp.messages.your_rank', [userRank, totalUsers])
        } else {
          response += session.text('commands.jrrp.messages.no_rank')
        }
        await session.send(response)
      } catch (error) {
        console.error('Failed to get rank:', error)
        const message = await session.send(session.text('commands.jrrp.messages.error'))
        await JrrpService.autoRecall(session, message)
      }
    })
  jrrp.subcommand('.bind [code:string]')
    .action(async ({ session }, code) => {
      try {
        if (session.messageId) {
          await JrrpService.autoRecall(session, session.messageId, 500)
        }
        let responseText: string
        if (!code?.trim()) {
          await jrrpService.removeIdentificationCode(session.userId)
          responseText = session.text('commands.jrrp.messages.identification_mode.unbind_success')
        } else {
          const existingCode = await jrrpService.getIdentificationCode(session.userId)
          const formattedCode = code.trim().toUpperCase()
          if (existingCode === formattedCode) {
            responseText = session.text('commands.jrrp.messages.identification_mode.already_bound')
          } else if (await jrrpService.bindIdentificationCode(session.userId, formattedCode)) {
            responseText = session.text(
              existingCode
                ? 'commands.jrrp.messages.identification_mode.rebind_success'
                : 'commands.jrrp.messages.identification_mode.bind_success'
            )
          } else {
            responseText = session.text('commands.jrrp.messages.identification_mode.invalid_code')
          }
        }
        const message = await session.send(responseText)
        await JrrpService.autoRecall(session, message)
      } catch (error) {
        console.error('Failed to handle identification code:', error)
        const message = await session.send(session.text('commands.jrrp.messages.error'))
        await JrrpService.autoRecall(session, message)
      }
    })
}
