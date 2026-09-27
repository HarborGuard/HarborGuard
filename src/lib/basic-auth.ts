export type BasicAuthConfig = { username: string; password: string } | null | 'invalid';

export function getBasicAuthConfig(env: NodeJS.ProcessEnv = process.env): BasicAuthConfig {
  const username = env.HARBORGUARD_AUTH_USERNAME;
  const password = env.HARBORGUARD_AUTH_PASSWORD;

  if (username === undefined && password === undefined) return null;
  if (!username || !password || username.includes(':') || /[\r\n]/.test(username)) {
    return 'invalid';
  }

  return { username, password };
}

function equalInConstantTime(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let difference = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    difference |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return difference === 0;
}

export function isBasicAuthValid(header: string | null, config: Exclude<BasicAuthConfig, null | 'invalid'>): boolean {
  if (!header || !/^Basic [A-Za-z0-9+/]+={0,2}$/i.test(header)) return false;

  try {
    const encoded = header.slice(6);
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    const credentials = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const separator = credentials.indexOf(':');
    if (separator < 0) return false;
    return equalInConstantTime(credentials.slice(0, separator), config.username) &&
      equalInConstantTime(credentials.slice(separator + 1), config.password);
  } catch {
    return false;
  }
}

export function basicAuthHeader(config: Exclude<BasicAuthConfig, null | 'invalid'>): string {
  const bytes = new TextEncoder().encode(`${config.username}:${config.password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}
