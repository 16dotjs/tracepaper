export interface RepoInfo {
  owner: string;
  repo: string;
  defaultBranch: string;
}

export interface GitTreeItem {
  path: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export class ClaudeTimeoutError extends Error {
  constructor(message = "Claude took too long to respond . Please try again.") {
    super(message);
    this.name = "ClaudeTimeoutError";
  }
}
