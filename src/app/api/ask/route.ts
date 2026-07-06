import { NextRequest, NextResponse } from "next/server";
import { getFileContent } from "@/lib/github";
import { answerRepoQuestion } from "@/lib/claude";
import { GitHubApiError } from "@/lib/types";

export async function POST(request: NextRequest) {
  let body: {
    owner?: string;
    repo?: string;
    branch?: string;
    question?: string;
    allPaths?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { owner, repo, branch, question, allPaths } = body;
  if (!owner || !repo || !branch || !question || !allPaths) {
    return NextResponse.json(
      { error: "owner, repo, branch, question, and allPaths are all required" },
      { status: 400 },
    );
  }
  if (question.trim().length < 3) {
    return NextResponse.json(
      { error: "Ask a real question — that one's too short to work with." },
      { status: 400 },
    );
  }

  try {
    const result = await answerRepoQuestion(
      { owner, repo, defaultBranch: branch },
      question.trim(),
      allPaths,
      (path) => getFileContent(owner, repo, path, branch),
    );
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GitHubApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message =
      err instanceof Error ? err.message : "Unknown error answering question";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
