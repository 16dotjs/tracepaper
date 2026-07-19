import { RepoInfo, GitTreeItem, GitHubApiError } from "./types";

const GITHUB_API = "https://api.github.com";
const MAX_FETCHABLE_SIZE = 1_000_000;

function githubHeaders(): HeadersInit {
  const headers: HeadersInit = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

function encodeSegment(segment: string): string {
  return encodeURIComponent(segment);
}

function encodeMultiSegmentPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function parseRepoUrl(
  input: string,
): { owner: string; repo: string } | null {
  const trimmed = input
    .trim()
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
  const urlMatch = trimmed.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] };

  const shorthandMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shorthandMatch)
    return { owner: shorthandMatch[1], repo: shorthandMatch[2] };

  return null;
}

export async function getRepoInfo(
  owner: string,
  repo: string,
): Promise<RepoInfo> {
  const res = await fetch(
    `${GITHUB_API}/repos/${encodeSegment(owner)}/${encodeSegment(repo)}`,
    { headers: githubHeaders() },
  );

  if (res.status === 404)
    throw new GitHubApiError(
      "Repo not found — check it's public and spelled correctly.",
      404,
    );
  if (res.status === 403)
    throw new GitHubApiError(
      "GitHub rate limit hit. Try again shortly or add a GITHUB_TOKEN.",
      403,
    );
  if (!res.ok)
    throw new GitHubApiError(`GitHub API error: ${res.status}`, res.status);

  const data = await res.json();
  return { owner, repo, defaultBranch: data.default_branch };
}

export async function getRepoTree(
  owner: string,
  repo: string,
  branch: string,
): Promise<GitTreeItem[]> {
  const res = await fetch(
    `${GITHUB_API}/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/git/trees/${encodeMultiSegmentPath(branch)}?recursive=1`,
    { headers: githubHeaders() },
  );

  if (!res.ok)
    throw new GitHubApiError(
      `Failed to fetch repo tree: ${res.status}`,
      res.status,
    );

  const data = await res.json();
  if (data.truncated) {
    console.warn(
      `Tree for ${owner}/${repo} was truncated — very large repo, some files omitted.`,
    );
  }

  return data.tree as GitTreeItem[];
}

export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<string> {
  const res = await fetch(
    `${GITHUB_API}/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/contents/${encodeMultiSegmentPath(path)}?ref=${encodeMultiSegmentPath(branch)}`,
    { headers: githubHeaders() },
  );

  if (!res.ok)
    throw new GitHubApiError(`Failed to fetch file: ${path}`, res.status);

  const data = await res.json();

  if (data.encoding !== "base64" || typeof data.content !== "string") {
    if (typeof data.size === "number" && data.size > MAX_FETCHABLE_SIZE) {
      throw new GitHubApiError(
        `File too large to preview (${(data.size / 1_000_000).toFixed(1)}MB — over GitHub's 1MB inline-content limit).`,
        413,
      );
    }
    throw new Error(
      `Unexpected response for ${path}: no base64 content available.`,
    );
  }

  return Buffer.from(data.content, "base64").toString("utf-8");
}

const IGNORED_DIR_SEGMENTS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  "target",
  "out",
  ".turbo",
  ".cache",
]);

const IGNORED_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".map",
  ".lock",
  ".min.js",
  ".min.css",
];

const PRIORITY_FILENAMES = [
  "readme.md",
  "package.json",
  "tsconfig.json",
  "next.config.js",
  "next.config.ts",
  "next.config.mjs",
  "vite.config.ts",
  "requirements.txt",
  "pyproject.toml",
  "go.mod",
  "cargo.toml",
  "composer.json",
];

function isIgnoredPath(path: string): boolean {
  const segments = path.split("/");
  if (segments.some((s) => IGNORED_DIR_SEGMENTS.has(s))) return true;
  const lower = path.toLowerCase();
  return IGNORED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function selectKeyFiles(
  tree: GitTreeItem[],
  maxFiles = 40,
): GitTreeItem[] {
  const blobs = tree.filter(
    (item) => item.type === "blob" && !isIgnoredPath(item.path),
  );

  const scored = blobs.map((item) => {
    const depth = item.path.split("/").length;
    const filename = item.path.split("/").pop()!.toLowerCase();
    const isPriority = PRIORITY_FILENAMES.includes(filename);
    const isOversized =
      typeof item.size === "number" && item.size > MAX_FETCHABLE_SIZE;
    const score =
      (isPriority ? -1000 : 0) + depth * 10 + (isOversized ? 100_000 : 0);
    return { item, score };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, maxFiles).map((s) => s.item);
}

export function getRepoStats(tree: GitTreeItem[]): {
  totalFiles: number;
  totalFolders: number;
} {
  const relevant = tree.filter((item) => {
    const segments = item.path.split("/");
    return !segments.some((s) => IGNORED_DIR_SEGMENTS.has(s));
  });
  return {
    totalFiles: relevant.filter((i) => i.type === "blob").length,
    totalFolders: relevant.filter((i) => i.type === "tree").length,
  };
}
export async function getRepoBranches(
  owner: string,
  repo: string,
): Promise<string[]> {
  const res = await fetch(
    `${GITHUB_API}/repos/${encodeSegment(owner)}/${encodeSegment(repo)}/branches?per_page=30`,
    { headers: githubHeaders() },
  );
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .map((b: { name: string }) => b.name)
    .filter((n): n is string => typeof n === "string");
}
