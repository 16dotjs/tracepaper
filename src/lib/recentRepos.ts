const STORAGE_KEY = "tracepaper:recent-repos";
const MAX_ENTRIES = 5;

export interface RecentRepo {
  owner: string;
  repo: string;
  analyzedAt: number;
}

export function getRecentRepos(): RecentRepo[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRecentRepo(owner: string, repo: string): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getRecentRepos().filter(
      (r) =>
        !(
          r.owner.toLowerCase() === owner.toLowerCase() &&
          r.repo.toLowerCase() === repo.toLowerCase()
        ),
    );
    const updated = [
      { owner, repo, analyzedAt: Date.now() },
      ...existing,
    ].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // localStorage can fail in private browsing / quota-exceeded — non-critical, fail silently
  }
}

export function removeRecentRepo(owner: string, repo: string): void {
  if (typeof window === "undefined") return;
  try {
    const updated = getRecentRepos().filter(
      (r) =>
        !(
          r.owner.toLowerCase() === owner.toLowerCase() &&
          r.repo.toLowerCase() === repo.toLowerCase()
        ),
    );
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

export function formatRelativeTime(timestamp: number): string {
  const diffMin = Math.floor((Date.now() - timestamp) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}
