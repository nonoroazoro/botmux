/**
 * cli-selection.ts
 *
 * 单一事实源：把「用户可选的 CLI 形态」从「原始 cliId 列表」抽象成一层
 * **可级联的选择项**。除了原生 CLI，也可以提供公开支持的 wrapper 形态：
 *
 * 这些形态**不生成任何 wrapper 脚本**：通过 bot 配置的 `wrapperCli`（通用启动前缀）
 * 实现——worker 在 spawn 时把启动命令拼成 `<wrapperCli> <CLI 参数>`（纯 argv，跨系统）。
 * `wrapperCli` 是通用机制，也能承载自定义脚本。见 worker.ts 的
 * wrapperCli 处理与 {@link buildWrappedLaunch} / {@link stripSettingsArgs}。
 *
 * 三处入口（终端 setup / 终端 bot 编辑 / dashboard 网页添加机器人）共用本模块：
 *   - 展示：`CLI_SELECT_OPTIONS`（扁平，web 下拉 + 非 TTY 回退）/ `CLI_SELECT_TREE`（级联，终端 TUI）
 *   - 解析：`resolveCliSelection(key)` → `{ cliId, wrapperCli? }`（纯映射，无副作用）
 */
import { CLI_OPTIONS } from './bot-config-editor.js';
import type { CliId } from '../adapters/cli/types.js';

/** 一个用户可选项；wrapperCli 不为空时表示它以该前缀启动。 */
export interface CliSelectOption {
  /** 唯一选择键。 */
  readonly key: string;
  /** 展示名。 */
  readonly label: string;
  /** 底层适配器 cliId。 */
  readonly cliId: CliId;
  /** 通用启动前缀；普通 CLI 无此项。 */
  readonly wrapperCli?: string;
}

/** 级联树节点：顶层 CLI；children 非空表示选中后进二级菜单。 */
export interface CliSelectGroup {
  readonly key: string;
  readonly label: string;
  /** 叶子项：直接可选；children：进二级菜单。两者必居其一。 */
  readonly option?: CliSelectOption;
  readonly children?: ReadonlyArray<CliSelectOption>;
}

/** 解析结果：落进 bot 配置的 cliId（+ 可选 wrapperCli）。 */
export interface ResolvedCliSelection {
  readonly cliId: CliId;
  readonly wrapperCli?: string;
}

// ─── Codex 选项 ──────────────────────────────────────────────────────────────
// 两种形态合并成一个「Codex」二级菜单（都是原生 cliId，无 wrapperCli）：
//   - Codex     → cliId `codex`     ：标准 codex CLI
//   - Codex Desktop → cliId `codex-app` ：Codex Desktop 的 app-server runner
const CODEX_NATIVE: CliSelectOption = { key: 'codex', label: 'Codex', cliId: 'codex' };
const CODEX_APP: CliSelectOption = { key: 'codex-app', label: 'Codex Desktop', cliId: 'codex-app' };
const CODEX_VARIANTS: ReadonlyArray<CliSelectOption> = [CODEX_NATIVE, CODEX_APP];

// ─── TRAE 选项 ───────────────────────────────────────────────────────────────
// TRAE 家族合并成一个「TRAE (CoCo)」二级菜单（都是原生 cliId，无 wrapperCli）：
//   - TRAE CLI (CoCo) → cliId `coco`  ：Trae CLI 的 CoCo 形态
//   - traex           → cliId `traex` ：TRAE CLI（traecli）
const TRAE_COCO: CliSelectOption = { key: 'coco', label: 'TRAE CLI（CoCo）', cliId: 'coco' };
const TRAE_X: CliSelectOption = { key: 'traex', label: 'traex', cliId: 'traex' };
const TRAE_VARIANTS: ReadonlyArray<CliSelectOption> = [TRAE_COCO, TRAE_X];

// ─── Pi 选项 ─────────────────────────────────────────────────────────────────
// Pi 与 Oh My Pi 不合并，但在菜单里相邻摆放（在 Pi 的位置成对发出）。
const PI_OPTION: CliSelectOption = { key: 'pi', label: 'Pi', cliId: 'pi' };
const OHMYPI_OPTION: CliSelectOption = { key: 'oh-my-pi', label: 'Oh My Pi', cliId: 'oh-my-pi' };

// ─── 扁平 / 级联 视图（均派生自 bot-config-editor 的 CLI_OPTIONS，避免再抄一份）──

/**
 * 级联树（终端 TUI 用）：顺序同 CLI_OPTIONS；
 * 支持原生 CLI 与公开的内置 wrapper 选项。
 */
