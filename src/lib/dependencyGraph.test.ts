import { describe, it, expect } from "vitest";
import {
  extractImportSpecifiers,
  resolveJsImport,
  resolvePythonImport,
  resolveGoImport,
  parseTsconfigPaths,
  parseGoModuleName,
  detectLanguage,
} from "./dependencyGraph";

describe("detectLanguage", () => {
  it("detects JS/TS extensions", () => {
    expect(detectLanguage("src/index.ts")).toBe("javascript");
    expect(detectLanguage("src/index.jsx")).toBe("javascript");
  });
  it("detects Python", () => {
    expect(detectLanguage("src/main.py")).toBe("python");
  });
  it("detects Go", () => {
    expect(detectLanguage("main.go")).toBe("go");
  });
  it("returns null for an unsupported language", () => {
    expect(detectLanguage("Main.java")).toBeNull();
  });
});

describe("extractImportSpecifiers — javascript", () => {
  it("extracts a named import", () => {
    expect(
      extractImportSpecifiers(`import { foo } from './bar';`, "javascript"),
    ).toEqual(["./bar"]);
  });
});

describe("extractImportSpecifiers — python", () => {
  it("extracts a simple import", () => {
    expect(extractImportSpecifiers("import os", "python")).toEqual(["os"]);
  });
  it("extracts a from-import", () => {
    expect(
      extractImportSpecifiers("from foo.bar import baz", "python"),
    ).toEqual(["foo.bar"]);
  });
  it("extracts a relative from-import", () => {
    expect(extractImportSpecifiers("from ..pkg import mod", "python")).toEqual([
      "..pkg",
    ]);
  });
  it("splits a comma-separated plain import", () => {
    const result = extractImportSpecifiers("import os, sys", "python").sort();
    expect(result).toEqual(["os", "sys"]);
  });
});

describe("extractImportSpecifiers — go", () => {
  it("extracts a single-line import", () => {
    expect(extractImportSpecifiers('import "fmt"', "go")).toEqual(["fmt"]);
  });
  it("extracts every import inside a block", () => {
    const content = `import (\n\t"fmt"\n\t"github.com/foo/bar/internal/x"\n)`;
    const result = extractImportSpecifiers(content, "go").sort();
    expect(result).toEqual(["fmt", "github.com/foo/bar/internal/x"]);
  });
});

describe("resolveJsImport", () => {
  const knownPaths = new Set(["src/lib/github.ts", "src/app/page.tsx"]);

  it("resolves a relative import against the importing file's directory", () => {
    expect(
      resolveJsImport("./github", "src/lib/claude.ts", knownPaths, {}),
    ).toEqual(["src/lib/github.ts"]);
  });
  it("resolves a tsconfig-aliased import", () => {
    const aliases = { "@/": "src/" };
    expect(
      resolveJsImport("@/lib/github", "src/app/page.tsx", knownPaths, aliases),
    ).toEqual(["src/lib/github.ts"]);
  });
  it("returns empty for an external package", () => {
    expect(
      resolveJsImport("react", "src/app/page.tsx", knownPaths, {}),
    ).toEqual([]);
  });
});

describe("resolvePythonImport", () => {
  // pkg/sub/__init__.py included so we can distinguish "my own package" (pkg.sub) from
  // "the parent package" (pkg) — the exact distinction the bare-dot tests below check.
  const knownPaths = new Set([
    "pkg/sub/mod.py",
    "pkg/sub/__init__.py",
    "pkg/utils.py",
    "pkg/__init__.py",
  ]);
  const ctx = { tsconfigAliases: {}, goModuleName: null, hasSrcRoot: false };

  it("resolves a single-dot relative import to a sibling module", () => {
    expect(
      resolvePythonImport(".mod", "pkg/sub/other.py", knownPaths, ctx),
    ).toEqual(["pkg/sub/mod.py"]);
  });
  it("resolves a double-dot relative import up one directory", () => {
    expect(
      resolvePythonImport("..utils", "pkg/sub/mod.py", knownPaths, ctx),
    ).toEqual(["pkg/utils.py"]);
  });
  it("resolves a bare \"from . import x\" to the CURRENT package's __init__.py (not the parent's)", () => {
    // "." from pkg/sub/mod.py means "my own package" — pkg.sub — not pkg.
    expect(resolvePythonImport(".", "pkg/sub/mod.py", knownPaths, ctx)).toEqual(
      ["pkg/sub/__init__.py"],
    );
  });
  it('resolves a bare "from .. import x" to the PARENT package\'s __init__.py', () => {
    expect(
      resolvePythonImport("..", "pkg/sub/mod.py", knownPaths, ctx),
    ).toEqual(["pkg/__init__.py"]);
  });
  it("resolves an absolute import against the repo root", () => {
    const paths = new Set(["pkg/utils.py"]);
    expect(resolvePythonImport("pkg.utils", "main.py", paths, ctx)).toEqual([
      "pkg/utils.py",
    ]);
  });
  it("returns empty for an external package like a stdlib/third-party module", () => {
    expect(resolvePythonImport("numpy", "main.py", knownPaths, ctx)).toEqual(
      [],
    );
  });
});

describe("resolveGoImport", () => {
  const knownPaths = new Set([
    "internal/auth/handler.go",
    "internal/auth/middleware.go",
    "main.go",
  ]);

  it("resolves an internal import to every file in that package directory", () => {
    const result = resolveGoImport(
      "github.com/you/repo/internal/auth",
      knownPaths,
      "github.com/you/repo",
    );
    expect(result.wasInternal).toBe(true);
    expect(result.resolved.sort()).toEqual([
      "internal/auth/handler.go",
      "internal/auth/middleware.go",
    ]);
  });
  it("treats an external package as not internal", () => {
    const result = resolveGoImport(
      "github.com/gin-gonic/gin",
      knownPaths,
      "github.com/you/repo",
    );
    expect(result.wasInternal).toBe(false);
    expect(result.resolved).toEqual([]);
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
});

describe("parseGoModuleName", () => {
  it("extracts the module name from a go.mod file", () => {
    expect(parseGoModuleName("module github.com/you/repo\n\ngo 1.22\n")).toBe(
      "github.com/you/repo",
    );
  });
  it("returns null when there is no module line", () => {
    expect(parseGoModuleName("go 1.22\n")).toBeNull();
  });
});
