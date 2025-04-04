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

displayMode: 'disabled'  # 娱乐模式: disabled(关闭)/enabled(开启)
displayDate: '4-1'       # 显示日期(MM-DD)，留空保持开启
displayType: 'binary'    # 显示模式: binary(二进制)/expression(表达式)
expressionType: 'simple' # 表达式类型: simple(简单表达式)/complex(复杂表达式)

# 可在本地化文件中修改不同分数区间的提示文本。区间需覆盖0-100的完整范围，不可重叠或有缺口。

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

## 算法详解

### 取模算法 (basic)

最基础的随机算法，将用户ID与当天日期的组合进行哈希计算，然后对101取模得到0-100的分数。分布趋于平均，但不完全均匀。

### 正态分布算法 (gaussian)

基于正态分布（高斯分布）的随机算法，会使分数更集中在均值50附近，极端值（接近0或100）出现概率较低。模拟更贴近自然分布的随机性。

### 线性同余算法 (linear)

使用线性同余生成器(LCG)算法，通过线性方程递归生成伪随机序列，产生较为均匀的随机分布，适合一般使用场景。

### 真随机算法 (random_org)

通过调用Random.org的API获取基于大气噪声生成的真随机数。需要提供API密钥，每日最多可获取1000个随机数。当API调用失败时，会自动降级到basic算法。

## 显示模式详解

### 标准模式

直接显示数字分数，如 `你今天的人品值是：87`

### 二进制模式

当 `displayMode: 'enabled'` 且 `displayType: 'binary'` 时，分数将以二进制形式显示：

- 示例：`你今天的人品值是：1010110`（十进制86）

### 表达式模式

当 `displayMode: 'enabled'` 且 `displayType: 'expression'` 时，分数会以数学表达式形式显示：

#### 简单表达式 (`expressionType: 'simple'`)

使用简单的数学运算表达式，包含4个数字和基本运算符：

- 示例：`你今天的人品值是：9*(8+3)-6`（等于93）
- 示例：`你今天的人品值是：(7+7)*7-7`（等于91）

#### 复杂表达式 (`expressionType: 'complex'`)

使用更复杂的数学表达式，包含更多嵌套括号和运算符：

- 示例：`你今天的人品值是：(3+3+3*3*3)*3-3`（等于84）
- 示例：`你今天的人品值是：(5*5-5)*5-5/5`（等于99）

每个分数(0-100)都有多个对应表达式，会随机选择一个显示，增加趣味性。

### 显示日期控制

通过 `displayDate` 配置可以控制何时启用特殊显示模式：

- 指定日期：如 `displayDate: '4-1'` 仅在4月1日启用特殊显示
- 留空：`displayDate: ''` 总是启用特殊显示

## 排行榜功能

使用 `jrrp.rank` 命令可以查看当天的人品排行榜：

- 显示分数最高的前10名用户
- 显示当前用户的排名及总参与人数
- 排行数据会在每日零点重置

## 分数查找功能

使用 `jrrp.score <分数>` 命令可以查找未来一年内何时会出现指定的人品值：

- 输入：`jrrp.score 100`
- 输出：`你的下一个 100 分会出现在 23-05-17`

## 识别码功能详解

当设置了计算密钥（calCode）后，用户可以使用`jrrp.bind`命令绑定个人识别码。识别码格式为：`XXXX-XXXX-XXXX-XXXX`，必须为16位十六进制字符（0-9, A-F）。

### 识别码特殊效果

- **100分效果**：首次获得100分时，会解锁提示
- **0分确认**：获得0分时，会要求用户确认"免责条款"，增加趣味性
