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
import { analyzeRepoOverview } from "@/lib/claude";
import { GitHubApiError, ClaudeTimeoutError } from "@/lib/types";
import { getCached, setCached } from "@/lib/cache";
import { checkRateLimit, getClientKey } from "@/lib/rateLimit";
import { dedupeInFlight, isInFlight } from "@/lib/inFlight";
import { AnalyzeResult, AnalyzeStreamEvent } from "@/lib/analyzeProtocol";

const CORE_FILE_LIMIT = 5;
const ANALYZE_CACHE_TTL_MS = 60 * 60 * 1000;
const RATE_LIMIT = 8;
const RATE_WINDOW_MS = 60 * 1000;

function sseChunk(event: AnalyzeStreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
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
  const cacheKey =
    `analyze:${parsed.owner}/${parsed.repo}:${requestedBranch ?? "default"}`.toLowerCase();

  // Cache hit: return the plain JSON response this route has always returned — no reason
  // to open a streaming connection for a value we already have synchronously in hand.
  const cached = getCached<AnalyzeResult>(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  const isFollower = isInFlight(cacheKey);

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: AnalyzeStreamEvent) {
        try {
          controller.enqueue(sseChunk(event));
        } catch {
          // Client disconnected mid-stream — the pipeline keeps running server-side
          // (it still populates the cache for the next request), further sends here
          // are just harmless no-ops.
        }
      }

      try {
        if (isFollower) {
          send({ type: "joining" });
        }

        const result = await dedupeInFlight<AnalyzeResult>(
          cacheKey,
          async () => {
            // This function body only ever executes for the leader — dedupeInFlight never
            // calls it for a follower, so every send() below is implicitly leader-only by
            // construction, with no extra "if (!isFollower)" guards needed.
            const repoInfo = await getRepoInfo(parsed.owner, parsed.repo);
            send({ type: "stage", stage: "repo-info" });

            const currentBranch = requestedBranch || repoInfo.defaultBranch;

            const branchesPromise = getRepoBranches(
              repoInfo.owner,
              repoInfo.repo,
            ).then((branches) => {
              send({ type: "stage", stage: "branches" });
              return branches;
            });

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
            send({ type: "stage", stage: "tree" });

            const branches = await branchesPromise;

            const keyFiles = selectKeyFiles(fullTree);
            const stats = getRepoStats(fullTree);
            send({ type: "stage", stage: "key-files" });

            const coreFilePaths = keyFiles
              .slice(0, CORE_FILE_LIMIT)
              .map((f) => f.path);
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
                (
                  r,
                ): r is PromiseFulfilledResult<{
                  path: string;
                  content: string;
                }> => r.status === "fulfilled",
              )
              .map((r) => r.value);
            send({ type: "stage", stage: "core-files" });

            const overview = await analyzeRepoOverview(
              repoInfo,
              keyFiles.map((f) => f.path),
              coreFiles,
            );
            send({ type: "stage", stage: "claude-overview" });

            const finalResult: AnalyzeResult = {
              repoInfo,
              currentBranch,
              branches,
              files: keyFiles.map((f) => ({ path: f.path, type: f.type })),
              overview,
              stats,
            };

            setCached(cacheKey, finalResult, ANALYZE_CACHE_TTL_MS);
            return finalResult;
          },
        );

        send({ type: "complete", result, cached: false });
      } catch (err) {
        if (err instanceof GitHubApiError) {
          send({ type: "error", message: err.message, status: err.status });
        } else if (err instanceof ClaudeTimeoutError) {
          send({ type: "error", message: err.message, status: 504 });
        } else {
          const message =
            err instanceof Error ? err.message : "Unknown error analyzing repo";
          send({ type: "error", message, status: 500 });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
