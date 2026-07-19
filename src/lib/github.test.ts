import { describe, it, expect } from "vitest";
import { parseRepoUrl, selectKeyFiles, getRepoStats } from "./github";
import type { GitTreeItem } from "./types";

describe("parseRepoUrl", () => {
  it("parses a full github.com URL", () => {
    expect(parseRepoUrl("https://github.com/vercel/swr")).toEqual({
      owner: "vercel",
      repo: "swr",
    });
  });

  it("parses a URL with a trailing slash", () => {
    expect(parseRepoUrl("https://github.com/vercel/swr/")).toEqual({
      owner: "vercel",
      repo: "swr",
    });
  });

  it("parses owner/repo shorthand", () => {
    expect(parseRepoUrl("vercel/swr")).toEqual({
      owner: "vercel",
      repo: "swr",
    });
  });

  it("strips a trailing .git", () => {
    expect(parseRepoUrl("https://github.com/vercel/swr.git")).toEqual({
      owner: "vercel",
      repo: "swr",
    });
  });

  it("returns null for unparseable input", () => {
    expect(parseRepoUrl("not a repo at all")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseRepoUrl("")).toBeNull();
  });
});

describe("selectKeyFiles", () => {
  const tree: GitTreeItem[] = [
    { path: "README.md", type: "blob", sha: "1" },
    { path: "src/index.ts", type: "blob", sha: "2" },
    { path: "src/deep/nested/file.ts", type: "blob", sha: "3" },
    { path: "node_modules/foo/index.js", type: "blob", sha: "4" },
    { path: ".git/HEAD", type: "blob", sha: "5" },
  ];

  it("prioritizes README over deeply nested files", () => {
    const result = selectKeyFiles(tree);
    expect(result[0].path).toBe("README.md");
  });

  it("excludes ignored directories like node_modules and .git", () => {
    const result = selectKeyFiles(tree);
    expect(result.some((f) => f.path.includes("node_modules"))).toBe(false);
    expect(result.some((f) => f.path.includes(".git"))).toBe(false);
  });

  it("respects the maxFiles cap", () => {
    const bigTree: GitTreeItem[] = Array.from({ length: 100 }, (_, i) => ({
      path: `file${i}.ts`,
      type: "blob" as const,
      sha: String(i),
    }));
    expect(selectKeyFiles(bigTree, 10)).toHaveLength(10);
  });
});

describe("getRepoStats", () => {
  it("counts files and folders separately, excluding ignored directories", () => {
    const tree: GitTreeItem[] = [
      { path: "src", type: "tree", sha: "1" },
      { path: "src/index.ts", type: "blob", sha: "2" },
      { path: "node_modules", type: "tree", sha: "3" },
      { path: "node_modules/foo.js", type: "blob", sha: "4" },
    ];
    const stats = getRepoStats(tree);
    expect(stats.totalFiles).toBe(1);
    expect(stats.totalFolders).toBe(1);
  });
});
