import Anthropic from "@anthropic-ai/sdk";
import { RepoInfo } from "./types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = "claude-haiku-4-5-20251001";

export interface StartHereFile {
  path: string;
  reason: string;
}

export interface RepoOverview {
  summary: string;
  techStack: string[];
  startHere: StartHereFile[];
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
