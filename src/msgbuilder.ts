import { RangeMessage, SpecialMessage } from './index'
import { expressions } from './expressions'

/**
 * 分数显示格式的类型定义
 * - binary: 二进制格式
 * - octal: 八进制格式
 * - hex: 十六进制格式
 * - simple: 简单表达式格式
 * - complex: 复杂表达式格式
 */
export type ScoreDisplayFormat = 'binary' | 'octal' | 'hex' | 'simple' | 'complex';

/**
 * 分数显示配置接口
 */
interface ScoreDisplayConfig {
  /** 是否启用特殊显示格式 */
  enabled: boolean
  /** 特定日期（格式：MM-DD），若指定，则只在该日期使用特殊格式 */
  date?: string
  /** 显示模式 */
  mode?: ScoreDisplayFormat
}

/**
 * 消息配置接口
 */
interface MsgConfig {
  /** 区间消息数组 */
  rangeMessages: Array<RangeMessage>
  /** 特殊消息数组 */
  specialMessages?: Array<SpecialMessage>
  /** 消息模板 */
  template: string
  /** 分数显示配置 */
  display: ScoreDisplayConfig
  /** 是否启用区间消息 */
  enableRange: boolean
  /** 是否启用特殊消息 */
  enableSpecial: boolean
}

/**
 * 消息构建器类，用于构建JRRP结果消息
 */
export class MsgBuilder {
  private config: MsgConfig
  private dateSpecialMsgsMap = new Map<string, SpecialMessage[]>()
  private scoreSpecialMsgsMap = new Map<number, SpecialMessage[]>()
  private rangesCache: RangeMessage[][] = []

  /**
   * 创建消息构建器实例
   * @param config 消息配置
   */
  constructor(config: MsgConfig) {
    this.config = config
    this.initializeCache()
  }

  /**
   * 初始化缓存数据
   */
  private initializeCache(): void {
    // 处理特殊消息
    if (this.config.specialMessages?.length && this.config.enableSpecial) {
      for (const msg of this.config.specialMessages) {
        const condition = String(msg.condition)
        if (/^\d{1,2}-\d{1,2}$/.test(condition)) {
          // 日期特殊消息
          this.dateSpecialMsgsMap.set(
            condition,
            [...(this.dateSpecialMsgsMap.get(condition) || []), msg]
          )
        } else if (/^\d+$/.test(condition)) {
          // 分数特殊消息
          const score = parseInt(condition, 10)
          this.scoreSpecialMsgsMap.set(
            score,
            [...(this.scoreSpecialMsgsMap.get(score) || []), msg]
          )
        }
      }
    }
    // 处理区间消息
    if (this.config.rangeMessages?.length && this.config.enableRange) {
      // 初始化区间缓存数组
      this.rangesCache = Array.from({ length: 101 }, () => [])
      // 填充区间消息缓存
      for (const range of this.config.rangeMessages) {
        const min = Math.max(0, range.min)
        const max = Math.min(100, range.max)
        for (let i = min; i <= max; i++) {
          this.rangesCache[i].push(range)
        }
      }
    }
  }

