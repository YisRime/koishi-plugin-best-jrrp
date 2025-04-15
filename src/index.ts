import { Context, Schema } from 'koishi'
import { JrrpService } from './JrrpService'

export const name = 'best-jrrp'

/**
 * 用户数据接口
 */
export interface UserData {
  name?: string
  randomScore?: number
  timestamp?: string
  perfect_score?: boolean
  identification_code?: string
  algorithm?: string
}

/**
 * 插件配置接口
 */
export const enum JrrpAlgorithm {
  BASIC = 'basic',
  GAUSSIAN = 'gaussian',
  LINEAR = 'linear',
  RANDOMORG = 'randomorg'
}
export const enum FoolMode {
  DISABLED = 'disabled',
  ENABLED = 'enabled'
}
export const enum DisplayMode {
  BINARY = 'binary',
  EXPRESSION = 'expression'
}
export const enum ExpressionType {
  SIMPLE = 'simple',
  COMPLEX = 'complex'
}
export interface FoolConfig {
  type: FoolMode
  date?: string
  displayType?: DisplayMode
  expressionType?: ExpressionType
}

/**
 * JRRP算法基本配置
 */
export interface Config {
  algorithm: JrrpAlgorithm
  calCode: string
  displayMode: FoolMode
  displayDate?: string
  displayType?: DisplayMode
  expressionType?: ExpressionType
  range?: Record<string, string>
  number?: Record<number, string>
  date?: Record<string, string>
  randomOrgApi?: string
}

/**
 * 插件配置Schema定义
 */
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    algorithm: Schema.union([
      Schema.const(JrrpAlgorithm.BASIC),
      Schema.const(JrrpAlgorithm.GAUSSIAN),
      Schema.const(JrrpAlgorithm.LINEAR),
      Schema.const(JrrpAlgorithm.RANDOMORG),
    ]).default(JrrpAlgorithm.BASIC),
    calCode: Schema.string().role('secret'),
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
          expressionType: Schema.union([ExpressionType.SIMPLE, ExpressionType.COMPLEX]).default(ExpressionType.SIMPLE),
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
      algorithm: Schema.const(JrrpAlgorithm.RANDOMORG).required(),
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

async function processJrrpCommand(
  session: any,
  jrrpService: JrrpService,
  config: Config,
  dateForCalculation: Date,
  isDateCommand = false
): Promise<void> {
  try {
    // 异步获取用户名
    const userNamePromise = session.bot.getUser(session.userId).then(info => info?.name).catch(() => null)
    // 计算结果
    let fortuneResult = await jrrpService.formatJrrpMessage(session, dateForCalculation, false, isDateCommand)
    // 处理零分确认
    if (fortuneResult.message === null && fortuneResult.score === 0 && config.calCode) {
      fortuneResult = await jrrpService.handleZeroConfirmation(session, dateForCalculation)
    }
    // 显示结果消息
    if (fortuneResult.message) {
      await session.send(fortuneResult.message)
    }
    // 记录当天数据
    const isCurrentDay = dateForCalculation.toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA')
    if (isCurrentDay && !isDateCommand && fortuneResult.score >= 0) {
      const userName = await userNamePromise
      jrrpService.recordUserScore(session.userId, fortuneResult.score, userName, fortuneResult.algorithm)
    }
  } catch (error) {
    const message = await session.send(session.text('commands.jrrp.messages.error'))
    await JrrpService.autoRecall(session, message)
  }
}

/**
 * 插件主函数
 */
