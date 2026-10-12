import { describe, it, expect } from "vitest";
import { AppError } from "../src/output/errors.js";
import { renderJson } from "../src/output/render.js";

describe("output", () => {
  it("AppError carries code and exit code", () => {
    const e = new AppError("NOT_FOUND", "missing", 1, { id: "x" });
    expect(e.code).toBe("NOT_FOUND");
    expect(e.exitCode).toBe(1);
    expect(e.details).toEqual({ id: "x" });
  });
  it("renderJson stringifies stably", () => {
    expect(renderJson({ b: 1, a: 2 })).toBe('{"b":1,"a":2}');
  });
});