  /**
   * 获取一言内容
   * @param params 一言参数，直接拼接到API URL
   * @returns 一言内容，包含出处和作者
   */
  private async getHitokoto(params?: string): Promise<string> {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)
      const url = `https://v1.hitokoto.cn/${params ? `?${params}` : ''}`
      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)
      if (!response.ok) return ''
      const data = await response.json()
      if (!data?.hitokoto) return ''
      // 没有来源直接返回一言
      if (!data.from) return data.hitokoto
      // 处理引用部分
      const showAuthor = data.from_who && data.from_who !== data.from
      const citation = `——${showAuthor ? ` ${data.from_who}` : ''}《${data.from}》`
      // 计算字符宽度
      const getTextWidth = (text: string) => [...text].reduce((width, char) =>
        width + (/[\u4e00-\u9fa5\u3000-\u30ff\u3130-\u318f\uac00-\ud7af]/.test(char) ? 2 : 1), 0)
      const contentWidth = getTextWidth(data.hitokoto)
      const citationWidth = getTextWidth(citation)
      const maxWidth = 36
      const referenceWidth = Math.min(contentWidth, maxWidth)
      const spacesNeeded = Math.max(0, referenceWidth - citationWidth)
      return `${data.hitokoto}\n${' '.repeat(spacesNeeded)}${citation}`
    } catch {
      return ''
    }
  }

  /**
   * 构建JRRP结果消息
   * @param score 今日人品分数
   * @param userId 用户ID
   * @param username 用户名
   * @returns 格式化后的消息字符串
   */
  async build(score: number, userId: string, username: string): Promise<string> {
    const todayStr = `${new Date().getMonth() + 1}-${new Date().getDate()}`
    const formattedScore = this.formatScore(score, todayStr)
    let template = this.config.template || ''
    // 只在需要时获取消息
    const message = template.includes('{message}')
      ? this.getMessage(score, todayStr).replace(/\\n/g, '\n')
      : ''
    // 处理一言占位符
    if (template.includes('{hitokoto')) {
      template = await this.replaceHitokotoPlaceholders(template)
    }
    // 一次性替换所有占位符
    return template
      .replace(/{at}/g, `<at id="${userId}"/>`)
      .replace(/{username}/g, username)
      .replace(/{score}/g, formattedScore)
      .replace(/{message}/g, message)
      .replace(/\\n/g, '\n')
      .replace(/{image:([^}]+)}/g, '<image url="$1"/>')
  }

  /**
   * 替换所有一言占位符
   * @param template 模板字符串
   * @returns 替换后的字符串
   */
  private async replaceHitokotoPlaceholders(template: string): Promise<string> {
    const matches = [...template.matchAll(/{hitokoto(?::([^}]*))?}/g)]
    if (!matches.length) return template
    const replacements = await Promise.all(
      matches.map(match =>
        this.getHitokoto(match[1] || '')
          .then(content => ({ pattern: match[0], content }))
      )
    )
    return replacements.reduce(
      (result, { pattern, content }) => result.replace(pattern, content),
      template
    )
  }

  /**
   * 按优先级获取消息内容
   * @param score 分数
   * @param date 日期字符串
   * @returns 消息文本
   */
  private getMessage(score: number, date: string): string {
    if (this.config.enableSpecial) {
      // 优先检查日期特殊消息
      const dateMessages = this.dateSpecialMsgsMap.get(date)
      if (dateMessages?.length) {
        return this.getRandomMessage(dateMessages)
      }
      // 然后检查分数特殊消息
      const scoreMessages = this.scoreSpecialMsgsMap.get(score)
      if (scoreMessages?.length) {
        return this.getRandomMessage(scoreMessages)
      }
    }
    // 最后检查区间消息
    if (this.config.enableRange && score >= 0 && score <= 100) {
      const rangeMessages = this.rangesCache[score]
      if (rangeMessages?.length) {
        return this.getRandomMessage(rangeMessages)
      }
    }
    return ''
  }

  /**
   * 从消息数组中随机选择一条
   */
  private getRandomMessage(messages: Array<SpecialMessage | RangeMessage>): string {
    return messages[Math.floor(Math.random() * messages.length)].message
  }

  /**
   * 格式化分数显示
   * @param score 分数
   * @param todayStr 今日日期字符串
   * @returns 格式化后的分数字符串
   */
  private formatScore(score: number, todayStr: string): string {
    const { enabled, date, mode } = this.config.display
    // 不启用特殊格式或不是指定日期时返回普通格式
    if (!enabled || (date && todayStr !== date)) {
      return score.toString()
    }
    switch (mode) {
      case 'binary': return score.toString(2)
      case 'octal': return score.toString(8)
      case 'hex': return score.toString(16).toUpperCase()
      case 'simple':
      case 'complex': {
        const exprList = (mode === 'simple' ? expressions.simple : expressions.complex)[score]
        return exprList?.length
          ? exprList[Math.floor(Math.random() * exprList.length)]
          : score.toString()
      }
      default: return score.toString()
    }
  }
}