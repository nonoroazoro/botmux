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
    ...skills,
    '</botmux_skills>',
  ].join('\n');
}
