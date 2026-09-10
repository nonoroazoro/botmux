# Global Provider and User Runtime Isolation

Status: Implemented for isolated Codex TUI and app-server sessions. Native
configuration and plugin discovery are contract-tested with Codex 0.153.4.

## Intent

Botmux treats installed AI CLIs as shared service providers, not as software
that every end user must configure independently. A deployment operator owns
provider accounts, provider configuration, global instructions, global Skills,
global plugins, and installed executables. Every authorized user receives those
capabilities by default.

User isolation applies to data produced while serving one principal. It does
not create a separate upstream AI account for every principal.

The core rule is:

```text
effective runtime = global provider capabilities + scoped Botmux capabilities
                  + principal-owned runtime state
```

## Ownership planes

| Plane | Owner | Examples | Sharing rule |
|---|---|---|---|
| Provider | Deployment | AI account, provider config, AGENTS.md, global Skills, installed plugin code, CLI executables | Available to every isolated principal |
| Team | Team | Team Knowledge, Skills, Workflows, policy | Available only to current team members |
| Personal capability | Principal | Personal Knowledge, Skills, Workflows | Available only to the owner |
| Runtime | Principal | Sessions, history, SQLite state, logs, plugin data, mutable caches, workspace, project trust | Never shared across principals |

Provider credentials may be copied into a principal-owned credential file so a
CLI can use its normal filesystem contract. The credential bytes still identify
one deployment-owned provider account. The copy is an isolation mechanism, not
a separate user account.

## Required invariants

Runtime code implements the current ownership model. It must not scan or delete
retired deployment paths, migrate historical data, or retain fallback behavior
solely for older Botmux versions. Deployment cleanup is a separate, explicit
operator action. Provider refresh, authorization checks, resource teardown, and
test fixture teardown remain part of the current lifecycle.

1. `HOME`, CLI data homes, workspaces, sessions, history, databases, logs, and
   mutable caches resolve under one stable principal root.
2. Provider capabilities are read-only from the user's process perspective.
3. A user cannot mutate the provider installation by changing a projected file.
4. Mutable materialization derived from a provider capability is written only
   under the principal root.
5. Personal and team Knowledge, Skills, and Workflows are resolved by explicit
   scope and membership. Filesystem visibility never grants scope authority.
6. Project trust remains principal-owned. A global config must not inject one
   user's trusted project paths into another user's runtime.
7. The effective CLI executable comes from the deployment PATH or configured
   runtime registry. Per-user HOME isolation must not hide system tools.

## Codex mapping

Codex keeps configuration, credentials, sessions, history, databases, Skills,
plugin caches, and plugin data below `CODEX_HOME`. Sharing that whole directory
would therefore violate runtime isolation.

Botmux keeps a private `CODEX_HOME` for every principal and composes the shared
provider plane as follows:

| Codex resource | Implementation |
|---|---|
| `auth.json` | Mirrored from `sharedCodexHome` on cold spawn. All copies use the same provider account; removing the provider credential removes stale private copies. |
| `config.toml` | Refreshed from provider config on every cold spawn. Retains only the principal's `[projects]` trust and `[notice]` state. Provider removals take effect too. |
| `AGENTS.md` | Read-only link to the provider file. |
| global Skills | Direct-child read-only projection from provider Skill roots. |
| plugin enablement and native MCP config | Loaded from the refreshed private `config.toml`, along with provider model settings and feature flags. |
| plugin marketplace source | Existing provider Git checkouts are exposed as read-only local marketplaces. Other Git marketplaces retain their Git source and bootstrap privately. |
| `plugins/cache` | Installed, versioned plugin code projected from the provider through read-only marketplace links. Replaces obsolete private copies of installed code. |
| plugin runtime data | Remains private; directories outside `plugins/cache` are not projected or replaced. |
| `sqlite_home`, `log_dir` | Pinned to the private `CODEX_HOME` and its `log` subdirectory, overriding shared absolute paths. |

