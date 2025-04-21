# koishi-plugin-best-jrrp

[![npm](https://img.shields.io/npm/v/koishi-plugin-best-jrrp?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-best-jrrp)

今日人品？今日运势？多算法支持、多样化显示、强大的数据分析、自定义消息配置，打造属于你的究极人品体验！

## 功能特性

- 支持多种计算算法：线性同余、正态分布、Random.org真随机API
- 丰富的显示格式：二进制、八进制、十六进制、数学表达式
- 自定义范围分数消息和特殊分数/日期消息
- 查询特定日期人品值，预测特定分数出现日期
- 排行榜功能，查看今日人气之星
- 数据分析功能，查看个人人品统计信息和全局对比
- 灵活的数据管理，支持按用户和日期清除数据

## 命令列表

- `jrrp` - 获取今日人品值
- `jrrp.date [date]` - 查询指定日期的人品值（支持MM-DD、YY/MM/DD、YYYY-MM-DD格式）
- `jrrp.score [score]` - 查找未来何时会出现指定分数
- `jrrp.rank` - 查看今日人品排行榜
- `jrrp.analyse` - 分析你的人品数据统计信息
- `jrrp.clear` - 清除人品数据（支持指定用户和日期）
- `jrrp.code` - 使用绑定的识别码获取人品值
- `jrrp.code -s <score>` - 使用识别码查找特定分数对应日期
- `jrrp.code -d <date>` - 使用识别码查找特定日期对应分数
- `jrrp.bind <code>` - 绑定识别码

## 配置说明

插件配置分为几个主要部分：

### 1. 算法配置

```yaml
algorithm: linear   # 计算模式: gaussian(正态分布)/linear(线性同余)/randomorg(真随机)
apiKey: ''          # Random.org API密钥（使用真随机时需填写）
codeHashSecret: ''  # 识别码算法密钥（需要6段，使用|分隔）
```

### 2. 指令配置

```yaml
enableDate: true    # 启用日期查询功能
enableScore: true   # 启用分数预测功能
enableRank: true    # 启用排行榜功能
enableCode: false   # 启用识别码功能
```

### 3. 分数显示配置

```yaml
enableScoreFormat: true    # 启用格式化显示
formatDate: '4-1'          # 启用特殊显示的日期（留空则常开）
scoreFormat: 'simple'      # 格式化样式：binary(二进制)/octal(八进制)/hex(十六进制)/simple(简单表达式)/complex(复杂表达式)
```

### 4. 消息配置

```yaml
template: '{at}你今天的人品值是：{score}{message}\n{hitokoto}'  # 消息模板，支持{at}、{username}、{score}、{message}、{hitokoto}、{image:URL}占位符
enableRange: true   # 启用区间消息
enableSpecial: true # 启用特殊消息

# 区间消息配置
rangeMessages:
  - min: 0
    max: 10
    message: '……（是百分制哦）'
  # 更多区间配置...

# 特殊消息配置
specialMessages:
  - condition: '0'           # 分数条件
    message: '！差评如潮！'
  - condition: '4-1'         # 日期条件（MM-DD）
    message: '！愚人节快乐！'
  # 更多特殊消息...
```

## 算法详解

### 线性同余算法 (linear)

使用线性同余生成器算法，通过线性递归公式生成随机数，具有较快的计算速度和均匀的分布特性。

### 正态分布算法 (gaussian)

使用正态分布（高斯分布）计算，产生的随机数围绕中间值（50）聚集，两端（0和100）的概率较低，更符合真实世界的分布特性。

### Random.org API (randomorg)

通过调用Random.org的API获取基于大气噪声的真随机数。需要提供API密钥，当API调用失败时会自动降级至本地算法。

## 显示格式

插件支持多种人品值的显示格式，可以增加趣味性：

### 二进制 (binary)

例如: `你今天的人品值是：110010`（表示50）

### 八进制 (octal)

例如: `你今天的人品值是：62`（表示50）

### 十六进制 (hex)

例如: `你今天的人品值是：32`（表示50）

### 简单表达式 (simple)

例如: `你今天的人品值是：(6+4)*5`（表示50）

### 复杂表达式 (complex)

例如: `你今天的人品值是：(5+5)*5`（表示50）

## 数据分析功能

使用`jrrp.analyse`命令可以查看个人的人品数据统计信息，包括：

- 平均分和中位数分析
- 与全局平均值的对比
- 最高分和最低分记录
- 标准差统计（数值波动程度）
- 最近10条人品记录展示
- 个人运气水平可视化分析

## 消息配置

消息模板支持{at}、{username}、{score}、{message}、{hitokoto}、{image:URL}占位符。
{at}: @用户、{username}: 用户名、{score}: 用户获得的分数、{message}: 区间消息或特殊消息；
{hitokoto}: 一言，支持参数，如{hitokoto:c=a&c=b}、{image:URL}: 将 URL 替换为图片链接，返回对应图片。

支持显示多行文本，使用 \n 进行换行。
区间消息和特殊消息支持触发条件重复，如果重复则会随机选择一条进行显示。

## 数据管理

使用`jrrp.clear`命令可以清除人品数据，该命令支持以下选项：

- `-u <userId>` 指定要清除数据的用户ID
- `-d <date>` 指定要清除数据的日期

## 识别码功能

当配置了`codeHashSecret`并启用`enableCode`后，用户可以绑定启动器的识别码。
仅作为额外功能提供，具体算法请自行获取

### 绑定识别码

使用`jrrp.bind XXXX-XXXX-XXXX-XXXX`命令绑定识别码。

### 使用识别码获取人品值

绑定后，可使用`jrrp.code`命令获取与启动器一致的今日人品值。

### 特殊效果

- 获得100分时会提示解锁隐藏主题
- 获得0分时会显示特殊的确认提示

## 排行榜功能

使用`jrrp.rank`命令查看当日所有用户的人品排名，包括自己的排名和总参与人数。