export async function apply(ctx: Context, config: Config) {
  const jrrpService = new JrrpService(ctx.baseDir, config)
  JrrpService.validateRangeMessages(config.range)

  ctx.i18n.define('zh-CN', require('./locales/zh-CN'))
  ctx.i18n.define('en-US', require('./locales/en-US'))

  const jrrp = ctx.command('jrrp', '今日人品')
    .action(async ({ session }) => {
      const dateForCalculation = new Date()
      const monthDay = `${String(dateForCalculation.getMonth() + 1).padStart(2, '0')}-${String(dateForCalculation.getDate()).padStart(2, '0')}`
      // 处理节日消息
      if (config.date?.[monthDay]) {
        const messageParts = [
          config.date[monthDay] ? session.text(config.date[monthDay]) : '',
          session.text('commands.jrrp.messages.prompt')
        ]
        const promptMessage = await session.send(messageParts.filter(Boolean).join('\n'))
        await JrrpService.autoRecall(session, promptMessage)
        const response = await session.prompt(10000)
        if (!response) {
          await session.send(session.text('commands.jrrp.messages.cancel'))
          return
        }
      }
      await processJrrpCommand(session, jrrpService, config, dateForCalculation)
    })
  jrrp.subcommand('.date <date:text>', '查看指定日期人品')
    .action(async ({ session }, date) => {
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
      await processJrrpCommand(session, jrrpService, config, dateForCalculation, true)
    })
  jrrp.subcommand('.score <score:number>', '查找指定分数日期')
    .action(async ({ session }, score) => {
      try {
        if (score < 0 || score > 100) {
          const message = await session.send(session.text('commands.jrrp.messages.invalid_number'))
          await JrrpService.autoRecall(session, message)
          return
        }
        if (config.algorithm === JrrpAlgorithm.RANDOMORG) {
          const message = await session.send(session.text('commands.jrrp.messages.random_org_only_today'))
          await JrrpService.autoRecall(session, message)
          return
        }
        const calCode = config.calCode ? jrrpService['userData'][session.userId]?.identification_code : null
        const currentDate = new Date()
        for (let daysAhead = 1; daysAhead <= 3653; daysAhead++) {
          const futureDate = new Date(currentDate)
          futureDate.setDate(currentDate.getDate() + daysAhead)
          const dateStr = futureDate.toLocaleDateString('en-CA')
          const userDateSeed = `${session.userId}-${dateStr}`
          // 计算分数
          const calculatedScore = JrrpService.calculateScoreWithAlgorithm(
            userDateSeed,
            futureDate,
            config.algorithm,
            calCode,
            config.calCode
          )
          if (calculatedScore === score) {
            const formattedDate = `${futureDate.getFullYear().toString().slice(-2)}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`
            await session.send(session.text('commands.jrrp.messages.found_date', [score, formattedDate]))
            return
          }
        }
      } catch (error) {
        const message = await session.send(session.text('commands.jrrp.messages.error'))
        await JrrpService.autoRecall(session, message)
      }
    })
  jrrp.subcommand('.rank', '查看今日人品排行')
    .action(async ({ session }) => {
      try {
        const rankings = jrrpService.getTodayRanking()
        const topTen = rankings.slice(0, 10)
        const totalUsers = rankings.length
        const userRank = jrrpService.getUserRank(session.userId)
        const responseLines = [session.text('commands.jrrp.messages.rank_title')]
        // 显示前10名
        topTen.forEach((user, i) => {
          responseLines.push(session.text('commands.jrrp.messages.rank_item', [i + 1, user.name, user.score]))
        })
        // 显示用户排名
        responseLines.push(
          userRank !== -1
            ? session.text('commands.jrrp.messages.your_rank', [userRank, totalUsers])
            : session.text('commands.jrrp.messages.no_rank')
        )
        await session.send(responseLines.join('\n'))
      } catch (error) {
        const message = await session.send(session.text('commands.jrrp.messages.error'))
        await JrrpService.autoRecall(session, message)
      }
    })

  if (config.calCode) {
    jrrp.subcommand('.bind [code:string]', '绑定/解绑识别码')
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
            const existingCode = jrrpService['userData'][session.userId]?.identification_code
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
          const message = await session.send(session.text('commands.jrrp.messages.error'))
          await JrrpService.autoRecall(session, message)
        }
      })
  }
}