export const CLI_SELECT_TREE: ReadonlyArray<CliSelectGroup> = [
  ...CLI_OPTIONS.flatMap((o): CliSelectGroup[] => {
    // codex + codex-app collapse into one「Codex」二级菜单 at codex's position.
    if (o.id === 'codex') return [{ key: 'codex', label: 'Codex', children: CODEX_VARIANTS }];
    if (o.id === 'codex-app') return [];
    // coco + traex collapse into one「TRAE (CoCo)」二级菜单 at coco's position.
    if (o.id === 'coco') return [{ key: 'trae', label: 'TRAE (CoCo)', children: TRAE_VARIANTS }];
    if (o.id === 'traex') return [];
    // Pi and Oh My Pi are kept as adjacent leaves (emitted together at pi's spot).
    if (o.id === 'pi') return [
      { key: 'pi', label: 'Pi', option: PI_OPTION },
      { key: 'oh-my-pi', label: 'Oh My Pi', option: OHMYPI_OPTION },
    ];
    if (o.id === 'oh-my-pi') return [];
    return [{ key: o.id, label: o.label, option: { key: o.id, label: o.label, cliId: o.id } }];
  }),
];

/**
 * 扁平选项（web 下拉 + 非 TTY 回退用）。
 */
export const CLI_SELECT_OPTIONS: ReadonlyArray<CliSelectOption> = [
  ...CLI_OPTIONS.flatMap((o) => {
    if (o.id === 'codex') return CODEX_VARIANTS;  // expands to Codex + Codex Desktop
    if (o.id === 'codex-app') return [];
    if (o.id === 'coco') return TRAE_VARIANTS;    // expands to TRAE CLI (CoCo) + traex
    if (o.id === 'traex') return [];
    if (o.id === 'pi') return [PI_OPTION, OHMYPI_OPTION];  // Pi + Oh My Pi adjacent
    if (o.id === 'oh-my-pi') return [];
    return [{ key: o.id, label: o.label, cliId: o.id }];
  }),
];

const OPTION_BY_KEY: ReadonlyMap<string, CliSelectOption> = new Map(
  CLI_SELECT_OPTIONS.map((o) => [o.key, o]),
);

/** 按 key 查选项；非法 key 返回 undefined。 */
export function lookupCliSelection(key: string): CliSelectOption | undefined {
  return OPTION_BY_KEY.get(key.trim());
}

/** 反查：由一个 bot 现有的 cliId + wrapperCli 得到对应的选择键（供编辑时高亮默认）。 */
export function selectionKeyForBot(cliId: string, wrapperCli?: string): string {
  if (wrapperCli && wrapperCli.trim()) {
    const match = CLI_SELECT_OPTIONS.find((o) => o.wrapperCli === wrapperCli.trim());
    if (match) return match.key;
  }
  return cliId;
}

/**
 * 把选择键解析成可落盘的 bot 配置片段（纯映射，无副作用）。非法 key 抛错。
 */
export function resolveCliSelection(key: string): ResolvedCliSelection {
  const opt = lookupCliSelection(key);
  if (!opt) {
    throw new Error(
      `未知 CLI 选择项 "${key}"。合法值：${CLI_SELECT_OPTIONS.map((o) => o.key).join(', ')}`,
    );
  }
  return opt.wrapperCli ? { cliId: opt.cliId, wrapperCli: opt.wrapperCli } : { cliId: opt.cliId };
}

// ─── 运行时：通用 wrapperCli 启动前缀（无 wrapper 脚本）────────────────────────

/** 按空格把 wrapperCli 前缀拆成 token（首 token 为 bin）。 */
export function parseWrapperCli(wrapperCli: string): string[] {
  return wrapperCli.trim().split(/\s+/).filter(Boolean);
}

/**
 * 剥掉不兼容 wrapper 拒收的 `--settings`（含其值），支持 `--settings <v>` 与
 * `--settings=<v>` 两种写法。其余参数原样保留。改用纯 argv 处理（跨系统、无 shell）。
 */
export function stripSettingsArgs(args: ReadonlyArray<string>): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--settings') { i++; continue; }     // 跳过 flag + 紧随其后的值
    if (a.startsWith('--settings=')) continue;       // 跳过 --settings=<v>
    out.push(a);
  }
  return out;
}

/**
 * 由 wrapperCli 前缀 + 底层 CLI 的 args 构造实际 spawn 的 `{ bin, args }`。
 *   - bin = 前缀首 token（经 binResolver 走 PATH 解析）
 *   - args = 前缀其余 token + CLI 参数
 * 前缀为空时返回 `{ bin: '', args }`，调用方据此跳过（不改写 spawn）。
 */
export function buildWrappedLaunch(
  wrapperCli: string,
  cliArgs: ReadonlyArray<string>,
  binResolver: (bin: string) => string = (b) => b,
): { bin: string; args: string[] } {
  const tokens = parseWrapperCli(wrapperCli);
  if (tokens.length === 0) return { bin: '', args: [...cliArgs] };
  return { bin: binResolver(tokens[0]), args: [...tokens.slice(1), ...cliArgs] };
}

/**
 * 把适配器给出的「裸 CLI 恢复命令」改写成 wrapperCli 形态，供 session-closed 卡片里
 * 展示给用户手动 resume。wrapperCli 未设时原样返回。
 */
export function decorateResumeForWrapper(
  cmd: string,
  wrapperCli: string | undefined,
): string {
  if (!wrapperCli || !wrapperCli.trim()) return cmd;
  const rest = cmd.replace(/^\S+\s*/, ''); // 去掉首个 token（底层 bin 名）
  return `${wrapperCli.trim()} ${rest}`.trimEnd();
}
