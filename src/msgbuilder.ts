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
 * @interface ScoreDisplayConfig
 * @property {boolean} enabled 是否启用特殊显示格式
 * @property {string} [date] 特定日期（格式：MM-DD），若指定，则只在该日期使用特殊格式
 * @property {ScoreDisplayFormat} [mode] 显示模式
 */
interface ScoreDisplayConfig {
  enabled: boolean
  date?: string
  mode?: ScoreDisplayFormat
}

// Pixiv配置接口
interface PixivConfig {
  imagesUrl?: string
  baseDir?: string
  logger?: any
}

/**
 * 消息配置接口
 * @interface MsgConfig
 * @property {Array<RangeMessage>} rangeMessages 区间消息数组
 * @property {Array<SpecialMessage>} [specialMessages] 特殊消息数组
 * @property {string} template 消息模板
 * @property {ScoreDisplayConfig} display 分数显示配置
 * @property {boolean} enableRange 是否启用区间消息
 * @property {boolean} enableSpecial 是否启用特殊消息
 */
interface MsgConfig {
  rangeMessages: Array<RangeMessage>
  specialMessages?: Array<SpecialMessage>
  template: string
  display: ScoreDisplayConfig
  enableRange: boolean
  enableSpecial: boolean
}

/**
 * 消息构建器类，用于构建JRRP结果消息
 * @class MsgBuilder
 */
export class MsgBuilder {
  private config: MsgConfig
  private dateSpecialMsgsMap = new Map<string, SpecialMessage[]>()
  private scoreSpecialMsgsMap = new Map<number, SpecialMessage[]>()
  private rangesCache: RangeMessage[][] = []
  private pixivConfig: PixivConfig

  /**
   * 创建消息构建器实例
   * @param {MsgConfig} config 消息配置
   * @param {PixivConfig} [pixivConfig] Pixiv配置
   */
  constructor(config: MsgConfig, pixivConfig?: PixivConfig) {
    this.config = config
    this.pixivConfig = pixivConfig || {}
    this.initializeCache()
  }

