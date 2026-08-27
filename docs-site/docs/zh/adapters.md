# 多 CLI 适配器

botmux 通过适配器桥接不同 CLI / Agent，`bots.json` 里用 `cliId` 选择，一键切换。**本地适配器各自运行进程**。默认 tmux 后端下可 `tmux attach` 进真进程，显式 pty、zellij、herdr 后端行为不同。

**适用**：想换底层 CLI、或接一个新工具时查 `cliId` 和它是否吃 `model` 参数。
**不适用**：严格兼容 Codex 的独立发行版、或套通用 wrapper / 网关时不需要新适配器。分别见下方 [Codex 兼容发行版](#codex-兼容发行版) 与 [套 wrapper / 网关接入](#套-wrapper--网关接入)。

## 支持的 CLI / Agent

下表为当前内置适配器（`cliId` 的**权威事实源**是 [`src/adapters/cli/registry.ts`](https://github.com/nonoroazoro/botmux/blob/master/src/adapters/cli/registry.ts)，随版本增减）：

| `cliId` | CLI / Agent | 接入方式 | 支持 `model` |
|---------|-----|-----|:--:|
| `claude-code` | Claude Code（默认） | 本地进程 | ✅ |
| `codex` | Codex CLI | 本地进程 | ✅ |
| `codex-app` | Codex App | 本地进程（app-server 协议） | |
| `gemini` | Gemini | 本地进程 | ✅ |
| `cursor` | Cursor（cursor-agent） | 本地进程 | ✅ |
| `opencode` | OpenCode | 本地进程 | ✅ |
| `antigravity` | Antigravity（agy） | 本地进程 | |
| `copilot` | GitHub Copilot | 本地进程 | ✅ |
| `grok` | Grok（grok-cli） | 本地进程 | ✅ |
| `kimi` | Kimi Code | 本地进程 | ✅ |
| `kiro-cli` | Kiro | 本地进程 | |
| `pi` | Pi | 本地进程 | |
| `oh-my-pi` | Oh-My-Pi（Pi fork） | 本地进程 | ✅ |
| `coco` | CoCo / Trae（需 ≥ 0.120.32） | 本地进程 | ✅ |
| `traex` | TRAE CLI（traex） | 本地进程 | ✅ |
| `mtr` | MTR | 本地进程 | |
| `hermes` | Hermes | 本地进程 | |
| `genius` | Genius | 本地进程 | ✅ |

> `model` 字段只对支持模型参数的适配器生效，其它忽略。

## Codex 兼容发行版

BotMux 把“协议能力”和“发行版身份”分开：`cliId: "codex"` 选择 Codex 协议适配器，`cliRuntime` 选择真正运行、独立发版的二进制。这样兼容分支可以复用模型参数、resume、空闲检测与受控 RPC，而不会被当成官方 Codex 检查版本。

适合 `cliRuntime` 的 CLI 必须是**严格兼容分支**：接受 BotMux 传给 Codex 的参数，保留相同的交互状态和 rollout / resume 语义，并使用兼容的认证 / home 布局。如果它修改了参数、TUI 状态机、会话存储或协议，就应贡献一个真实适配器，而不是声明兼容。

完整配置与更新 provider 说明见 [`bots.json` 的 Codex 兼容发行版章节](/bots-json#codex-兼容发行版)。Dashboard 的 Bot 默认设置也可以配置并预检 runtime。旧 `cliPathOverride` 继续兼容，但不会自动开启需要明确兼容声明的 Codex RPC 能力。

## 套 wrapper / 网关接入

很多场景下你不是直接跑原生 CLI，而是套一层网关或路由，比如 `ccr` 或其它自定义 launcher。这时**不需要新适配器**：`cliId` 仍填底层真实 CLI（`claude-code` / `codex` …），只把启动入口换成一个 **wrapper 脚本**，用 `cliPathOverride` 指过去（`botmux setup` 编辑机器人时的「CLI 可执行文件路径覆盖」就是填它）。

**通用四步：**

1. **先登录网关**（一次性）：用跑 daemon 的**同一系统用户**完成 SSO 登录，token 缓存在该用户家目录。token 过期会弹交互登录卡住 PTY，注意保持登录态。
2. **写 wrapper 脚本** 放 `~/.botmux/bin/`，把 botmux 传入的参数透传给真实 CLI（注意：有的网关拒收 botmux 注入的 `--settings`，要在脚本里剥掉）。
3. **`chmod +x` 加可执行位（最容易漏！）**——botmux 用 node-pty 直接 exec 脚本，没有可执行位会 `EACCES`、CLI 起来即退、bot 崩溃重启。
4. **直接执行脚本验证**（用 `~/.botmux/bin/xxx --version`，别用 `bash xxx` 测——走 bash 不需要可执行位会掩盖第 3 步问题）。然后在 `bots.json` 配 `cliPathOverride`（写**绝对路径**，别用 `~`），`botmux restart` 生效。

各网关的**具体 wrapper 脚本**通常随上游更新，请以对应 CLI / 网关团队发布的文档为准；这里不在公开仓库内放内部文档链接或复制原文。

- **MTR** — 社区贡献，`npm i -g @metamove-code/mtr-cli@latest`
>
> 排查 wrapper 问题的通用手法：`botmux logs` 找 `Spawning fresh CLI:` 那行，复制完整命令在本地手动跑一遍即可定位（权限 / 参数黑名单 / 登录态）。

## 添加新适配器（贡献者）

1. `src/adapters/cli/` 下新建文件，实现 `CliAdapter` 接口
2. `src/adapters/cli/types.ts` 的 `CliId` 联合类型加新 ID
3. `src/adapters/cli/registry.ts` 加 import / switch case / export
4. `src/worker.ts` 的 `CLI_DISPLAY_NAMES`、`card-builder.ts` 的 `cliDisplayNames` 加显示名
5. `src/cli.ts` setup 交互菜单加选项
6. 更新 README

详见 [CONTRIBUTING.md](https://github.com/nonoroazoro/botmux/blob/master/CONTRIBUTING.md)。
