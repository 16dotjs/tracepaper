import { NextRequest, NextResponse } from "next/server";
import { getFileContent } from "@/lib/github";
import { answerRepoQuestion } from "@/lib/claude";
import { GitHubApiError } from "@/lib/types";
import { checkRateLimit, getClientKey } from "@/lib/rateLimit";

const RATE_LIMIT = 8;
const RATE_WINDOW_MS = 60 * 1000;
const MAX_QUESTION_LENGTH = 300;
const MAX_PATHS = 500;

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(
    `ask:${getClientKey(request)}`,
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
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      {
        error: `Question is too long (max ${MAX_QUESTION_LENGTH} characters).`,
      },
      { status: 400 },
    );
  }
  if (!Array.isArray(allPaths) || allPaths.length > MAX_PATHS) {
    return NextResponse.json({ error: "Invalid file list." }, { status: 400 });
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
