import { promises as fs } from 'fs'
import path from 'path'

/**
 * 用户识别码配置文件接口
 * @interface Profile
 * @property {string} code - 用户的识别码
 * @property {boolean} [unlocked] - 用户是否已解锁特殊主题
 */
interface Profile {
  code: string;
  unlocked?: boolean;
}

/**
 * 用户识别码映射表，键为用户ID
 * @typedef {Record<string, Profile>} ProfileMap
 */
type ProfileMap = Record<string, Profile>

/**
 * 人品值对应的消息区间配置
 * @interface ScoreMsg
 * @property {number} min - 区间最小值
 * @property {number} max - 区间最大值
 * @property {string} message - 对应区间的消息
 */
interface ScoreMsg {
  min: number
  max: number
  message: string
}

/**
 * 用于计算人品值的密钥
 * @interface SecKeys
 * @property {string} key - 密钥
 */
interface SecKeys {
  key1: string, key2: string, key3: string
  key4: string, key5: string, key6: string
}

/**
 * 识别码管理和人品值计算类
 * @class CodeStore
 */
export class CodeStore {
  /** @private 存储文件路径 */
  private storePath: string
  /** @private 计算人品值使用的密钥 */
  private secKeys: SecKeys
  /**
   * @private 不同分值区间对应的消息
   */
  private scoreMsgs: ScoreMsg[] = [
    { min: 0, max: 10, message: '……（是百分制哦）' },
    { min: 11, max: 19, message: '？！不会吧……' },
    { min: 20, max: 39, message: '！呜……' },
    { min: 40, max: 49, message: '！勉强还行吧……？' },
    { min: 50, max: 64, message: '！还行啦，还行啦。' },
    { min: 65, max: 89, message: '！今天运气不错呢！' },
    { min: 90, max: 97, message: '！好评如潮！' },
    { min: 98, max: 100, message: '！差点就到 100 了呢……' }
  ]

  /**
   * @private 特定人品值对应的特殊消息
   */
  private specialMsgs: Record<number, string> = {
    0: '？！',
    50: '！五五开……',
    100: '！100！100！！！！！'
  }

  /** @private 解锁特殊主题时显示的消息 */
  private unlockMsg = "隐藏主题 欧皇彩 已解锁！\n前往 PCL->更多->百宝箱->今日人品 确认"
  /** @private 获得0分时的警告消息 */
  private zeroWarning = "在查看结果前，请先同意以下附加使用条款：\n1. 我知晓并了解 PCL 的今日人品功能完全没有出 Bug。\n2. PCL 不对使用本软件所间接造成的一切财产损失（如砸电脑等）等负责。\n(y/n)"

  /**
   * 创建识别码管理实例
   * @constructor
   * @param {string} baseDir - 基础目录路径
   * @param {SecKeys} secKeys - 用于计算的密钥
   */
  constructor(baseDir: string, secKeys: SecKeys) {
    this.storePath = path.join(baseDir, 'data', 'jrrp-code.json')
    this.secKeys = secKeys
  }

  /**
   * 加载用户识别码数据
   * @private
   * @returns {Promise<ProfileMap>} 用户识别码映射表
   */
  private async load(): Promise<ProfileMap> {
    try {
      const data = await fs.readFile(this.storePath, 'utf-8')
      return JSON.parse(data) || {}
    } catch {
      return {}
    }
  }

  /**
   * 为用户关联识别码
   * @param {string} uid - 用户ID
   * @param {string} code - 识别码
   * @returns {Promise<boolean>} 是否成功关联
   */
  async linkCode(uid: string, code: string): Promise<boolean> {
    const formatted = code.trim().toUpperCase();
    if (!/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(formatted)) return false;
    const profiles = await this.load()
    profiles[uid] = {
      code: formatted,
      ...(profiles[uid]?.unlocked && { unlocked: true })
    };
    await fs.writeFile(this.storePath, JSON.stringify(profiles, null, 2))
    return true
  }

  /**
   * 为用户解锁特殊主题
   * @param {string} uid - 用户ID
   * @returns {Promise<void>}
   */
  async unlock(uid: string): Promise<void> {
    const profiles = await this.load()
    profiles[uid] = {
      code: profiles[uid]?.code || '',
      unlocked: true
    }
    await fs.writeFile(this.storePath, JSON.stringify(profiles, null, 2))
  }

  /**
   * 计算字符串的哈希值
   * @private
   * @param {string} str - 需要计算哈希的字符串
   * @returns {bigint} 计算得到的哈希值
   */
  private calculateHash(str: string): bigint {
    let h = BigInt(5381)
    for (const char of str) {
      h = ((h << BigInt(5)) ^ h ^ BigInt(char.charCodeAt(0))) & ((BigInt(1) << BigInt(64)) - BigInt(1))
    }
    return h ^ BigInt('0xa98f501bc684032f')
  }

