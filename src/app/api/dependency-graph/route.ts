import { NextRequest, NextResponse } from "next/server";
import { getFileContent } from "@/lib/github";
import { buildDependencyGraph, isGraphEligible } from "@/lib/dependencyGraph";
import { GitHubApiError } from "@/lib/types";
import { getCached, setCached } from "@/lib/cache";
import { checkRateLimit, getClientKey } from "@/lib/rateLimit";

const CACHE_TTL_MS = 60 * 60 * 1000;
const RATE_LIMIT = 6;
const RATE_WINDOW_MS = 60 * 1000;
const MAX_PATHS = 60;

interface CachedGraph {
  nodes: { path: string; layer: number }[];
  edges: { from: string; to: string }[];
  unresolvedCount: number;
}

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(
    `graph:${getClientKey(request)}`,
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

  let body: {
    owner?: string;
    repo?: string;
    branch?: string;
    paths?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { owner, repo, branch, paths } = body;
  if (!owner || !repo || !branch || !Array.isArray(paths)) {
    return NextResponse.json(
      { error: "owner, repo, branch, and paths are all required" },
      { status: 400 },
    );
  }
  if (paths.length > MAX_PATHS) {
    return NextResponse.json(
      { error: "Too many files requested." },
      { status: 400 },
    );
  }

  const cacheKey = `graph:${owner}/${repo}`.toLowerCase();
  const cached = getCached<CachedGraph>(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  try {
    const codePaths = paths.filter(isGraphEligible);

    const fileResults = await Promise.allSettled(
      codePaths.map(async (path) => ({
        path,
        content: await getFileContent(owner, repo, path, branch),
      })),
    );
    const files = fileResults
      .filter(
        (r): r is PromiseFulfilledResult<{ path: string; content: string }> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value);

    // tsconfig.json fetched deliberately, even if it wasn't already in `paths` — path-alias
    // resolution matters enough not to leave to luck about the caller's file list.
    let tsconfigContent: string | null = null;
    const existingTsconfig = files.find((f) => f.path === "tsconfig.json");
    if (existingTsconfig) {
      tsconfigContent = existingTsconfig.content;
    } else {
      try {
        tsconfigContent = await getFileContent(
          owner,
          repo,
          "tsconfig.json",
          branch,
        );
      } catch {
        tsconfigContent = null; // repo may not use TypeScript at all — fine, aliases just won't resolve
      }
    }

    const result = buildDependencyGraph(files, tsconfigContent);
    setCached(cacheKey, result, CACHE_TTL_MS);

    return NextResponse.json({ ...result, cached: false });
  } catch (err) {
    if (err instanceof GitHubApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message =
      err instanceof Error
        ? err.message
        : "Unknown error building dependency graph";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
