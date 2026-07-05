import { RepoInfo, GitTreeItem, GitHubApiError } from "./types";

const GITHUB_API = "https://api.github.com";

function githubHeaders(): HeadersInit {
  const headers: HeadersInit = { Accept: "application/vnd.github+json" };
  // Optional: add a personal access token to .env.local as GITHUB_TOKEN
  // to bump the rate limit from 60/hr to 5,000/hr while developing.
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

/** Parses a GitHub URL (or "owner/repo" shorthand) into its parts. */
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

/** Fetches repo metadata, including its default branch (main/master/etc). */
export async function getRepoInfo(
  owner: string,
  repo: string,
): Promise<RepoInfo> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: githubHeaders(),
  });

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

/** Fetches the full file tree for a repo (recursive). */
export async function getRepoTree(
  owner: string,
  repo: string,
  branch: string,
): Promise<GitTreeItem[]> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
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

/** Fetches a single file's raw text content. */
export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  branch: string,
): Promise<string> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
    { headers: githubHeaders() },
  );

  if (!res.ok)
    throw new GitHubApiError(`Failed to fetch file: ${path}`, res.status);

  const data = await res.json();
  if (data.encoding !== "base64")
    throw new Error(`Unexpected encoding for ${path}: ${data.encoding}`);

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

/** Picks a manageable, high-signal subset of files to send to Claude for analysis. */
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
    // Lower score = higher priority: README/config files first, then shallower paths.
    const score = (isPriority ? -1000 : 0) + depth * 10;
    return { item, score };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, maxFiles).map((s) => s.item);
}
