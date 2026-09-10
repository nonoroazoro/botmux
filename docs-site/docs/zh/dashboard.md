# Dashboard 管控面

命令行 `botmux dashboard` 出一个一次性 token URL，浏览器里跨所有 daemon / 机器人统一管控。

```bash
botmux dashboard
# 输出: http://<lan-ip>:7891/?t=<token>
```

> 这是**轮换式登录 token**：一条 URL 有效到下次运行 `botmux dashboard`（那时才轮换、让旧 URL 失效）；token 会持久化、`botmux restart` 后仍有效。成功访问 `?t=` 只是把同一 token 写进 cookie，不消费/作废它，轮换前同一 URL 可重复登录——所以分享链接≈分享登录态，注意保管。默认端口 `7891`，可用 `BOTMUX_DASHBOARD_PORT` 改。

<p class="cap">Groups 面板：chat × bot 矩阵，一眼看清哪个群里有哪些机器人</p>

## 功能

- **Sessions**：跨所有 bot 列出活跃 + 已关闭会话，可按 CLI / 状态 / adopt / 文本过滤。点进 detail 可复制各种 ID、关闭会话、多选批量关闭；「定位话题」会让机器人在原话题发一条 **@会话 owner** 的提醒（纯 @、无其它正文）帮你跳回上下文。chat-scope 的会话行还带一个飞书群 AppLink 直达群聊。
- **Schedules**：列出所有定时任务，可 Run now / Pause / Resume。
- **Groups**：一键拉新群（自动 @ 通知被邀请人）、拉 bot 入群、自动转让群主；解散群聊、bot 退群（关联会话自动清理）。
- **团队 / Roles / Bot 配置**：团队面板做[跨部署协作](/roles)（邀请别人的部署进团队、跨部署拉群）；Roles 管理各 bot 的本群 Role；Bot 配置管理默认行为、默认 Role、bot 的 [Soul 与人格化 reaction](/personality)，以及卡片设置。
## 机器人人格

在 **Bot 配置** 中展开目标 bot 的人格区域，即可编辑 Soul 或开关人格化 reaction。
保存自定义 Soul 后，该 bot 不再使用内置 Soul；重置即可恢复。Soul 与 Role 相互独立：
Soul 定义稳定的协作风格，Role 定义当前职责。详见[机器人人格](/personality)。

## 对外只读查询

Dashboard HTTP 服务提供两个可供看板或外部观测端消费的会话读接口：

- `GET /api/sessions`：当前聚合的 active + closed session rows。
- `GET /events`：Dashboard 对外 SSE 流，其中 `session.spawned` 的 `body.session` 和 `session.update` 的 `body.patch` 会携带对应的完整值/变更值。每个 daemon 内部还有只绑定 loopback 的 `/api/events`，这是 Dashboard 聚合器的 IPC，不是对外地址。

会话输出中的下列字段都是**可选字段**，消费者必须兼容旧会话/旧 daemon 不返回它们：

| 字段 | 语义 |
|------|------|
| `backendType` | 最近一次 worker spawn 时记录的有效后端（`pty` / `tmux` / `herdr` / `zellij` / `zmx`），用于过滤/展示；cold resume 后可能随配置切换 |
| `backendSessionName` | 仅受管的持久后端会话才有，当前规则为 `bmx-<sessionId 前 8 位>`；PTY、adopt 会话和部分 legacy row 没有该字段。它是确定性定位信息，**不代表对应进程/socket 当前存活** |
| `titleUpdatedAt` | 标题最后更新的 ISO-8601 时间字符串 |
| `titleSource` | 标题来源标签：`initial` / `user` / `agent` / `cli` / `dashboard` / `system`。仅供展示和调试，**不是可信的身份/审计字段** |

### `publicReadOnly` 与 token 边界

`publicReadOnly` 默认开启。开启时，`GET /api/sessions` 和 `GET /events` 在 Dashboard 监听地址上可以**无 token** 访问，因此会话名称、标题、后端和 row 中的其它元数据都应按可公开信息对待。

- 全部 POST / PATCH / DELETE 写操作、不在只读白名单中的 GET，以及原始 PTY / 诊断日志，始终需要 `botmux dashboard` 生成的当前 token。白名单是 fail-closed 的：新增 GET 不会因公开只读开启就自动暴露。
- 每次运行 `botmux dashboard` 都会轮换 token，之前的链接失效。token 只提供 Dashboard 应用层访问权，不代替主机防火墙、VPN 或反向代理鉴权。
- 不需要无 token 观测时，在 Dashboard 「设置」中关闭「公开只读」。也可先设 `BOTMUX_DASHBOARD_PUBLIC_READONLY=false`；但设置页一旦保存过该开关，`~/.botmux/config.json` 的持久值会优先于环境变量。

## 部署细节

dashboard 走单独 pm2 进程 `botmux-dashboard`，跟 daemon 一起起停。每个 daemon 在 `127.0.0.1` 暴露内部 IPC（仅本机），dashboard 进程做反向代理 + HMAC 鉴权：密钥文件 `~/.botmux/.dashboard-secret`（mode 0600），是 daemon↔dashboard 的内部签名密钥，**不下发给浏览器**（浏览器侧走上面的轮换登录 token）。
