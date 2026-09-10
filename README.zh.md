<div align="center">
  <img src="src/dashboard/web/favicon.png" alt="botmux logo" width="120" />
  <h1>botmux</h1>
  <p><strong>面向独立 AI coding CLI 会话的飞书与 Lark 网关</strong></p>
  <p>在真实对话中使用 Codex、Claude Code、Gemini、OpenCode 等 coding CLI。</p>
  <p>
    <a href="README.md">English</a> ·
    <a href="docs-site/docs/zh/quickstart.md">快速接入</a> ·
    <a href="docs-site/docs/zh/architecture.md">架构</a> ·
    <a href="docs-site/docs/zh/personality.md">机器人人格</a>
  </p>
</div>

> **独立 fork：** 本仓库是 [deepcoldy/botmux](https://github.com/deepcoldy/botmux)
> 的独立 fork，不是上游官方发行版。目前已经与上游彻底分叉，不承诺兼容上游 release、
> 配置或文档。

## 概述

Botmux 把飞书或 Lark 接到真实的 AI coding CLI 进程上。一段对话可以对应一个常驻
CLI session，终端输出实时回到聊天里，也可以从 Web Terminal 或本地终端继续操作
同一个进程。

它桥接的是完整 CLI，不是在 Agent SDK 上另做一个缩水版。CLI 原生的记忆、上下文管理、
工具、hooks、Skills、MCP、plan mode 和 slash commands 都还在。

## Fork 版本主要差异

本 fork 保留了原版核心网关模型，但更聚焦**单 Bot 服务整个团队或个人**，为此进行了大量改造。
下面列出的能力均由本仓库实现，非上游功能。

| 新增能力 | 说明 |
|------|------|
| 多用户隔离 | 共享 provider account 和全局能力，同时隔离每个用户的 runtime state、workspace、Git 与 SSH identity、历史和 session identity |
| 飞书对话模型 | lobby 消息任意位置 @ 都能路由，topic 内自然续聊，支持分页读取历史、群上下文、子话题分支、会话分身和交互式投票 |
| 机器人人格 | 稳定 Soul、场景 Role、生命周期感知的 Agent Context，以及克制的语义 reaction |
| 助手能力库 | 个人和团队 Knowledge、Skill、Workflow，带独立归属、revision、review 和受控发布 |
| 权限与授权 | 对话权和操作权分层，支持 `/grant` 申请卡、有效期、消息额度、撤销、命令限制、owner 审批和用户级 OAuth 授权 |
| 本地代码流程 | 代码任务以本地 repository checkout 为事实源，不拿远端片段或过期搜索结果代替 |
| 运行与恢复 | Ask 卡片和关键状态持久化，提交失败受控重试，恢复时保留原生 context，支持 tmux、ZMX 和安全沙盒 |
| Bot 管理与集成 | Dashboard 集中配置、飞书应用自动 setup、多 Bot 与跨部署协作、API-only 模式、Issue Board、定时任务和 On-Call |

## 多用户隔离

多个用户可以使用部署方统一提供的 AI provider account 和全局 CLI 能力，同时保持 CLI
历史、代码仓库、可变 runtime state 和个人助手数据彼此隔离。每个用户拥有独立的 home、
workspace、CLI runtime data、Git 与 SSH identity，以及对应的会话身份。全局
AGENTS.md、Skill、plugin 和系统工具对所有用户可用，但不会因此共享用户产生的数据。

多用户模式还会隔离飞书历史读取、附件路径和会话数据，避免一个用户借助另一个用户的
session 或本地文件访问不属于自己的内容。

## 飞书对话模型

对话模型遵循飞书的实际使用习惯。在 lobby 消息的任意位置 @bot 都能发起任务；进入 topic
后可以直接续聊，不必每轮重复 @。需要前文时，agent 可以分页读取更早的群聊或私聊历史，
并在新成员入群或新话题开工时注入必要的群上下文。消息里的 `@Alice` 会作为原始语义保留，
由模型判断 Alice 的消息是否相关。

同一个任务可以通过子话题或 `/fork` 创建并行会话，也可以使用 `/adopt` 接管本地已经运行
的 CLI。`/relay` 可以把自己的会话接力到其它话题，保持原有上下文和权限边界。

交互式投票同时支持人和 bot。bot 可以创建投票、参与投票，投票结果会作为正常的飞书
互动事件回到会话中，而不是只能由人操作的外部功能。

## 机器人人格

每个 bot 都有一份内置 **Soul**，用于定义稳定的判断方式和表达风格。Owner 可以在
Dashboard 中用自定义 Markdown 替换。现有 **Role** 系统保持独立，用于定义 bot 在
当前群聊中负责什么。

```text
Agent Context = Soul + effective Role + enabled capability policy
```

完整 Agent Context 只在会话启动、revision 变化或原生 CLI context reset 后投递，不会在
每个普通轮次重复注入。

当前模型可以给触发本轮的实际用户消息添加一个克制的 reaction：

- `yes`：用户理解明确正确
- `no`：回复将纠正一个实质错误的前提
- `heart`：真诚的温暖、感谢或支持
- `like`：有用的贡献或好的决定
- `done`：结果明确完成，而且完成标记确实有帮助

大多数消息不会收到 reaction。模型负责语义判断，daemon 负责目标绑定、鉴权、幂等和限频。
Bot 没有用于重写当前 Soul 的正式接口；启用文件 sandbox 后也会阻止直接写入。未启用
sandbox 时，同一 OS user 下的进程不具备强文件隔离。详见[机器人人格](docs-site/docs/zh/personality.md)。

## Knowledge、Skill 和 Workflow

用户可以直接通过对话，将有价值的结果沉淀为可复用的助手能力，不必反复向机器人解释
同一份背景和做事方式：

- **Knowledge** 让机器人长期记住事实、术语、决策和约定。
- **Skill** 教会机器人处理一类任务时可重复使用的方法、判断原则和操作说明。
- **Workflow** 定义包含输入、步骤、分支、成功标准和失败处理的可重复流程，由当前机器人
  使用已有工具执行。

三类能力都通过自然对话管理，并分别存放在个人能力库或机器人的团队能力库中。个人能力
只在本人与机器人的私聊中可用，不会载入群聊，也不会被其他用户读取；团队能力在该机器人
的所有对话中共享。

个人能力由本人管理，也可以整理为不包含个人信息的通用版本后申请贡献给团队。团队内容的
发布和删除由 bot owner 审批，每次保存都会生成不可变的 revision。Workflow 保存前，当前
机器人会在用户确认后试运行完全相同的草稿，并说明实际结果和限制。详见
[Knowledge、Skill 和 Workflow](docs-site/docs/zh/workflow.md)。

## 权限与授权

权限分为两层：

- **对话权（canTalk）**：谁可以提问、查看日志和读取代码。可以按群开放，也可以通过
  `globalGrants` 或 `/grant` 授权指定用户。默认只有 owner 有对话权。
- **操作权（canOperate）**：谁可以切换目录、重启或关闭 session，以及点击会改变会话
  状态的卡片按钮。操作权由 `allowedUsers` 控制，通常只有 owner 拥有。

授权流程也经过了完整收口：

- 未授权成员在群里 @bot 时，可以收到发给 owner 的授权申请卡；owner 可直接批准或拒绝。
- `/grant` 支持指定用户、整群授权、有效期和消息额度，`/revoke` 可以撤销对应授权。
- 消息额度用尽或授权过期后会自动收回对应的对话权，不会影响 owner 的操作权。
- `restrictGrantCommands` 可以限制仅通过 per-user grant 获得权限的用户，只能普通对话，
  不能调用 slash command。
- `p2pOpen` 可以开放私聊对话，但敏感操作仍然只允许 `allowedUsers`。
- 用户以自己的身份调用云文档、日历等 API 时，走独立的 `/login` OAuth 授权，不复用 bot
  owner 的身份。
- 跨部署 bot 通过团队信任关系进入专门的授权闸门，不会绕过权限系统直接获得操作权。

共享助手能力的修改、删除和发布由 bot owner 审批。审批卡、授权卡和关键状态都持久化，
daemon 重启后可以继续处理，不会因为进程退出而丢失授权结果。

## 本地代码流程

代码任务以本地 repository checkout 为事实源。开始查看或修改代码前，agent 会使用用户
workspace 中的本地仓库，不用远端片段或过期搜索结果代替实际文件。附件路径也会经过物理
解析，避免借助链接或符号链接越过当前用户的工作区边界。

## 运行与恢复

Botmux 直接管理真实 CLI 进程，支持 tmux、ZMX 和其它持久会话后端。daemon 重启、机器重启
或 worker 重连后，托管 session、AskUserQuestion 卡片和必要的恢复状态仍可继续处理。

常规启动、提交确认、type-ahead、空闲检测和不同 CLI 的 turn 边界都经过统一处理。Codex
安全恢复会保留原生 context；遇到 login、权限或 policy-gated recovery 等真实阻塞时，系统
会把控制权交还发起人，不会静默扩大权限。

文件 sandbox 提供跨平台的默认拒绝策略、路径白名单和越界校验。需要更轻量部署时，也支持
core-only 或 API-only bot，由 HTTP 控制 API 驱动，不必配置飞书消息 transport。

## Bot 管理与产品集成

Dashboard 提供 Bot 配置、Session、Group、Team、Schedule、Issue Board、监控
和洞察等管理面板。每个 bot 可以单独配置 CLI、默认行为、Role、Soul、reaction、卡片、
多用户隔离和运行后端。

`botmux setup` 负责飞书应用初始化、权限申请和事件配置。卡片、消息、Ask 和审批通知
使用实际 bot identity，不把 botmux 网关伪装成助手本人。多个 bot 可以在同一个群里协作，
也可以通过团队关系跨部署创建协作群。

Issue Board 提供从领取、建群、绑定 repository、执行到完成或释放的完整流程，并带有本地
outbox 和崩溃恢复。定时任务、Webhook、On-Call、插件和 Workflow 则用于把一次性的对话
扩展成持续运行的自动化能力。

## 快速开始

需要 Node.js 22 或更高版本。

```bash
npm install -g botmux
botmux setup
botmux start
botmux dashboard
```

飞书应用权限、事件订阅、CLI 安装和 bot 配置见[5 分钟快速接入](docs-site/docs/zh/quickstart.md)。

## 本地开发

需要 Node.js 22 或更高版本以及 pnpm。

```bash
pnpm install
pnpm build
pnpm use:here
botmux setup
pnpm daemon:start
```

完整交接前运行：

```bash
pnpm build
pnpm test
```

CLI adapter 的唯一事实源是
[`src/adapters/cli/registry.ts`](src/adapters/cli/registry.ts)。
