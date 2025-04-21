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
        // 使用正则判断条件类型并添加到相应的映射中
        if (/^\d{1,2}-\d{1,2}$/.test(condition)) {
          // 日期特殊消息
          const messages = this.dateSpecialMsgsMap.get(condition) || []
          messages.push(msg)
          this.dateSpecialMsgsMap.set(condition, messages)
        } else if (/^\d+$/.test(condition)) {
          // 分数特殊消息
          const score = Number(condition)
          if (!isNaN(score)) {
            const messages = this.scoreSpecialMsgsMap.get(score) || []
            messages.push(msg)
            this.scoreSpecialMsgsMap.set(score, messages)
          }
        }
      }
    }
    // 处理区间消息
    if (this.config.rangeMessages?.length && this.config.enableRange) {
      this.rangesCache = Array(101).fill(null).map(() => [])
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
   * 构建JRRP结果消息
   * @param score 今日人品分数
   * @param userId 用户ID
   * @param username 用户名
   * @returns 格式化后的消息字符串
   */
  build(score: number, userId: string, username: string): string {
    const today = new Date()
    const todayStr = `${today.getMonth() + 1}-${today.getDate()}`
    const formattedScore = this.formatScore(score, todayStr)
    // 仅在需要时获取消息内容
    const message = this.config.template.includes('{message}')
      ? this.getMessage(score, todayStr).replace(/\\n/g, '\n')
      : '';
    // 构建最终消息
    const replacements = {
      '{at}': `<at id="${userId}"/>`,
      '{username}': username,
      '{score}': formattedScore,
      '{message}': message,
      '\\n': '\n'
    }
    let result = this.config.template || ''
    // 应用替换
    Object.entries(replacements).forEach(([pattern, replacement]) => {
      result = result.replace(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement)
    })
    // 处理图片占位符
    return result.replace(/{image:([^}]+)}/g, (_, url) => `<image url="${url}"/>`)
  }

  /**
   * 按优先级获取消息内容
   * @param score 分数
   * @param date 日期字符串
   * @returns 消息文本
   */
  private getMessage(score: number, date: string): string {
    if (this.config.enableSpecial) {
      // 日期特殊消息
      const dateMessages = this.dateSpecialMsgsMap.get(date)
      if (dateMessages?.length) {
        return this.getRandomMessage(dateMessages)
      }
      // 分数特殊消息
      const scoreMessages = this.scoreSpecialMsgsMap.get(score)
      if (scoreMessages?.length) {
        return this.getRandomMessage(scoreMessages)
      }
    }
    // 区间消息
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
    // 快速返回普通格式
    if (!enabled || (date && todayStr !== date)) {
      return score.toString()
    }
    // 使用特殊格式
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