import { describe, it, expect } from "vitest";
import { getFileName } from "./pathUtils";

describe("getFileName", () => {
  it("returns the last segment of a nested path", () => {
    expect(getFileName("src/lib/github.ts")).toBe("github.ts");
  });

  it("returns the whole string for a path with no slashes", () => {
    expect(getFileName("README.md")).toBe("README.md");
  });

  it("handles a trailing slash without crashing", () => {
    expect(getFileName("src/lib/")).toBe("");
  });
});