  /**
   * 根据识别码和日期计算人品值
   * @param {string} code - 用户识别码
   * @param {string} dateStr - 日期字符串
   * @returns {number} 计算得到的人品值(0-100)
   */
  getScore(code: string, dateStr: string): number {
    const date = new Date(dateStr)
    const year = date.getFullYear()
    const day = date.getDate()
    const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000)
    const { key1, key2, key3, key4, key5, key6 } = this.secKeys
    const h1 = this.calculateHash(`${key1}${dayOfYear}${key2}${year}${key3}`)
    const h2 = this.calculateHash(`${key4}${code}${key5}${day}${key6}`)
    const merged = (h1 / BigInt(3) + h2 / BigInt(3))
    const val = Math.abs(Number(merged) / 527.0)
    const raw = Math.round(val) % 1001
    return raw >= 970 ? 100 : Math.round((raw / 969.0) * 99.0)
  }

  /**
   * 根据人品值获取对应的消息
   * @private
   * @param {number} score - 人品值
   * @returns {string} 对应的消息
   */
  private getScoreMessage(score: number): string {
    return this.specialMsgs[score] ||
      this.scoreMsgs.find(range => score >= range.min && score <= range.max)?.message || ''
  }

  /**
   * 注册命令到Koishi框架
   * @param {Object} options - 选项对象
   * @param {Function} options.checkUserId - 检查用户ID的函数
   * @param {Function} options.autoRecall - 自动撤回消息的函数
   * @param {Function} options.parseDate - 解析日期的函数
   * @param {Object} options.jrrp - jrrp命令对象
   * @returns {void}
   */
  registerCommands({ checkUserId, autoRecall, parseDate, jrrp }): void {
    jrrp.subcommand('.code', '根据识别码计算今日人品')
      .option('s', '-s <score:integer> 计算指定人品值日期')
      .option('d', '-d <date:string> 计算指定日期人品值')
      .usage('使用绑定的识别码计算今日人品')
      .action(async ({ session, options }) => {
        if (!await checkUserId(session)) return
        const profiles = await this.load()
        const userCode = profiles[session.userId]?.code
        if (!userCode) return autoRecall(session, await session.send('请先绑定识别码'))
        if (options.d !== undefined) {
          const targetDate = parseDate(options.d);
          if (!targetDate) return autoRecall(session, await session.send('日期格式不正确或无效'));
          const score = this.getScore(userCode, targetDate.toLocaleDateString());
          return `<at id="${session.userId}"/>你${targetDate.getMonth() + 1}月${targetDate.getDate()}日的人品值是：${score}${this.getScoreMessage(score)}`;
        }
        if (options.s !== undefined) {
          const score = options.s
          if (score < 0 || score > 100)
            return autoRecall(session, await session.send('人品值必须在 0-100 之间'))
          const today = new Date()
          for (let i = 0; i < 3650; i++) {
            const checkDate = new Date()
            checkDate.setDate(today.getDate() + i)
            if (this.getScore(userCode, checkDate.toLocaleDateString()) === score) {
              return `<at id="${session.userId}"/>你${checkDate.getMonth() + 1}月${checkDate.getDate()}日的人品值是：${score}${this.getScoreMessage(score)}`
            }
          }
          return autoRecall(session, await session.send(`你未来十年内不会出现该人品值`))
        }
        const score = this.getScore(userCode, new Date().toLocaleDateString())
        if (score === 0) {
          const msg = await session.send(this.zeroWarning);
          try {
            const reply = await session.prompt(30000);
            if (!reply || !['y', 'yes'].includes(reply.toLowerCase())) {
              return autoRecall(session, msg);
            }
            await autoRecall(session, msg);
          } catch {
            return autoRecall(session, msg);
          }
        }
        const isFirst = score === 100 && !profiles[session.userId]?.unlocked;
        if (score === 100) await this.unlock(session.userId);
        let msg = this.getScoreMessage(score);
        if (isFirst) msg += '\n' + this.unlockMsg;
        return `<at id="${session.userId}"/>你今天的人品值是：${score}${msg}`
      })
    jrrp.subcommand('.bind <code:string>', '绑定识别码')
      .usage('绑定识别码，格式: XXXX-XXXX-XXXX-XXXX')
      .action(async ({ session }, code) => {
        if (!await checkUserId(session)) return
        if (session.messageId) autoRecall(session, session.messageId, 500)
        if (!code) return autoRecall(session, await session.send('请提供识别码'))
        const success = await this.linkCode(session.userId, code);
        return autoRecall(session, await session.send(
          success ? `绑定识别码成功：${code.trim().toUpperCase()}` : '绑定识别码失败'
        ))
      })
  }
}