  /**
   * 初始化缓存数据
   * @private
   */
  private initializeCache(): void {
    // 处理特殊消息
    if (this.config.specialMessages?.length && this.config.enableSpecial) {
      for (const msg of this.config.specialMessages) {
        const condition = String(msg.condition)
        if (/^\d{1,2}-\d{1,2}$/.test(condition)) {
          // 日期特殊消息
          const msgs = this.dateSpecialMsgsMap.get(condition) || []
          msgs.push(msg)
          this.dateSpecialMsgsMap.set(condition, msgs)
        } else if (/^\d+$/.test(condition)) {
          // 分数特殊消息
          const score = parseInt(condition, 10)
          const msgs = this.scoreSpecialMsgsMap.get(score) || []
          msgs.push(msg)
          this.scoreSpecialMsgsMap.set(score, msgs)
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
   * @private
   * @param {string} [params] 一言参数，直接拼接到API URL
   * @returns {Promise<string>} 一言内容，包含出处和作者
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
      if (!data.from) return data.hitokoto
      const citation = `——${data.from_who && data.from_who !== data.from ? ` ${data.from_who}` : ''}《${data.from}》`
      const getTextWidth = (text: string) => [...text].reduce((w, c) => w + (/[\u4e00-\u9fa5\u3000-\u30ff\u3130-\u318f\uac00-\ud7af]/.test(c) ? 2 : 1), 0)
      const spacesNeeded = Math.max(0, Math.min(getTextWidth(data.hitokoto), 36) - getTextWidth(citation))
      return `${data.hitokoto}\n${' '.repeat(spacesNeeded)}${citation}`
    } catch { return '' }
  }

  /**
   * 获取Pixiv图片链接数组（本地无则自动下载）
   */
  private async getPixivLinks(): Promise<string[]> {
    const { baseDir = process.cwd(), imagesUrl, logger = console } = this.pixivConfig
    if (!imagesUrl) return []
    const { resolve } = await import('path')
    const { existsSync } = await import('fs')
    const { readFile, writeFile } = await import('fs/promises')
    const filePath = resolve(baseDir, 'data', 'pixiv.json')
    if (!existsSync(filePath)) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 30000)
        const res = await fetch(imagesUrl, { signal: controller.signal })
        clearTimeout(timeout)
        if (!res.ok) throw new Error(`下载失败: ${res.status}`)
        await writeFile(filePath, await res.text(), 'utf8')
      } catch (e) {
        logger.error('下载JSON文件失败:', e)
        return []
      }
    }
    try {
      const arr = JSON.parse(await readFile(filePath, 'utf8'))
      return Array.isArray(arr) ? arr : []
    } catch (e) {
      logger.error('读取链接失败:', e)
      return []
    }
  }

  /**
   * 构建JRRP结果消息
   * @param {number} score 今日人品分数
   * @param {string} userId 用户ID
   * @param {string} username 用户名
   * @returns {Promise<string|string[]>} 格式化后的消息字符串或消息队列
   */
  async build(score: number, userId: string, username: string): Promise<string | string[]> {
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
    // 处理pixiv占位符
    if (template.includes('{pixiv}')) {
      template = await this.replacePixivPlaceholders(template)
    }
    // 一次性替换所有占位符
    let result = template
      .replace(/{at}/g, `<at id="${userId}"/>`)
      .replace(/{username}/g, username)
      .replace(/{score}/g, formattedScore)
      .replace(/{message}/g, message)
      .replace(/{image:([^}]+)}/g, '<image url="$1"/>')
    if (result.includes('{~}')) {
      return result.split('{~}').map(s => s.trim()).filter(Boolean)
    }
    return result
  }

  /**
   * 替换所有一言占位符
   * @private
   * @param {string} template 模板字符串
   * @returns {Promise<string>} 替换后的字符串
   */
  private async replaceHitokotoPlaceholders(template: string): Promise<string> {
    const matches = [...template.matchAll(/{hitokoto(?::([^}]*))?}/g)]
    if (!matches.length) return template
    const replacements = await Promise.all(
      matches.map(match => this.getHitokoto(match[1] || '').then(content => ({ pattern: match[0], content })))
    )
    return replacements.reduce((result, { pattern, content }) => result.replace(pattern, content), template)
  }

  /**
   * 替换所有Pixiv占位符
   * @private
   * @param {string} template 模板字符串
   * @returns {Promise<string>} 替换后的字符串
   */
  private async replacePixivPlaceholders(template: string): Promise<string> {
    const matches = [...template.matchAll(/{pixiv}/g)]
    if (!matches.length) return template
    const arr = await this.getPixivLinks()
    const replacements = await Promise.all(matches.map(async m => {
      let content = ''
      if (Array.isArray(arr) && arr.length) {
        const candidate = arr[Math.floor(Math.random() * arr.length)]
        try {
          const res = await fetch(candidate, { headers: { 'Referer': 'https://www.pixiv.net/' } })
          if (res.ok) {
            const buffer = Buffer.from(await res.arrayBuffer())
            const ext = candidate.split('.').pop()?.toLowerCase() || 'jpg'
            const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg'
            content = `<image src="base64://${buffer.toString('base64')}" type="${mime}"/>`
          }
        } catch (e) {
          this.pixivConfig.logger.error('图片发送失败:', e)
        }
      }
      return { pattern: m[0], content }
    }))
    return replacements.reduce((result, { pattern, content }) => result.replace(pattern, content), template)
  }

  /**
   * 按优先级获取消息内容
   * @private
   * @param {number} score 分数
   * @param {string} date 日期字符串
   * @returns {string} 消息文本
   */
  private getMessage(score: number, date: string): string {
    if (this.config.enableSpecial) {
      const dateMessages = this.dateSpecialMsgsMap.get(date)
      if (dateMessages?.length) return dateMessages[Math.random() * dateMessages.length | 0].message
      const scoreMessages = this.scoreSpecialMsgsMap.get(score)
      if (scoreMessages?.length) return scoreMessages[Math.random() * scoreMessages.length | 0].message
    }
    if (this.config.enableRange && score >= 0 && score <= 100) {
      const rangeMessages = this.rangesCache[score]
      if (rangeMessages?.length) return rangeMessages[Math.random() * rangeMessages.length | 0].message
    }
    return ''
  }

  /**
   * 格式化分数显示
   * @private
   * @param {number} score 分数
   * @param {string} todayStr 今日日期字符串
   * @returns {string} 格式化后的分数字符串
   */
  private formatScore(score: number, todayStr: string): string {
    const { enabled, date, mode } = this.config.display
    if (!enabled || (date && todayStr !== date)) return score.toString()
    switch (mode) {
      case 'binary': return score.toString(2)
      case 'octal': return score.toString(8)
      case 'hex': return score.toString(16).toUpperCase()
      case 'simple':
      case 'complex': {
        const exprList = (mode === 'simple' ? expressions.simple : expressions.complex)[score]
        return exprList?.length ? exprList[Math.random() * exprList.length | 0] : score.toString()
      }
      default: return score.toString()
    }
  }
}