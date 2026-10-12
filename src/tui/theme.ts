// Terminal palette: the app's cobalt and cream, plus cream blended into cobalt for
// secondary text (the terminal has no opacity, so tints are precomputed).
export const INK = "#0B3986";
export const INK_DEEP = "#082C6B";
export const PAPER = "#F4EBD8";
export const MUTED = "#B9C1C9";   // ~70% cream over cobalt
export const FAINT = "#7F92B1";   // ~45% cream over cobalt
export const ALERT = "#F2C38B";   // warm cream for validation messages

/** Letter-spaced capitals: the terminal stand-in for the app's small caps. */
export const tracked = (s: string) => s.toUpperCase().split("").join(" ");
