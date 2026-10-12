// Read-only allowlist for the in-app agent. Only list/get style commands pass.
const READ: Record<string, string[]> = {
  clients: ["list", "get"],
  invoices: ["list", "get"],
  quotes: ["list", "get"],
  expenses: ["list", "get"],
  tx: ["list"],
  business: ["get"],
};

export function isAllowed(args: string[]): boolean {
  if (args.some((a) => a === "--data-dir" || a.startsWith("--data-dir="))) return false;
  const [group, action] = args;
  if (!group || !action) return false;
  return READ[group]?.includes(action) ?? false;
}
