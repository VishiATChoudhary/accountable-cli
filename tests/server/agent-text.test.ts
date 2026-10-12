import { describe, it, expect } from "vitest";
import { visibleText, extractActionBlocks } from "../../shared/agent-text.js";

const block = '```freebies-action\n{"kind":"client.create","payload":{"name":"ACME"}}\n```';

describe("visibleText", () => {
  it("removes complete action blocks", () => {
    expect(visibleText(`Adding ACME.\n\n${block}\n\nDone?`)).toBe("Adding ACME.\n\nDone?");
  });
  it("hides an unterminated block while streaming", () => {
    expect(visibleText('Adding.\n\n```freebies-action\n{"kind":"cli')).toBe("Adding.");
  });
  it("hides a trailing partial fence opener", () => {
    expect(visibleText("Adding.\n\n```free")).toBe("Adding.");
    expect(visibleText("Adding.\n``")).toBe("Adding.");
  });
  it("keeps ordinary code blocks", () => {
    const t = "Run:\n\n```bash\nls\n```";
    expect(visibleText(t)).toBe(t);
  });
});

describe("extractActionBlocks", () => {
  it("parses each block's JSON", () => {
    const r = extractActionBlocks(`a\n${block}\nb\n${block}`);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ ok: true, value: { kind: "client.create", payload: { name: "ACME" } } });
  });
  it("reports malformed JSON without throwing", () => {
    const r = extractActionBlocks("```freebies-action\n{not json}\n```");
    expect(r[0].ok).toBe(false);
  });
});
