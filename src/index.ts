/**
 * @file 今日人品(JRRP)插件主文件
 * @description 提供今日人品计算、绑定识别码、查询特定分数日期等功能
 * @module best-jrrp
 */
import { Context, Schema, h } from 'koishi'
import { FileManager, JrrpCalculator, ExpressionGenerator, UserManager, JrrpUtils } from './Function'

export const name = 'best-jrrp'

/**
 * 用户数据接口
 * @interface UserData
 * @property {string} [identification_code] - 用户的识别码
 * @property {boolean} perfect_score - 是否已获得过满分
 */
export interface UserData {
  identification_code?: string
  perfect_score: boolean
}

/**
 * 插件配置接口
 */
export const enum JrrpAlgorithm {
  BASIC = 'basic',
  GAUSSIAN = 'gaussian',
  LINEAR = 'linear'
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
  displayMode?: DisplayMode
  baseNumber?: number
}

/**
 * JRRP算法基本配置
 * @interface Config
 */
export interface Config {
  choice: JrrpAlgorithm
  identificationCode: string
  fool: FoolConfig
  rangeMessages?: Record<string, string>
  specialMessages?: Record<number, string>
  holidayMessages?: Record<string, string>
}

/**
 * 插件配置Schema定义
 * @const Config
 */
export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    choice: Schema.union([
      Schema.const(JrrpAlgorithm.BASIC),
      Schema.const(JrrpAlgorithm.GAUSSIAN),
      Schema.const(JrrpAlgorithm.LINEAR),
    ]).default(JrrpAlgorithm.BASIC),
    identificationCode: Schema.string().default('CODE').role('secret'),
    fool: Schema.intersect([
      Schema.object({
        type: Schema.union([FoolMode.DISABLED, FoolMode.ENABLED]),
      }).default({ type: FoolMode.DISABLED }),
      Schema.union([
        Schema.object({
          type: Schema.const(FoolMode.DISABLED),
        }),
        Schema.intersect([
          Schema.object({
            type: Schema.const(FoolMode.ENABLED).required(),
            date: Schema.string().default('4-1'),
          }),
          Schema.intersect([
            Schema.object({
              displayMode: Schema.union([DisplayMode.BINARY, DisplayMode.EXPRESSION]),
            }).default({ displayMode: DisplayMode.BINARY }),
            Schema.union([
              Schema.object({
                displayMode: Schema.const(DisplayMode.BINARY),
              }),
              Schema.object({
                displayMode: Schema.const(DisplayMode.EXPRESSION).required(),
                baseNumber: Schema.number().default(6).min(1).max(9),
              }),
            ]),
          ]),
        ]),
      ]),
    ]),
    rangeMessages: Schema.dict(String).default({
      '0-10': 'commands.jrrp.messages.range.1',
      '11-19': 'commands.jrrp.messages.range.2',
      '20-39': 'commands.jrrp.messages.range.3',
      '40-49': 'commands.jrrp.messages.range.4',
      '50-64': 'commands.jrrp.messages.range.5',
      '65-89': 'commands.jrrp.messages.range.6',
      '90-97': 'commands.jrrp.messages.range.7',
      '98-100': 'commands.jrrp.messages.range.8'
    }),
    specialMessages: Schema.dict(String).default({
      0: 'commands.jrrp.messages.special.1',
      50: 'commands.jrrp.messages.special.2',
      100: 'commands.jrrp.messages.special.3'
    }),
    holidayMessages: Schema.dict(String).default({
      '01-01': 'commands.jrrp.messages.date.1',
      '12-25': 'commands.jrrp.messages.date.2'
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
  const fileManager = new FileManager(ctx.baseDir)
  const userManager = new UserManager(fileManager)
  const expressionGenerator = new ExpressionGenerator()
  const logger = ctx.logger('best-jrrp')

  try {
    JrrpUtils.validateRangeMessages(config.rangeMessages)
  } catch (error) {
    logger.error(`配置验证失败: ${error.message}`)
    throw error
  }

  ctx.i18n.define('zh-CN', require('./locales/zh-CN'))
  ctx.i18n.define('en-US', require('./locales/en-US'))

  /**
   * 计算用户的运势分数
   * @param {string} userDateSeed - 用户日期种子
   * @param {Date} date - 计算日期
   * @param {string} [identificationCode] - 用户识别码
   * @returns {number} 计算得出的分数(0-100)
   */
  function calculateScore(userDateSeed: string, date: Date, identificationCode?: string): number {
    if (identificationCode) {
      return JrrpCalculator.calculateJrrpWithCode(identificationCode, date, config.identificationCode)
    } else {
      switch (config.choice) {
        case JrrpAlgorithm.GAUSSIAN: {
          const normalRandom = (seed: string): number => {
            const hash = JrrpUtils.hashCode(seed)
            const randomFactor = Math.sin(hash) * 10000
            return randomFactor - Math.floor(randomFactor)
          }

          const toNormalLuck = (random: number): number => {
            const u1 = random
            const u2 = normalRandom(random.toString())
            const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2)
            return Math.min(100, Math.max(0, Math.round(z * 15 + 50)))
          }

          const dateWeight = (date.getDay() + 1) / 7
          const baseRandom = normalRandom(userDateSeed)
          const weightedRandom = (baseRandom + dateWeight) / 2
          return toNormalLuck(weightedRandom)
        }
        case JrrpAlgorithm.LINEAR: {
          const lcgSeed = JrrpUtils.hashCode(userDateSeed)
          return Math.floor(((lcgSeed * 9301 + 49297) % 233280) / 233280 * 101)
        }
        case JrrpAlgorithm.BASIC:
        default: {
          return Math.abs(JrrpUtils.hashCode(userDateSeed)) % 101
        }
      }
    }
  }

  /**
   * 获取适用于用户分数的消息
   * @param {number} score - 用户分数
   * @param {string} monthDay - 月日字符串 (MM-DD)
   * @param {any} session - 会话上下文
   * @returns {string} 消息文本
   */
  function getScoreMessage(score: number, monthDay: string, session: any): string {
    let message = ''

    // 检查特殊分数
    if (config.specialMessages?.[score]) {
      message = session.text(config.specialMessages[score])
    } else {
      // 检查分数区间
      for (const [range, msgKey] of Object.entries(config.rangeMessages || {})) {
        const [min, max] = range.split('-').map(Number)
        if (score >= min && score <= max) {
          message = session.text(msgKey)
          break
        }
      }
    }
    // 添加节日消息
    if (config.holidayMessages?.[monthDay]) {
      message += '\n' + session.text(config.holidayMessages[monthDay])
    }

    return message
  }

  /**
   * 格式化JRRP结果消息
   * @param {any} session - 会话上下文
   * @param {Date} dateForCalculation - 计算用的日期
   * @param {Config} config - 插件配置
   * @param {boolean} skipConfirm - 是否跳过零分确认
   * @returns {Promise<string|null>} 格式化后的消息文本
   */
  async function formatJrrpMessage(
    session: any,
    dateForCalculation: Date,
    config: Config,
    skipConfirm = false
  ): Promise<string | null> {
    try {
      const monthDay = JrrpUtils.formatMonthDay(dateForCalculation)
      const userDateSeed = `${session.userId}-${dateForCalculation.getFullYear()}-${monthDay}`
      const identificationCode = await userManager.getIdentificationCode(session.userId)
      const userFortune = calculateScore(userDateSeed, dateForCalculation, identificationCode)
      // 零分确认检查
      if (!skipConfirm && identificationCode && userFortune === 0) {
        return null
      }
      // 格式化分数显示
      const formattedFortune = expressionGenerator.formatScore(userFortune, dateForCalculation, config.fool)
      let fortuneResultText = h('at', { id: session.userId }) +
        `${session.text('commands.jrrp.messages.result', [formattedFortune])}`
      // 添加额外消息
      if (identificationCode && userFortune === 100 && await userManager.isPerfectScoreFirst(session.userId)) {
        await userManager.markPerfectScore(session.userId)
        fortuneResultText += session.text(config.specialMessages[userFortune]) +
          '\n' + session.text('commands.jrrp.messages.identification_mode.perfect_score_first')
      } else {
        fortuneResultText += getScoreMessage(userFortune, monthDay, session)
      }

      return fortuneResultText
    } catch (error) {
      return session.text('commands.jrrp.messages.error')
    }
  }

  /**
   * 处理零分确认
   * @param {any} session - 会话上下文
   * @param {Date} dateForCalculation - 计算用的日期
   * @returns {Promise<string|null>} 处理后的结果消息
   */
  async function handleZeroConfirmation(session: any, dateForCalculation: Date): Promise<string|null> {
    await session.send(session.text('commands.jrrp.messages.identification_mode.zero_prompt'))

    try {
      const response = await session.prompt(10000)
      if (!response || response.toLowerCase() !== 'y') {
        const message = await session.send(session.text('commands.jrrp.messages.cancel'))
        await JrrpUtils.autoRecall(session, message)
        return null
      }
      return await formatJrrpMessage(session, dateForCalculation, config, true)
    } catch (error) {
      return session.text('commands.jrrp.messages.error')
    }
  }

  const jrrp = ctx.command('jrrp')
    .action(async ({ session }) => {
      try {
        const dateForCalculation = new Date()
        const monthDay = JrrpUtils.formatMonthDay(dateForCalculation)
        // 处理节日消息
        if (config.holidayMessages?.[monthDay]) {
          const holidayMessage = session.text(config.holidayMessages[monthDay])
          const promptMessage = await session.send(holidayMessage + '\n' + session.text('commands.jrrp.messages.prompt'))
          await JrrpUtils.autoRecall(session, promptMessage)

          const response = await session.prompt(10000)
          if (!response) {
            await session.send(session.text('commands.jrrp.messages.cancel'))
            return
          }
        }
        // 获取JRRP结果
        let fortuneResultText = await formatJrrpMessage(session, dateForCalculation, config, false)
        // 处理零分确认
        if (fortuneResultText === null) {
          fortuneResultText = await handleZeroConfirmation(session, dateForCalculation)
        }
        if (fortuneResultText) {
          await session.send(fortuneResultText)
        }
      } catch (error) {
        const message = await session.send(session.text('commands.jrrp.messages.error'))
        await JrrpUtils.autoRecall(session, message)
      }
    })

  // 日期子命令
  jrrp.subcommand('.date <date:text>')
    .usage('输入日期格式：YYYY-MM-DD 或 MM-DD')
    .action(async ({ session }, date) => {
      if (!date?.trim()) {
        const message = await session.send(session.text('commands.jrrp.errors.invalid_date'))
        await JrrpUtils.autoRecall(session, message)
        return
      }

      const dateForCalculation = JrrpUtils.parseDate(date, new Date())
      if (!dateForCalculation) {
        const message = await session.send(session.text('commands.jrrp.errors.invalid_date'))
        await JrrpUtils.autoRecall(session, message)
        return
      }

      try {
        let fortuneResultText = await formatJrrpMessage(session, dateForCalculation, config, false)
        // 处理零分确认
        if (fortuneResultText === null) {
          fortuneResultText = await handleZeroConfirmation(session, dateForCalculation)
        }

        if (fortuneResultText) {
          await session.send(fortuneResultText)
        }
      } catch (error) {
        const message = await session.send(session.text('commands.jrrp.messages.error'))
        await JrrpUtils.autoRecall(session, message)
      }
    })

  jrrp.subcommand('.bind [code:string]')
    .action(async ({ session }, code) => {
      try {
        if (session.messageId) {
          await JrrpUtils.autoRecall(session, session.messageId, 500)
        }

        let responseText: string
        if (!code?.trim()) {
          await userManager.removeIdentificationCode(session.userId)
          responseText = session.text('commands.jrrp.messages.identification_mode.unbind_success')
        } else {
          const existingCode = await userManager.getIdentificationCode(session.userId)
          const formattedCode = code.trim().toUpperCase()

          if (existingCode === formattedCode) {
            responseText = session.text('commands.jrrp.messages.identification_mode.already_bound')
          } else if (await userManager.bindIdentificationCode(session.userId, formattedCode)) {
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
        await JrrpUtils.autoRecall(session, message)
      } catch (error) {
        console.error('Failed to handle identification code:', error)
        const message = await session.send(session.text('commands.jrrp.messages.error'))
        await JrrpUtils.autoRecall(session, message)
      }
    })

  jrrp.subcommand('.score <score:number>')
    .action(async ({ session }, score) => {
      if (score < 0 || score > 100) {
        const message = await session.send(session.text('commands.jrrp.messages.invalid_number'));
        await JrrpUtils.autoRecall(session, message);
        return;
      }

      const identificationCode = await userManager.getIdentificationCode(session.userId);
      const currentDate = new Date();

      for (let daysAhead = 1; daysAhead <= 365; daysAhead++) {
        const futureDate = new Date(currentDate);
        futureDate.setDate(currentDate.getDate() + daysAhead);

        const dateStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;
        const userDateSeed = `${session.userId}-${dateStr}`;
        const calculatedScore = calculateScore(userDateSeed, futureDate, identificationCode);

        if (calculatedScore === score) {
          const formattedDate = `${futureDate.getFullYear().toString().slice(-2)}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;
          await session.send(session.text('commands.jrrp.messages.found_date', [score, formattedDate]));
          return;
        }
      }

      await session.send(session.text('commands.jrrp.messages.not_found', [score]));
    })
}
