import { describe, it, expect } from "vitest";
import { checkRequiredEnv } from "./envCheck";

describe("checkRequiredEnv", () => {
  it("flags ANTHROPIC_API_KEY as missing when absent and mock mode is off", () => {
    const result = checkRequiredEnv({});
    expect(result.missingRequired).toContain("ANTHROPIC_API_KEY");
  });

  it("does not flag it as missing when mock mode is on", () => {
    const result = checkRequiredEnv({ USE_MOCK_CLAUDE: "true" });
    expect(result.missingRequired).not.toContain("ANTHROPIC_API_KEY");
  });

  it("does not flag it as missing when it is actually set", () => {
    const result = checkRequiredEnv({ ANTHROPIC_API_KEY: "sk-ant-fake" });
    expect(result.missingRequired).not.toContain("ANTHROPIC_API_KEY");
  });

  it("warns about a missing GITHUB_TOKEN regardless of mock mode", () => {
    const result = checkRequiredEnv({ ANTHROPIC_API_KEY: "sk-ant-fake" });
    expect(result.missingOptionalWarnings).toHaveLength(1);
  });

  it("has no warnings at all when everything is configured", () => {
    const result = checkRequiredEnv({
      ANTHROPIC_API_KEY: "sk-ant-fake",
      GITHUB_TOKEN: "ghp-fake",
    });
    expect(result.missingRequired).toEqual([]);
    expect(result.missingOptionalWarnings).toEqual([]);
  });
});
