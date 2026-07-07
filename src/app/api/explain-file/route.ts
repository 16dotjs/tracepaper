import { NextRequest, NextResponse } from "next/server";
import { getFileContent } from "@/lib/github";
import { explainFile } from "@/lib/claude";
import { GitHubApiError } from "@/lib/types";
import { getCached, setCached } from "@/lib/cache";

const EXPLAIN_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const PREVIEW_CHAR_LIMIT = 4000;

interface CachedExplain {
  explanation: string;
  content: string;
  truncated: boolean;
}

export async function POST(request: NextRequest) {
  let body: { owner?: string; repo?: string; branch?: string; path?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { owner, repo, branch, path } = body;
  if (!owner || !repo || !branch || !path) {
    return NextResponse.json(
      { error: "owner, repo, branch, and path are all required" },
      { status: 400 },
    );
  }

  const cacheKey = `explain:${owner}/${repo}/${path}`.toLowerCase();
  const cached = getCached<CachedExplain>(cacheKey);
  if (cached) {
    return NextResponse.json({ path, ...cached, cached: true });
  }

  try {
    const content = await getFileContent(owner, repo, path, branch);
    const explanation = await explainFile(
      { owner, repo, defaultBranch: branch },
      path,
      content,
    );

    const truncated = content.length > PREVIEW_CHAR_LIMIT;
    const preview = content.slice(0, PREVIEW_CHAR_LIMIT);

    setCached(
      cacheKey,
      { explanation, content: preview, truncated },
      EXPLAIN_CACHE_TTL_MS,
    );

    return NextResponse.json({
      path,
      explanation,
      content: preview,
      truncated,
      cached: false,
    });
  } catch (err) {
    if (err instanceof GitHubApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message =
      err instanceof Error ? err.message : "Unknown error explaining file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
