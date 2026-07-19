import { describe, it, expect } from "vitest";
import {
  extractImportSpecifiers,
  resolveImportPath,
  parseTsconfigPaths,
} from "./dependencyGraph";

describe("extractImportSpecifiers", () => {
  it("extracts a named ES import", () => {
    expect(extractImportSpecifiers(`import { foo } from './bar';`)).toEqual([
      "./bar",
    ]);
  });

  it("extracts a default import and a require() call", () => {
    const content = `import x from './a';\nconst y = require('./b');`;
    expect(extractImportSpecifiers(content).sort()).toEqual(["./a", "./b"]);
  });

  it("deduplicates repeated imports of the same specifier", () => {
    const content = `import { a } from './x';\nimport { b } from './x';`;
    expect(extractImportSpecifiers(content)).toEqual(["./x"]);
  });

  it("returns an empty array for content with no imports", () => {
    expect(extractImportSpecifiers("const x = 1;")).toEqual([]);
  });
});

describe("resolveImportPath", () => {
  const knownPaths = new Set(["src/lib/github.ts", "src/app/page.tsx"]);

  it("resolves a relative import against the importing file's directory", () => {
    const resolved = resolveImportPath(
      "./github",
      "src/lib/claude.ts",
      knownPaths,
      {},
    );
    expect(resolved).toBe("src/lib/github.ts");
  });

  it("resolves a tsconfig-aliased import", () => {
    const aliases = { "@/": "src/" };
    const resolved = resolveImportPath(
      "@/lib/github",
      "src/app/page.tsx",
      knownPaths,
      aliases,
    );
    expect(resolved).toBe("src/lib/github.ts");
  });

  it("returns null for a bare package specifier (external dependency)", () => {
    expect(
      resolveImportPath("react", "src/app/page.tsx", knownPaths, {}),
    ).toBeNull();
  });

  it("returns null when the resolved path isn't in the known file set", () => {
    const resolved = resolveImportPath(
      "./nonexistent",
      "src/lib/claude.ts",
      knownPaths,
      {},
    );
    expect(resolved).toBeNull();
  });
});

describe("parseTsconfigPaths", () => {
  it("extracts a wildcard alias mapping", () => {
    const tsconfig = JSON.stringify({
      compilerOptions: { paths: { "@/*": ["./src/*"] } },
    });
    expect(parseTsconfigPaths(tsconfig)).toEqual({ "@/": "src/" });
  });

  it("returns an empty object for malformed JSON instead of throwing", () => {
    expect(parseTsconfigPaths("{ not valid json")).toEqual({});
  });

  it("returns an empty object when there are no paths configured", () => {
    const tsconfig = JSON.stringify({ compilerOptions: {} });
    expect(parseTsconfigPaths(tsconfig)).toEqual({});
  });
});
