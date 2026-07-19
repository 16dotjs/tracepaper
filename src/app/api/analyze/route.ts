import { NextRequest, NextResponse } from "next/server";
import {
  parseRepoUrl,
  getRepoInfo,
  getRepoTree,
  selectKeyFiles,
  getFileContent,
  getRepoStats,
  getRepoBranches,
} from "@/lib/github";
import { analyzeRepoOverview, RepoOverview } from "@/lib/claude";
import { GitHubApiError, RepoInfo } from "@/lib/types";
import { getCached, setCached } from "@/lib/cache";
import { checkRateLimit, getClientKey } from "@/lib/rateLimit";

const CORE_FILE_LIMIT = 5;
const ANALYZE_CACHE_TTL_MS = 60 * 60 * 1000;
const RATE_LIMIT = 8;
const RATE_WINDOW_MS = 60 * 1000;

interface AnalyzeResult {
  repoInfo: RepoInfo;
  currentBranch: string;
  branches: string[];
  files: { path: string; type: string }[];
  overview: RepoOverview;
  stats: { totalFiles: number; totalFolders: number };
}

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(
    `analyze:${getClientKey(request)}`,
    RATE_LIMIT,
    RATE_WINDOW_MS,
  );
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  let body: { repoUrl?: string; branch?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  if (!body.repoUrl) {
    return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });
  }

  const parsed = parseRepoUrl(body.repoUrl);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          "Couldn't parse that as a GitHub repo. Try a URL like https://github.com/owner/repo.",
      },
      { status: 400 },
    );
  }

  const requestedBranch = body.branch?.trim() || null;
  // Cache key now includes branch, since main and a feature branch can have completely
  // different content. Old cache entries from before this change use a different key
  // format — they'll simply age out via TTL rather than collide with anything.
  const cacheKey =
    `analyze:${parsed.owner}/${parsed.repo}:${requestedBranch ?? "default"}`.toLowerCase();
  const cached = getCached<AnalyzeResult>(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  try {
    const repoInfo = await getRepoInfo(parsed.owner, parsed.repo);
    const currentBranch = requestedBranch || repoInfo.defaultBranch;

    // Branch list fetch runs in parallel with the tree fetch — it's independent and
    // non-critical, no reason to make the user wait for it sequentially.
    const branchesPromise = getRepoBranches(repoInfo.owner, repoInfo.repo);

    let fullTree;
    try {
      fullTree = await getRepoTree(
        repoInfo.owner,
        repoInfo.repo,
        currentBranch,
      );
    } catch (err) {
      if (
        err instanceof GitHubApiError &&
        err.status === 404 &&
        requestedBranch
      ) {
        throw new GitHubApiError(
          `Branch "${requestedBranch}" not found in ${parsed.owner}/${parsed.repo}.`,
          404,
        );
      }
      throw err;
    }

    const branches = await branchesPromise;
    const keyFiles = selectKeyFiles(fullTree);
    const stats = getRepoStats(fullTree);

    const coreFilePaths = keyFiles.slice(0, CORE_FILE_LIMIT).map((f) => f.path);
    const coreFileResults = await Promise.allSettled(
      coreFilePaths.map(async (path) => ({
        path,
        content: await getFileContent(
          repoInfo.owner,
          repoInfo.repo,
          path,
          currentBranch,
        ),
      })),
    );

    const coreFiles = coreFileResults
      .filter(
        (r): r is PromiseFulfilledResult<{ path: string; content: string }> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value);

    const overview = await analyzeRepoOverview(
      repoInfo,
      keyFiles.map((f) => f.path),
      coreFiles,
    );

    const result: AnalyzeResult = {
      repoInfo,
      currentBranch,
      branches,
      files: keyFiles.map((f) => ({ path: f.path, type: f.type })),
      overview,
      stats,
    };

    setCached(cacheKey, result, ANALYZE_CACHE_TTL_MS);

    return NextResponse.json({ ...result, cached: false });
  } catch (err) {
    if (err instanceof GitHubApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message =
      err instanceof Error ? err.message : "Unknown error analyzing repo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
