const SENSITIVE_PATTERNS: Array<{ code: string; pattern: RegExp }> = [
  { code: 'private_key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i },
  { code: 'bearer_token', pattern: /\bbearer\s+[a-z0-9._~+/=-]{16,}/i },
  { code: 'assigned_secret', pattern: /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\b\s*[:=]\s*["']?[a-z0-9._~+/=-]{12,}/i },
  { code: 'lark_app_secret', pattern: /\b(?:cli|app)[_-]?secret\b\s*[:=]\s*["']?[a-z0-9._~+/=-]{12,}/i },
];

export function findSensitiveCapabilityContent(value: string): string[] {
  return SENSITIVE_PATTERNS
    .filter(({ pattern }) => pattern.test(value))
    .map(({ code }) => code);
}
