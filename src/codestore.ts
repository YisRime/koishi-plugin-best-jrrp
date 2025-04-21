import { promises as fs } from 'fs'
import path from 'path'

/**
 * 用户识别码配置档案
 */
interface Profile {
  /** PCL 识别码 */
  code: string;
  /** 是否已解锁特殊主题 */
  unlocked?: boolean;
}

/** 用户ID到Profile的映射 */
type ProfileMap = Record<string, Profile>

/**
 * 分数范围及其对应消息
 */
interface ScoreMsg {
  /** 最小分数（含） */
  min: number
  /** 最大分数（含） */
  max: number
  /** 对应的文本消息 */
  message: string
}

/**
 * PCL人品计算所需的密钥
 */
interface SecKeys {
  key1: string
  key2: string
  key3: string
  key4: string
  key5: string
  key6: string
}

/**
 * 管理PCL人品识别码的存储和计算
 * 提供识别码绑定、人品值计算及相关命令注册功能
 */
export class CodeStore {
  /** 配置文件存储路径 */
  private storePath: string
  /** PCL人品计算用密钥 */
  private secKeys: SecKeys
  /** 不同分数范围的回应消息 */
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

  /** 特定分数的特殊消息 */
  private specialMsgs: Record<number, string> = {
    50: '！五五开……',
    100: '！100！100！！！！！'
  }

  /** 解锁欧皇主题的提示消息 */
  private unlockMsg = "隐藏主题 欧皇彩 已解锁！\n前往 PCL->更多->百宝箱->今日人品 确认"
  /** 零分时的警告消息 */
  private zeroWarning = "在查看结果前，请先同意以下附加使用条款：\n1. 我知晓并了解 PCL 的今日人品功能完全没有出 Bug。\n2. PCL 不对使用本软件所间接造成的一切财产损失（如砸电脑等）等负责。\n(y/n)"

  /**
   * 创建人品识别码存储对象
   * @param baseDir 基础目录路径，用于存储用户配置
   * @param secKeys 计算人品所需的密钥集合
   */
  constructor(baseDir: string, secKeys: SecKeys) {
    this.storePath = path.join(baseDir, 'data', 'jrrp-code.json')
    this.secKeys = secKeys
  }

  /**
   * 加载用户识别码配置文件
   * @returns 用户配置映射表，键为用户ID，值为用户配置
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
   * 绑定用户识别码
   * @param uid 用户ID
   * @param code 识别码，形如 XXXX-XXXX-XXXX-XXXX
   * @returns 是否绑定成功
   */
  async linkCode(uid: string, code: string): Promise<boolean> {
    const formatted = code.trim().toUpperCase();
    // 验证识别码格式
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
   * @param uid 用户ID
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
   * 计算字符串的哈希值（PCL算法）
   * @param str 要哈希的字符串
   * @returns 64位哈希值
   */
  private calculateHash(str: string): bigint {
    let h = BigInt(5381)
    for (let i = 0; i < str.length; i++) {
      h = ((h << BigInt(5)) ^ h ^ BigInt(str.charCodeAt(i))) & ((BigInt(1) << BigInt(64)) - BigInt(1))
    }
    return h ^ BigInt('0xa98f501bc684032f')
  }

  /**
   * 根据识别码和日期计算人品值
   * @param code PCL识别码
   * @param dateStr 日期字符串，格式为本地日期字符串
   * @returns 人品值(0-100)
   */
  getScore(code: string, dateStr: string): number {
    const date = new Date(dateStr)
    const year = date.getFullYear()
    const day = date.getDate()
    const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24))
    // 计算哈希值
    const { key1, key2, key3, key4, key5, key6 } = this.secKeys
    const h1 = this.calculateHash(`${key1}${dayOfYear}${key2}${year}${key3}`)
    const h2 = this.calculateHash(`${key4}${code}${key5}${day}${key6}`)
    const merged = (h1 / BigInt(3) + h2 / BigInt(3))
    const val = Math.abs(Number(merged) / 527.0)
    const raw = Math.round(val) % 1001
    // 映射分数范围，970以上为满分100
    return raw >= 970 ? 100 : Math.round((raw / 969.0) * 99.0)
  }

  /**
   * 注册命令
   * @param param0 包含检查用户ID、自动撤回、jrrp命令和日期解析函数的对象
   */
  registerCommands({ checkUserId, autoRecall, parseDate, jrrp }): void {
    jrrp.subcommand('.code', '根据识别码计算今日人品')
      .option('s', '-s <score:integer> 计算指定人品值日期')
      .option('d', '-d <date:string> 计算指定日期人品值')
      .usage('使用绑定的识别码计算今日人品')
      .action(async ({ session, options }) => {
        if (!await checkUserId(session)) return
        // 获取用户绑定的识别码
        const profiles = await this.load()
        const userCode = profiles[session.userId]?.code
        if (!userCode) return autoRecall(session, await session.send('请先绑定识别码'))
        // 计算指定日期人品值
        if (options.d !== undefined) {
          const targetDate = parseDate(options.d);
          // 检查日期格式是否有效
          if (!targetDate) {
            return autoRecall(session, await session.send('日期格式不正确或无效'));
          }
          const score = this.getScore(userCode, targetDate.toLocaleDateString());
          const month = targetDate.getMonth() + 1;
          const day = targetDate.getDate();
          let msg = this.specialMsgs[score] ||
            this.scoreMsgs.find(range => score >= range.min && score <= range.max)?.message || '';
          return `<at id="${session.userId}"/>你${month}月${day}日的人品值是：${score}${msg}`;
        }
        // 计算指定人品值日期
        if (options.s !== undefined) {
          const score = options.s
          if (score < 0 || score > 100)
            return autoRecall(session, await session.send('人品值必须在 0-100 之间'))
          // 在未来10年内寻找指定分数的日期
          const today = new Date()
          for (let i = 0; i < 3650; i++) {
            const checkDate = new Date()
            checkDate.setDate(today.getDate() + i)
            let msg = this.specialMsgs[score] ||
              this.scoreMsgs.find(range => score >= range.min && score <= range.max)?.message || '';
            if (this.getScore(userCode, checkDate.toLocaleDateString()) === score) {
              return `<at id="${session.userId}"/>你${checkDate.getMonth() + 1}月${checkDate.getDate()}日的人品值是：${score}${msg}`
            }
          }
          return autoRecall(session, await session.send(`你未来十年内不会出现该人品值`))
        }
        // 计算今日人品值
        const score = this.getScore(userCode, new Date().toLocaleDateString())
        // 特殊处理0分情况
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
        // 检查是否首次获得100分
        const isFirst = score === 100 && !profiles[session.userId]?.unlocked;
        if (score === 100) await this.unlock(session.userId);
        // 获取分数对应的消息
        let msg = this.specialMsgs[score] ||
          this.scoreMsgs.find(range => score >= range.min && score <= range.max)?.message || '';
        // 首次获得100分时添加特殊解锁消息
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
        return autoRecall(session, await session.send(success ? `绑定识别码成功：${code.trim().toUpperCase()}` : '绑定识别码失败'))
      })
  }
}