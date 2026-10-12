const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
export const formatEuro = (cents: number): string => EUR.format(cents / 100);

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
}
