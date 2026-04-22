export function requirePublicEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for Agent Guild runtime configuration.`);
  }

  return value;
}