Both the TUI and `codex app-server` read the same native user configuration.
The previous `--profile botmux-global` mechanism is removed because it did not
cover app-server and could leave stale settings in the seeded base config.
Configuration refresh uses the same advisory lock as Botmux's trust writer and
an atomic file replacement. Malformed config aborts provisioning without
replacing the prior file. Codex's own concurrent config writes do not use this
Botmux lock; operators should refresh settings at a cold-start boundary.
See the official Codex
[configuration precedence](https://learn.chatgpt.com/docs/config-file/config-basic#configuration-precedence)
and [plugin documentation](https://learn.chatgpt.com/docs/plugins).

An enabled plugin is not necessarily installed: native Codex returns
`installed=false` and omits its skills when only marketplace and enablement
config are present. The provider's actual `plugins/cache` is therefore part of
the shared capability plane. The previous `.codex/.tmp/plugins/plugins`
projection did not supply that installed state and is retired.

Existing local marketplace sources are canonicalized before writing the private
config. Linux sandbox mounts expose canonical paths; host home-directory aliases
are not assumed to exist inside the sandbox.

## Lifecycle

On every cold spawn Botmux:

1. Resolves the stable principal root and private workspace.
2. Refreshes the shared provider credential copy.
3. Refreshes private `config.toml` from `sharedCodexHome/config.toml`, retaining
   principal trust and notice state and pinning runtime paths.
4. Projects AGENTS.md, Skills, and deployment executables as read-only inputs.
5. Projects installed plugin code and adds it and local marketplace sources to
   the filesystem sandbox as read-only roots.
6. Starts the TUI or app-server with the private `CODEX_HOME`.
7. Lets Codex write sessions, history, databases, mutable caches, and plugin data only
   inside that principal's runtime plane.

Global provider changes become effective on the next cold spawn. Existing live
sessions keep their process-level capability snapshot until restarted.

The `codex-app` adapter declares data-home redirection and the same global Skill
roots as the TUI adapter. Its runner passes the private environment to its
app-server child. Hybrid remote-TUI mode remains ineligible for sandboxed
sessions because its host-side server would bypass the process sandbox.

## Verification

Unit tests cover provider updates and removals, private trust, runtime path
pinning, unchanged session/history/auth/DB bytes, malformed TOML, cache projection,
and redirected-path rejection. The opt-in native contract test installs a local
fixture plugin into a disposable provider home, then queries actual Codex
`config/read`, `plugin/list`, `plugin/read`, and `skills/list` for two private
user homes, including the plugin's native MCP declaration. It
also verifies plugin removal after a cold restart. It uses no account or model
request and does not install or start Botmux.

```bash
BOTMUX_CODEX_TEST_BIN=/absolute/path/to/codex pnpm exec vitest run --project e2e test/core/codex-provider-config/config.e2e.ts
```

All fixture files stay inside Vitest's owned test root and are removed at
teardown. This validates the native configuration/discovery contract; production
Feishu routing and model execution are separate deployment acceptance checks.
The test harness also replaces the runtime data directory and clears inherited
CLI/config selectors so they cannot bypass the disposable test HOME.

## Extension to other CLIs

Each adapter must declare the same semantic boundary even when its native file
layout differs:

- provider auth and immutable capabilities are shared by deployment policy;
- user runtime state is redirected to the principal root;
- native plugin or extension metadata is projected through a CLI-supported
  config layer when available;
- writable global caches are never used as the cross-user sharing mechanism.

An adapter is not multi-user safe merely because its process runs in an isolated
HOME. It is complete only when both the provider capability plane and the
principal runtime plane are mapped and tested.

## Conversation identity

The user interacts with the current bot, identified by its configured name and
role. Transport software is an implementation detail, not a second participant
or a product persona. Notifications, maintenance reports, and completion cards
use the sending bot’s current name when attribution is needed. With no known
name, omit the signature rather than inventing one. Shared consoles have
functional titles and no product wordmark.

Write messages as useful conversation: explain what happened, why it matters,
and the next actionable step. Use first person for the bot’s own actions. Keep
roles and personality grounded in the configured identity and actual behavior.
Never imply that a confirmation or button executes an operation unless that
action exists. In particular, CLI update reminders currently inform the owner;
they do not install updates or interpret a reply as update authorization.

Apply this policy to authored copy and rendering defaults. Do not rewrite user
messages, quoted content, executable commands, protocol identifiers, or existing
runtime paths merely because they contain an implementation name.
