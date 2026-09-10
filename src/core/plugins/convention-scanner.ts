import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadSkillPackage } from '../skills/package.js';
import type {
  BotmuxPluginManifest,
  PluginCliCommandIndexEntry,
  PluginServiceMode,
  PluginContributions,
} from './types.js';

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function optionalRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`invalid_${field}`);
  return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readCliCommands(raw: unknown): PluginCliCommandIndexEntry[] {
  const record = optionalRecord(raw, 'cli_commands');
  if (record.schemaVersion !== 1) throw new Error('invalid_plugin_cli_commands_schema');
  if (!Array.isArray(record.commands)) throw new Error('invalid_plugin_cli_commands');
  const commands: PluginCliCommandIndexEntry[] = [];
  const seen = new Set<string>();
  for (const rawCommand of record.commands) {
    const command = optionalRecord(rawCommand, 'cli_command');
    const name = optionalString(command.name);
    if (!name || !/^[a-z][a-z0-9._:-]{0,63}$/.test(name)) throw new Error('invalid_plugin_cli_command_name');
    if (seen.has(name)) throw new Error(`duplicate_plugin_cli_command:${name}`);
    seen.add(name);
    const description = optionalString(command.description);
    commands.push({ name, ...(description ? { description } : {}) });
  }
  return commands;
}

function scanSkills(runtimeDir: string, pluginId: string): PluginContributions['skills'] {
  const root = join(runtimeDir, 'skills');
  if (!isDirectory(root)) return undefined;
  const skills = readdirSync(root)
    .filter(name => isDirectory(join(root, name)) && isFile(join(root, name, 'SKILL.md')))
    .sort()
    .map((name) => {
      const path = `skills/${name}`;
      const skill = loadSkillPackage(join(runtimeDir, path), {
        source: { type: 'plugin', pluginId, root: runtimeDir },
      });
      return { name: skill.name, path };
    });
  return skills.length > 0 ? skills : undefined;
}

function scanDashboard(runtimeDir: string, pluginId: string): PluginContributions['dashboard'] {
  const entry = 'dashboard/index.js';
  if (!isFile(join(runtimeDir, entry))) return undefined;
  return [{ id: pluginId, route: `#/plugins/${pluginId}`, entry }];
}

function scanCli(runtimeDir: string): PluginContributions['cli'] {
  const entry = 'cli/index.js';
  const commandsPath = 'cli/commands.json';
  const hasEntry = isFile(join(runtimeDir, entry));
  const hasCommands = isFile(join(runtimeDir, commandsPath));
  if (!hasEntry && !hasCommands) return undefined;
  if (!hasEntry) throw new Error('plugin_cli_entry_not_found');
  if (!hasCommands) throw new Error('plugin_cli_commands_not_found');
  const commands = readCliCommands(JSON.parse(readFileSync(join(runtimeDir, commandsPath), 'utf-8')));
  return { entry, commandsPath, commands };
}

function scanService(runtimeDir: string, mode: PluginServiceMode | undefined): PluginContributions['service'] {
  const entry = 'service/index.js';
  const exists = isFile(join(runtimeDir, entry));
  if (!exists && !mode) return undefined;
  if (exists && !mode) throw new Error('plugin_service_missing_manifest');
  if (!exists && mode) throw new Error('plugin_service_entry_not_found');
  return { entry, mode: mode! };
}

export function scanPluginContributions(runtimeDir: string, manifest: BotmuxPluginManifest): PluginContributions | undefined {
  const skills = scanSkills(runtimeDir, manifest.id);
  const dashboard = scanDashboard(runtimeDir, manifest.id);
  const cli = scanCli(runtimeDir);
  const service = scanService(runtimeDir, manifest.service?.mode);
  const contributions: PluginContributions = {
    ...(skills ? { skills } : {}),
    ...(dashboard ? { dashboard } : {}),
    ...(cli ? { cli } : {}),
    ...(service ? { service } : {}),
  };
  return Object.keys(contributions).length > 0 ? contributions : undefined;
}

export function contributionSkills(contributions: PluginContributions | undefined): string[] {
  return contributions?.skills?.map(entry => entry.path) ?? [];
}
