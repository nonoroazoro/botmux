# Knowledge、Skill 和 Workflow

Botmux 将可复用能力保存在个人和团队能力库中：

| 类型 | 用途 |
| --- | --- |
| Knowledge | 长期复用的事实、术语和决策 |
| Skill | 指导 agent 判断和处理问题的方法 |
| Workflow | 包含输入、步骤、分支和成功标准的可重复流程 |

直接用自然语言要求 bot 创建、修改、查找或执行能力。当前 agent 使用自己的工具编写和执行 Workflow；Botmux 负责作用域、授权、版本、确认卡片和持久化。

## 个人与团队

个人能力只能由本人在与 bot 的私聊中使用，群聊不能读取其他用户的个人能力。团队能力属于 bot 的共享能力库。

创建、更新和删除需要对应的确认卡片。用户可以保存个人能力并提出团队贡献，由 bot owner 审批团队版本。保存后生成不可变版本。

## Workflow trial

Workflow 草稿应明确输入、执行步骤、成功标准和失败处理。bot 先展示 trial 确认卡片，用户确认后，由当前 agent 使用正常工具执行草稿。成功后给出实际观察和限制，再由用户确认保存。

修改草稿需要重新确认 trial。trial token 绑定确切的草稿内容和发起会话。

## 内部命令

以下命令由 bot 代用户调用：

```bash
botmux artifact list --scope personal --type workflow
botmux artifact show --scope personal --name release-check
botmux artifact history --scope personal --name release-check
```

内部 `bot` scope 表示团队能力库。权限根据当前会话确定，指定 scope 不会授予额外权限。
