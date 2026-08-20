import type { SessionSkillManifest } from './types.js';

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderSkillCatalogBlock(manifest: SessionSkillManifest | null | undefined): string {
  if (!manifest || manifest.prioritySkills.length === 0) return '';
  const skills = manifest.prioritySkills.flatMap((skill) => {
    const name = skill.name.trim();
    if (!name) return [];
    const normalizedTags = skill.tags.map(tag => tag.trim()).filter(Boolean);
    const tags = normalizedTags.length > 0 ? ` tags="${xmlEscape(normalizedTags.join(','))}"` : '';
    const descriptionText = skill.description?.trim();
    const description = descriptionText
      ? `\n    <description>${xmlEscape(descriptionText)}</description>`
      : '';
    return [`  <skill name="${xmlEscape(name)}"${tags}>${description}\n    <read>botmux skill show ${xmlEscape(name)}</read>\n  </skill>`];
  });
  if (skills.length === 0) return '';
  return [
    `<botmux_skills mode="${manifest.policyMode}">`,
    '  <instruction>When a priority skill matches the task, you must read it with `botmux skill show <name>` before answering or acting. Read referenced files with `botmux skill read <name> <relative-path>`.</instruction>',
    '  <instruction>Within one turn, read each Skill at most once. A successful `botmux skill show <name>` already returns its current content, so do not repeat it. During Skill execution, do not also call `botmux artifact show` for the same Skill. Use artifact commands only for explicit artifact management such as Create, Update, List, Show, History, Delete, or Contribute.</instruction>',
    '  <instruction>Artifact management takes precedence: for Create, Update, List, Show, History, Delete, or Contribute requests involving Knowledge, Skill, or Dynamic Workflow artifacts, first read `botmux skill show botmux-artifacts`. Do not read another priority skill solely because its name or description appears in the artifact management request. Read another skill only when its semantic content is needed to author or answer the request.</instruction>',
    ...skills,
    '</botmux_skills>',
  ].join('\n');
}
