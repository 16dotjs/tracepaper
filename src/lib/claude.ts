import Anthropic from "@anthropic-ai/sdk";
import { RepoInfo } from "./types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-haiku-4-5-20251001";
const USE_MOCK = process.env.USE_MOCK_CLAUDE === "true";

export interface StartHereFile {
  path: string;
  reason: string;
}

export interface RepoOverview {
  summary: string;
  techStack: string[];
  startHere: StartHereFile[];
}

export interface AskAnswer {
  answer: string;
  relevantFiles: string[];
}

function mockOverview(repoInfo: RepoInfo, allPaths: string[]): RepoOverview {
  const startHere = allPaths
    .slice(0, Math.min(3, allPaths.length))
    .map((path) => ({
      path,
      reason:
        "[MOCK] Placeholder reason — real Claude output will replace this once credits are active.",
    }));

  return {
    summary: `[MOCK DATA] Standing in for Claude's real analysis of ${repoInfo.owner}/${repoInfo.repo}. This lets you test the full UI without spending API credits.`,
    techStack: ["Mock", "Placeholder", "Data"],
    startHere,
  };
}

function buildOverviewPrompt(
  repoInfo: RepoInfo,
  allPaths: string[],
  coreFiles: { path: string; content: string }[],
): string {
  const fileListText = allPaths.map((p) => `- ${p}`).join("\n");
  const coreFilesText = coreFiles
    .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 3000)}`)
    .join("\n\n");

  return `You are analyzing the GitHub repository ${repoInfo.owner}/${repoInfo.repo} to help a developer who has never seen this codebase before understand it quickly.

Here is a partial file listing (most relevant files, not exhaustive):
${fileListText}

Here is the full content of a few key files:
${coreFilesText}

Respond with ONLY valid JSON, no markdown formatting, no code fences, no preamble. Use this exact shape:
{
  "summary": "2-4 sentence plain-English explanation of what this project does and how it's organized",
  "techStack": ["list", "of", "key", "technologies", "detected"],
  "startHere": [
    { "path": "relative/file/path", "reason": "one sentence on why this is a good starting point" }
  ]
}

Pick 3-5 files for "startHere" — the files a new contributor should read first, in the order they should read them.`;
}

export async function analyzeRepoOverview(
  repoInfo: RepoInfo,
  allPaths: string[],
  coreFiles: { path: string; content: string }[],
): Promise<RepoOverview> {
  if (USE_MOCK) {
    return mockOverview(repoInfo, allPaths);
  }

  const prompt = buildOverviewPrompt(repoInfo, allPaths, coreFiles);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude did not return a text response");
  }

  const cleaned = textBlock.text.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleaned) as RepoOverview;
  } catch {
    throw new Error("Failed to parse Claude's response as JSON");
  }
}

function buildFileExplanationPrompt(
  repoInfo: RepoInfo,
  filePath: string,
  fileContent: string,
): string {
  return `You are helping a developer understand the file "${filePath}" from the repository ${repoInfo.owner}/${repoInfo.repo}.

File content:
---
${fileContent.slice(0, 6000)}
---

In 2-4 sentences, explain in plain English what this file does and how it likely connects to the rest of the codebase. Assume the reader is a competent developer who has never seen this specific file before. Respond with plain text only, no markdown, no preamble.`;
}

export async function explainFile(
  repoInfo: RepoInfo,
  filePath: string,
  fileContent: string,
): Promise<string> {
  if (USE_MOCK) {
    return `[MOCK] Placeholder explanation for ${filePath}. (Real file is ${fileContent.length} characters — confirms GitHub fetch works even in mock mode.)`;
  }

  const prompt = buildFileExplanationPrompt(repoInfo, filePath, fileContent);

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude did not return a text response");
  }

  return textBlock.text.trim();
}

function buildLocatePrompt(
  repoInfo: RepoInfo,
  question: string,
  allPaths: string[],
): string {
  const fileListText = allPaths.map((p) => `- ${p}`).join("\n");
  return `You are helping locate relevant files in the GitHub repository ${repoInfo.owner}/${repoInfo.repo} to answer a developer's question.

Question: "${question}"

File listing:
${fileListText}

Respond with ONLY valid JSON, no markdown, no preamble, in this exact shape:
{ "paths": ["most/relevant/file.ts", "second/most/relevant.ts"] }

Pick at most 3 files most likely to answer the question. If nothing seems relevant, return an empty array.`;
}

function buildAnswerPrompt(
  repoInfo: RepoInfo,
  question: string,
  files: { path: string; content: string }[],
): string {
  const filesText = files
    .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 4000)}`)
    .join("\n\n");
  return `You are helping a developer understand the repository ${repoInfo.owner}/${repoInfo.repo}.

Question: "${question}"

Relevant file contents:
${filesText || "(No file contents were available.)"}

Answer in 2-5 sentences, plain text only, no markdown, no preamble. If the files don't actually answer the question, say so honestly rather than guessing.`;
}

function mockAnswer(question: string, allPaths: string[]): AskAnswer {
  return {
    answer: `[MOCK] Placeholder answer to "${question}". Once credits are active, Claude will read the actual relevant files and answer for real.`,
    relevantFiles: allPaths.slice(0, Math.min(2, allPaths.length)),
  };
}

/**
 * Answers a free-form question about the repo. Takes a callback to fetch file content
 * rather than importing github.ts directly — keeps this file decoupled from GitHub specifics;
 * the API route is what wires the two together.
 */
export async function answerRepoQuestion(
  repoInfo: RepoInfo,
  question: string,
  allPaths: string[],
  fetchFileContent: (path: string) => Promise<string>,
): Promise<AskAnswer> {
  if (USE_MOCK) {
    return mockAnswer(question, allPaths);
  }

  const locateResponse = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: buildLocatePrompt(repoInfo, question, allPaths),
      },
    ],
  });

  let candidatePaths: string[] = [];
  const locateText = locateResponse.content.find((b) => b.type === "text");
  if (locateText && locateText.type === "text") {
    try {
      const cleaned = locateText.text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      candidatePaths = Array.isArray(parsed.paths)
        ? parsed.paths.slice(0, 3)
        : [];
    } catch {
      candidatePaths = [];
    }
  }

  const fileResults = await Promise.allSettled(
    candidatePaths.map(async (path) => ({
      path,
      content: await fetchFileContent(path),
    })),
  );
  const files = fileResults
    .filter(
      (r): r is PromiseFulfilledResult<{ path: string; content: string }> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value);

  const answerResponse = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    messages: [
      { role: "user", content: buildAnswerPrompt(repoInfo, question, files) },
    ],
  });

  const answerText = answerResponse.content.find((b) => b.type === "text");
  if (!answerText || answerText.type !== "text") {
    throw new Error("Claude did not return a text response");
  }

  return {
    answer: answerText.text.trim(),
    relevantFiles: files.map((f) => f.path),
  };
}
