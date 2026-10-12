import { describe, it, expect } from "vitest";
import { isAllowed } from "../../bin/freebies-ro-policy.js";

describe("freebies-ro policy", () => {
  it("allows read commands", () => {
    expect(isAllowed(["clients", "list"])).toBe(true);
    expect(isAllowed(["invoices", "get", "abc"])).toBe(true);
    expect(isAllowed(["tx", "list", "--status", "unclassified"])).toBe(true);
    expect(isAllowed(["business", "get"])).toBe(true);
  });
  it("denies writes and unknown commands", () => {
    expect(isAllowed(["clients", "add", "--name", "x"])).toBe(false);
    expect(isAllowed(["invoices", "create", "--from", "f"])).toBe(false);
    expect(isAllowed(["tx", "classify", "id", "--category", "x"])).toBe(false);
    expect(isAllowed(["init"])).toBe(false);
    expect(isAllowed([])).toBe(false);
  });
  it("denies global flags that could redirect the data dir", () => {
    expect(isAllowed(["--data-dir", "/tmp/x", "clients", "list"])).toBe(false);
    expect(isAllowed(["clients", "list", "--data-dir", "/tmp/x"])).toBe(false);
  });
});
