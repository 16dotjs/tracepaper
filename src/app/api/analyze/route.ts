import { NextRequest, NextResponse } from "next/server";
import {
  parseRepoUrl,
  getRepoInfo,
  getRepoTree,
  selectKeyFiles,
  getFileContent,
} from "@/lib/github";
import { analyzeRepoOverview } from "@/lib/claude";
import { GitHubApiError } from "@/lib/types";

const CORE_FILE_LIMIT = 5;

export async function POST(request: NextRequest) {
  let body: { repoUrl?: string };
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

  try {
    const repoInfo = await getRepoInfo(parsed.owner, parsed.repo);
    const fullTree = await getRepoTree(
      repoInfo.owner,
      repoInfo.repo,
      repoInfo.defaultBranch,
    );
    const keyFiles = selectKeyFiles(fullTree);

    const coreFilePaths = keyFiles.slice(0, CORE_FILE_LIMIT).map((f) => f.path);
    const coreFileResults = await Promise.allSettled(
      coreFilePaths.map(async (path) => ({
        path,
        content: await getFileContent(
          repoInfo.owner,
          repoInfo.repo,
          path,
          repoInfo.defaultBranch,
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

    return NextResponse.json({
      repoInfo,
      files: keyFiles.map((f) => ({ path: f.path, type: f.type })),
      overview,
    });
  } catch (err) {
    if (err instanceof GitHubApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message =
      err instanceof Error ? err.message : "Unknown error analyzing repo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
