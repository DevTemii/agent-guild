export function normalizeChainId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
    const parsedHex = Number.parseInt(trimmed, 16);
    return Number.isFinite(parsedHex) ? parsedHex : null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
