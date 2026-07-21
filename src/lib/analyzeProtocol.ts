import type { RepoInfo } from "./types";
import type { RepoOverview } from "./claude";

export const ANALYZE_STAGES = [
  "repo-info",
  "tree",
  "branches",
  "key-files",
  "core-files",
  "claude-overview",
] as const;

export type AnalyzeStage = (typeof ANALYZE_STAGES)[number];

export interface AnalyzeResult {
  repoInfo: RepoInfo;
  currentBranch: string;
  branches: string[];
  files: { path: string; type: string }[];
  overview: RepoOverview;
  stats: { totalFiles: number; totalFolders: number };
}

export type AnalyzeStreamEvent =
  | { type: "stage"; stage: AnalyzeStage }
  | { type: "joining" }
  | { type: "complete"; result: AnalyzeResult; cached: boolean }
  | { type: "error"; message: string; status: number };

export function parseSSEBuffer(buffer: string): {
  events: AnalyzeStreamEvent[];
  remainder: string;
} {
  const events: AnalyzeStreamEvent[] = [];
  let remaining = buffer;
  let boundary: number;

  while ((boundary = remaining.indexOf("\n\n")) !== -1) {
    const rawEvent = remaining.slice(0, boundary);
    remaining = remaining.slice(boundary + 2);
    const dataLine = rawEvent.split("\n").find((l) => l.startsWith("data: "));
    if (!dataLine) continue;
    try {
      events.push(
        JSON.parse(dataLine.slice("data: ".length)) as AnalyzeStreamEvent,
      );
    } catch {
      // Malformed chunk — skip it rather than let one bad event kill the whole stream read.
    }
  }

  return { events, remainder: remaining };
}
