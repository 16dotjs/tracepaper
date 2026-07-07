"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClockCounterClockwiseIcon, XIcon } from "@phosphor-icons/react";
import {
  getRecentRepos,
  removeRecentRepo,
  formatRelativeTime,
  RecentRepo,
} from "@/lib/recentRepos";

function looksLikeGitHubRepo(input: string): boolean {
  const trimmed = input.trim();
  if (/^[\w.-]+\/[\w.-]+$/.test(trimmed)) return true;
  if (/github\.com\/[\w.-]+\/[\w.-]+/.test(trimmed)) return true;
  return false;
}

export default function LandingPage() {
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recentRepos, setRecentRepos] = useState<RecentRepo[]>([]);
  const router = useRouter();

  useEffect(() => {
    setRecentRepos(getRecentRepos());
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = repoUrl.trim();

    if (!trimmed) {
      setError("Paste a GitHub repo URL first.");
      return;
    }
    if (!looksLikeGitHubRepo(trimmed)) {
      setError(
        'That doesn\'t look like a GitHub repo. Try "owner/repo" or a full github.com URL.',
      );
      return;
    }

    setError(null);
    setSubmitting(true);
    router.push(`/analyze?repo=${encodeURIComponent(trimmed)}`);
  }

  function handleRecentClick(r: RecentRepo) {
    setSubmitting(true);
    router.push(`/analyze?repo=${encodeURIComponent(`${r.owner}/${r.repo}`)}`);
  }

  function handleRemoveRecent(e: React.MouseEvent, r: RecentRepo) {
    e.stopPropagation();
    removeRecentRepo(r.owner, r.repo);
    setRecentRepos(getRecentRepos());
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="border border-[var(--bp-line)] rounded-sm p-4 mb-8 font-mono text-xs">
          <p className="text-[var(--bp-steel)] tracking-wider">PROJECT</p>
          <p className="mb-2">tracepaper/</p>
          <p className="text-[var(--bp-steel)] tracking-wider">FUNCTION</p>
          <p>Repository analysis &amp; onboarding</p>
        </div>

        <h1 className="font-mono text-2xl font-bold tracking-wide mb-2">
          tracepaper
        </h1>
        <p className="text-[var(--bp-steel)] text-sm mb-8">
          Paste a public GitHub repo. Get a plain-English breakdown of what it
          does, how it&apos;s structured, and where to start reading.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => {
              setRepoUrl(e.target.value);
              if (error) setError(null);
            }}
            placeholder="github.com/owner/repo"
            disabled={submitting}
            className="w-full bg-transparent border border-[var(--bp-steel)] rounded-sm px-4 py-3
                       font-mono text-sm placeholder:text-[var(--bp-steel)]/60
                       focus:outline-none focus:border-[var(--bp-red)] transition-colors
                       disabled:opacity-50"
          />
          {error && (
            <p className="text-[var(--bp-red)] text-xs font-mono">{error}</p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[var(--bp-red)] text-[var(--bp-navy-deep)] font-mono text-sm
                       font-bold py-3 rounded-sm hover:opacity-90 transition-opacity
                       disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "OPENING…" : "ANALYZE →"}
          </button>
        </form>

        <div className="mt-6 flex gap-3 text-xs font-mono text-[var(--bp-steel)]">
          <span>TRY:</span>
          <button
            onClick={() => setRepoUrl("vercel/swr")}
            className="underline hover:text-[var(--bp-cream)]"
          >
            vercel/swr
          </button>
        </div>

        {recentRepos.length > 0 && (
          <div className="mt-8 border-t border-[var(--bp-steel)]/30 pt-4">
            <p className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--bp-steel)] tracking-wider mb-3">
              <ClockCounterClockwiseIcon size={12} />
              RECENTLY ANALYZED
            </p>
            <div className="space-y-1.5">
              {recentRepos.map((r) => (
                <button
                  key={`${r.owner}/${r.repo}`}
                  onClick={() => handleRecentClick(r)}
                  disabled={submitting}
                  className="w-full flex items-center justify-between text-left px-3 py-2 rounded-sm
                             border border-[var(--bp-steel)]/20 hover:border-[var(--bp-red)]/50
                             transition-colors group disabled:opacity-50"
                >
                  <span className="font-mono text-xs text-[var(--bp-line)]">
                    {r.owner}/{r.repo}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-[var(--bp-steel)]">
                      {formatRelativeTime(r.analyzedAt)}
                    </span>
                    <span
                      onClick={(e) => handleRemoveRecent(e, r)}
                      className="text-[var(--bp-steel)] hover:text-[var(--bp-red)] transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <XIcon size={12} />
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
