// Plain-console styling for messages printed outside the TUI panel.
const bg = "\x1b[48;2;11;57;134m", fg = "\x1b[38;2;244;235;216m";
export const reset = "\x1b[0m";
export const dim = "\x1b[2m";
export const badge = (text: string) => `${bg}${fg} ${text} ${reset}`;
