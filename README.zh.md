# botmux

[English](README.md)

botmux 将飞书或 Lark 与 Codex、Claude Code 等 AI coding CLI 连接起来。每段对话
运行在独立的 CLI 会话中，用户可以通过飞书、Dashboard 或 Web Terminal 持续查看
和操作。

## 这是一个独立分支

本仓库已经与原版 [deepcoldy/botmux](https://github.com/deepcoldy/botmux) 彻底分叉，
不再承诺兼容原版的 release、配置或文档。我们只会选择性吸收适合当前产品的上游改动。

## 核心改动与设计原因

### 多用户隔离

每个用户可以拥有独立的 home、workspace、CLI 配置、登录状态和会话身份。全局工具
仍然可以共享，但用户的私有状态不会互相泄露。

例如，两个人可以在同一台共享服务器上使用机器人，同时保持 CLI 历史、凭证、代码仓库和
个人助手数据彼此隔离。确认卡片也只能由操作发起人点击。

### 符合飞书使用习惯的对话路由

群聊 lobby 中，只要消息任意位置明确 `@机器人` 就会创建会话。进入对应 topic 后，不需要
反复提及机器人。首次对话如果依赖前文，agent 可以分页查看群聊或私聊历史。消息中的
`@Alice` 会作为语义信息保留，由 agent 判断是否需要查看 Alice 的消息。

这样既保证路由规则清晰，也能自然处理“看一下 Alice 前面提到的 bug”这类请求。

### Knowledge、Skill 和 Workflow

用户可以直接通过对话沉淀个人助手能力：

- **Knowledge** 保存事实和约定。
- **Skill** 保存一类任务的通用操作方法。
- **Workflow** 保存可传参、可重复执行的流程。

三类内容都支持创建、查看、搜索、更新、版本记录和删除，也可以保存到个人或整个机器人。
个人改动需要本人确认，向机器人公共内容投稿需要机器人 owner 审批。

例如，用户可以让机器人记住一份发布检查清单，也可以把一次成功的发布流程沉淀成可复用的
Workflow。LLM 负责理解、创作和执行，代码负责权限、校验、卡片、持久化和状态变更。

### 本地代码是唯一依据

查看或修改代码前，agent 会先将仓库 clone 到用户 workspace。已有仓库会回到默认分支并
更新到最新版本。除非用户明确要求，否则不使用 remote code search。

这样可以避免基于过期分支或远端片段得出结论，而实际修改的又是另一份代码。

### 自动执行与安全恢复

Coding CLI 会预先处理常规的 workspace trust 和权限设置，避免远程任务执行到一半等待用户
确认。只有 login 等真实阻塞才需要用户介入。

如果 Codex 会话明确遇到 cybersecurity policy 阻断，发起人会收到专用确认卡片。确认后，
系统会用保守的防御性分析策略创建新会话，同时保留 workspace、飞书 topic、回复位置和
Web Terminal 链接。正常会话不会进入这个流程。

### 机器人拥有自己的身份

飞书卡片和消息使用配置的机器人名称与说明。用户看到的是配置的助手身份，而不是 botmux
网关品牌。无效或空的可信配置不会注入 CLI，用户消息则保持原样传递。

## 保留的原版基础能力

本分支继续保留实时飞书卡片、Web Terminal、多机器人和多 CLI 路由、会话持久化、
Dashboard 管理、定时任务、外部触发，以及飞书和国际版 Lark 支持。

CLI adapter 的唯一事实源是
[`src/adapters/cli/registry.ts`](src/adapters/cli/registry.ts)。

## 本地开发

需要 Node.js 22 或更高版本以及 pnpm。

```bash
pnpm install
pnpm build
pnpm use:here
botmux setup
pnpm daemon:start
```

提交代码前运行：

```bash
pnpm build
pnpm test
pnpm workflow-core:test
```
