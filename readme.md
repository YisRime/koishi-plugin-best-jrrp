# koishi-plugin-best-jrrp

[![npm](https://img.shields.io/npm/v/koishi-plugin-best-jrrp?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-best-jrrp)

最好的今日人品插件，可自定义区间以及特殊值，支持节日消息，含有多种人品值显示模式，内有隐藏功能等待发掘

## 功能特性

- 支持多种算法：基础取模、高斯分布、线性同余
- 特殊日期显示定制
- 愚人节特殊模式
- 分数查找功能

## 命令列表

- `jrrp` - 查看今日运势
- `jrrp.date <日期>` - 查看指定日期运势
- `jrrp.score <分数>` - 查找特定分数出现日期
- `jrrp.bind [识别码]` - 绑定/解绑识别码

## 配置说明

```yaml
choice: 'basic'           # 算法选择: basic(取模)/gaussian(高斯)/linear(线性同余)

fool:                     # 愚人节模式配置
  type: 'disabled'        # 模式开关: disabled(关闭)/enabled(开启)
  date: '4-1'            # 启用日期(MM-DD)，留空则永久开启
  displayMode: 'binary'   # 显示模式: binary(二进制)/expression(表达式)
  baseNumber: 6          # 表达式模式下的基础数字(1-9)

# 提示消息配置（在 locales 中修改文本）

rangeMessages:           # 分数区间提示（最多10条）
  '0-10': '消息1'
  '11-19': '消息2'
  # ...

specialMessages:         # 特殊分数提示（最多10条）
  0: '消息1'
  50: '消息2'
  100: '消息3'
  # ...

holidayMessages:         # 节日提示（最多10条）
  '01-01': '消息1'
  '12-25': '消息2'
  # ...
```
