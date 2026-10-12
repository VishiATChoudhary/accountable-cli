// Field checks for onboarding. Each returns a short message, or null when fine.
export type Check = (v: string) => string | null;

export const required = (what: string): Check => (v) => (v.trim() ? null : `Your invoices need a ${what}.`);
export const iban: Check = (v) => {
  const s = v.replace(/\s+/g, "").toUpperCase();
  if (!s) return null;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return "That doesn't look like an IBAN (e.g. DE89 3704 0044 0532 0130 00).";
  // ISO 13616 mod-97 checksum
  const moved = s.slice(4) + s.slice(0, 4);
  const digits = moved.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
  return rem === 1 ? null : "That IBAN's check digits don't add up. Check for a typo.";
};
export const vatId: Check = (v) => (!v.trim() || /^[A-Z]{2}[A-Z0-9]{8,12}$/.test(v.replace(/\s+/g, "").toUpperCase()) ? null : "That doesn't look like a VAT ID (e.g. DE123456789).");
export const email: Check = (v) => (!v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : "That doesn't look like an email address.");
