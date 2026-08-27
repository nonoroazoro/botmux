# 机器人人格

Botmux 为每个 bot 提供稳定人格和克制的消息 reaction。系统将长期性格与当前群聊
中的职责分开管理。

## Soul 与 Role

- **Soul** 定义 bot 如何形成判断和表达。每个 bot 默认使用内置 Soul，bot owner
  可以在 **Dashboard > Bot 配置** 中用自定义 Markdown 替换，或重置为默认内容。
- **Role** 定义 bot 在当前场景负责什么。现有解析顺序保持不变：本群 Role、默认
  Role、无 Role。

Soul 回答“我是怎样的协作者”，Role 回答“我在这里负责什么”。两者最终组成一份
带 revision 的 Agent Context。

Botmux 在会话启动、有效内容发生变化或原生 CLI context reset 后投递完整 Agent
Context。普通轮次不会重复注入整份内容。开启 reaction 后，普通轮次只收到一条很短
的提示，用于应用当前 reaction policy。

## 人格化 Reaction

当前模型可以给触发本轮的用户消息添加一个语义 reaction：

| Reaction | 语义 |
|------|------|
| `yes` | 明确确认，或用户理解明确正确 |
| `no` | 回复将纠正一个实质错误的前提或结论 |
| `heart` | 真诚的温暖、感谢、支持或有意义的个人时刻 |
| `like` | 有用的贡献、好的决定或值得认可的进展 |
| `done` | 结果明确完成，而且完成标记确实有帮助 |

大多数消息不应该收到 reaction。Reaction 不代替文字回复，也不是进度状态。Botmux
限制每轮最多一个，并限制每个 session 在十分钟内最多四个。

模型负责判断语义是否合适。Daemon 负责鉴权，并始终将 reaction 绑定到当前 managed
turn 的实际触发消息。调用方不能通过提交 message ID 或 turn ID 选择其它消息。

## 配置

在 **Dashboard > Bot 配置** 中打开目标 bot：

1. 编辑 **Soul** 以替换内置 Markdown，或者重置为默认内容。
2. 开关 **人格化消息 reaction**。具备飞书或 Lark 消息传输能力的 bot 默认开启。

写入 reaction 需要应用权限 `im:message.reactions:write_only`。当前 `botmux setup`
会自动申请；手工创建或配置飞书应用时需要自行加入。

对应的 `bots.json` 设置为：

```json
{
  "personalityReactions": false
}
```

只有 `false` 有实际意义，用于关闭能力。省略该字段即保持开启。Soul 是 owner 管理的
host 数据，不存储在 `bots.json` 中。

## 边界

- 普通 bot session 没有用于修改当前 Soul 的正式接口。启用文件 sandbox 后，Soul
  store 也会禁止直接写入。未启用文件 sandbox 时，同一 OS user 下的进程不具备强
  文件隔离。
- Bot 不会自主进化或重写人格。
- 已退役的 GoGoGo 和 DONE progress reaction 不再支持。
- `apiOnly` bot 没有 Lark 消息传输能力，因此不能添加消息 reaction。

本群 Role 的配置方式见[角色与团队](/roles)。
