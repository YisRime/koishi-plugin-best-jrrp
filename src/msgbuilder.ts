import { RangeMessage, SpecialMessage } from './index'
import { expressions } from './expressions'

/**
 * 分数显示格式类型
 * @typedef {'binary' | 'octal' | 'hex' | 'simple' | 'complex'} ScoreDisplayFormat
 */
export type ScoreDisplayFormat = 'binary' | 'octal' | 'hex' | 'simple' | 'complex';

/**
 * 分数显示配置接口
 * @interface ScoreDisplayConfig
 */
interface ScoreDisplayConfig {
  /** 是否启用格式化显示 */
  enabled: boolean
  /** 特定日期启用（格式：MM-DD） */
  date?: string
  /** 格式化模式 */
  mode?: ScoreDisplayFormat
}

/**
 * 消息构建器配置接口
 * @interface MsgConfig
 */
interface MsgConfig {
  /** 区间消息列表 */
  rangeMessages: Array<RangeMessage>
  /** 特殊消息列表 */
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
 * 消息构建器类，用于根据人品值生成定制消息
 * @class MsgBuilder
 */
export class MsgBuilder {
  private config: MsgConfig

  /**
   * 创建消息构建器实例
   * @param {MsgConfig} config - 消息构建器配置
   */
  constructor(config: MsgConfig) {
    this.config = config
  }

  /**
   * 构建消息
   * @param {number} score - 人品分数
   * @param {string} userId - 用户ID
   * @param {string} username - 用户名
   * @returns {string} 构建完成的消息
   */
  build(score: number, userId: string, username: string): string {
    const formattedScore = this.formatScoreDisplay(score)
    let message = '';
    // 只有在模板包含{message}且功能启用时才生成消息内容
    if (this.config.template.includes('{message}') &&
        (this.config.enableRange || this.config.enableSpecial)) {
      const today = new Date();
      const todayStr = `${today.getMonth() + 1}-${today.getDate()}`;
      // 尝试获取特殊消息
      if (this.config.enableSpecial && this.config.specialMessages?.length) {
        // 尝试获取日期特殊消息，优先于分数特殊消息
        const dateMessages = this.config.specialMessages.filter(
          m => typeof m.condition === 'string' && m.condition === todayStr
        );

        if (dateMessages.length > 0) {
          message = dateMessages[Math.floor(Math.random() * dateMessages.length)].message;
        } else {
          // 尝试获取分数特殊消息
          const scoreMessages = this.config.specialMessages.filter(
            m => typeof m.condition === 'number' && m.condition === score
          );
          if (scoreMessages.length > 0) {
            message = scoreMessages[Math.floor(Math.random() * scoreMessages.length)].message;
          }
        }
      }
      // 若无特殊消息，尝试使用区间消息
      if (!message && this.config.enableRange) {
        const rangeMessages = this.config.rangeMessages.filter(
          r => score >= r.min && score <= r.max
        );
        if (rangeMessages.length > 0) {
          message = rangeMessages[Math.floor(Math.random() * rangeMessages.length)].message;
        }
      }
    }
    // 替换模板占位符
    let result = this.config.template
      .replace(/{at}/g, `<at id="${userId}"/>`)
      .replace(/{username}/g, username)
      .replace(/{score}/g, formattedScore)
      .replace(/{message}/g, message)
      .replace(/{image:([^}]+)}/g, (_, url) => `<image url="${url}"/>`);

    return result;
  }

  /**
   * 格式化分数显示
   * @private
   * @param {number} score - 原始分数
   * @returns {string} 格式化后的分数
   */
  private formatScoreDisplay(score: number): string {
    const config = this.config.display;
    // 检查是否启用格式化显示
    if (!config.enabled) return score.toString();
    // 检查日期限制
    if (config.date && config.date.trim()) {
      const today = new Date();
      const todayStr = `${today.getMonth() + 1}-${today.getDate()}`;
      if (todayStr !== config.date) return score.toString();
    }
    // 按指定模式格式化
    switch (config.mode) {
      case 'binary': return score.toString(2);
      case 'octal': return score.toString(8);
      case 'hex': return score.toString(16).toUpperCase();
      case 'simple':
      case 'complex': {
        const availableExpressions = (config.mode === 'simple' ?
          expressions.simple : expressions.complex)[score];
        return availableExpressions?.length ?
          availableExpressions[Math.floor(Math.random() * availableExpressions.length)] :
          score.toString();
      }
      default: return score.toString();
    }
  }
}