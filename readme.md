# koishi-plugin-best-jrrp

[![npm](https://img.shields.io/npm/v/koishi-plugin-best-jrrp?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-best-jrrp)

支持真随机的今日人品，可高度自定义提示消息，带有特殊显示模式，你今天的人品值是：(6+6)*6-6！今天运气不错呢！

## 功能特性

- 支持多种算法：取模、正态分布、线性同余和真随机(Random.org)
- 特殊日期显示定制
- 娱乐模式（支持二进制和数学表达式显示）
- 排行榜功能
- 识别码绑定系统
- 分数查找功能

## 命令列表

- `jrrp` - 查看今日运势
- `jrrp.date <日期>` - 查看指定日期运势（支持 YYYY-MM-DD 或 MM-DD 格式）
- `jrrp.score <分数>` - 查找未来一年内特定分数出现的日期
- `jrrp.rank` - 查看今日人品排行榜
- `jrrp.bind [识别码]` - 绑定/解绑识别码（需启用识别码功能）

## 配置说明

```yaml
algorithm: 'basic'       # 算法选择: basic(取模)/gaussian(正态分布)/linear(线性同余)/random_org(真随机)
calCode: ''              # 计算密钥（启用识别码模式）
randomOrgApi: ''         # Random.org API密钥（使用真随机时必填）

displayMode: 'disabled'  # 愚人模式: disabled(关闭)/enabled(开启)
displayDate: '4-1'       # 显示日期(MM-DD)，留空保持开启
displayType: 'binary'    # 显示模式: binary(二进制)/expression(表达式)
expressionType: 'simple' # 表达式类型: simple(简单表达式)/complex(复杂表达式)

# 以下配置请在本地化文件中修改文本

range:                   # 分数区间提示（最多10条）
  '0-10': 'commands.jrrp.messages.range.1'
  '11-19': 'commands.jrrp.messages.range.2'
  # ...

number:                  # 特殊分数提示（最多10条）
  0: 'commands.jrrp.messages.number.1'
  50: 'commands.jrrp.messages.number.2'
  100: 'commands.jrrp.messages.number.3'
  # ...

date:                    # 特殊日期提示（最多10条）
  '01-01': 'commands.jrrp.messages.date.1'
  '04-01': 'commands.jrrp.messages.date.2'
  '12-25': 'commands.jrrp.messages.date.3'
  # ...
```

## 识别码功能

当设置了计算密钥（calCode）后，用户可以使用`jrrp.bind`命令绑定个人识别码。识别码格式为：`XXXX-XXXX-XXXX-XXXX`。

绑定识别码后，用户的人品值将基于识别码计算，可在不同平台保持一致。

## 表达式模式

启用表达式模式后，人品值将以数学表达式的形式显示：

- 简单表达式：如 `(7*7)+7/7` 表示 50
- 复杂表达式：如 `(5+5)*5` 表示 50

## 自定义区间提示

可在本地化文件中修改不同分数区间的提示文本。区间需覆盖0-100的完整范围，不可重叠或有缺口。
