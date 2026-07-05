"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  const router = useRouter();

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
          TRACEPAPER
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
      </div>
    </main>
  );
}
