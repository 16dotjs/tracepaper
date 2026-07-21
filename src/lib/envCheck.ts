export interface EnvSource {
  USE_MOCK_CLAUDE?: string;
  ANTHROPIC_API_KEY?: string;
  GITHUB_TOKEN?: string;
}

export interface EnvCheckResult {
  missingRequired: string[];
  missingOptionalWarnings: string[];
}

export function checkRequiredEnv(env: EnvSource): EnvCheckResult {
  const useMock = env.USE_MOCK_CLAUDE === "true";
  const missingRequired: string[] = [];
  const missingOptionalWarnings: string[] = [];

  if (!useMock && !env.ANTHROPIC_API_KEY) {
    missingRequired.push("ANTHROPIC_API_KEY");
  }

  if (!env.GITHUB_TOKEN) {
    missingOptionalWarnings.push(
      "GITHUB_TOKEN not set — GitHub API calls are capped at 60 requests/hour instead of 5,000/hour.",
    );
  }

  return { missingRequired, missingOptionalWarnings };
}
