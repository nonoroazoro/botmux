# 文件沙盒

文件沙盒通过默认拒绝的文件系统策略运行本地 Agent CLI。macOS 使用 Seatbelt，Linux 使用 bubblewrap，两端共享三种访问级别：

- `readWrite`：CLI 可以读取和修改路径。
- `readOnly`：CLI 只能读取路径。
- `deny`：CLI 无法访问路径。

路径匹配越深，优先级越高。host 强制安全规则始终生效，用户配置不能覆盖。

## 开启方式

可以在 Dashboard 的 Bot Config 页面开启，也可以编辑 `bots.json`：

```jsonc
{
  "name": "oncall-bot",
  "cliId": "claude-code",
  "sandbox": true,
  "sandboxPaths": {
    "readWrite": ["/srv/workspaces/team-a"],
    "readOnly": ["/srv/shared-source"],
    "deny": ["/srv/workspaces/team-a/private"]
  },
  "sandboxNetwork": true
}
```

baseline policy 会把会话工作目录和当前 bot 的 runtime 数据设为可写，把必要的系统和工具链路径设为只读，其余未匹配路径默认拒绝。`sandboxPaths` 在 baseline 上追加 per-bot 规则。

规则会解析为 canonical absolute path。不存在或无效的路径会被丢弃并记录日志。如果新文件需要在 session 启动后创建，应授权它已经存在的 parent directory。

## 当前行为

- `readWrite` 路径会直接修改 host 文件。旧 overlay 和 `/land` 流程已经移除。
- policy 外的路径读取会被拒绝，不会回退为全盘可读。
- CLI credential 会重定向到当前 bot 的私有 runtime 目录，不暴露 sibling bot 数据。
- 已运行的 CLI 保留启动时 policy。修改 policy 后需要 cold-start session 才能生效。
- `botmux send` 继续通过 daemon relay 工作，CLI 不会拿到 Lark credential。

## 网络

默认保留网络访问。Linux 可以设置 `sandboxNetwork: false` 使用独立 network namespace，但 model API、package manager、Git remote 和 proxy 可能失效。macOS Seatbelt 当前不执行这个 network switch。

## Backend 兼容性

- PTY 和 tmux 支持本地 sandbox。
- Zellij、Zmx、Herdr 等由 backend 自己启动 child process 的模式会 fail closed。

## Legacy 配置

daemon 会自动迁移这些字段：

| Legacy | Current |
| --- | --- |
| `readIsolation: true` | `sandbox: true` |
| `readDenyExtraPaths` | `sandboxPaths.deny` |
| `sandboxHidePaths` | `sandboxPaths.deny` |
| `sandboxReadonlyPaths` | `sandboxPaths.readOnly` |

新配置应使用 current fields。完整 schema 见 [bots.json 配置](/bots-json)。

## 安全提示

1. `readWrite` 是 direct write，必须谨慎配置。
2. sensitive credential 应放在授权路径之外，或增加明确的 `deny` 规则。
3. network access 是独立的安全决策。
4. 需要 review 变更时，使用 version control 或 worktree。
