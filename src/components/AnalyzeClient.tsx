"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  LightningIcon,
  DownloadSimpleIcon,
  FolderIcon,
  FileIcon,
  LinkSimpleIcon,
  CheckIcon,
} from "@phosphor-icons/react";
import BlueprintTree, { BlueprintTreeHandle } from "@/components/BlueprintTree";
import QABox from "@/components/QABox";
import { buildFolderTree } from "@/lib/repoTree";
import { addRecentRepo } from "@/lib/recentRepos";
import { buildMarkdown, downloadMarkdown } from "@/lib/exportMarkdown";

interface AnalyzeResponse {
  repoInfo: { owner: string; repo: string; defaultBranch: string };
  files: { path: string; type: string }[];
  overview: {
    summary: string;
    techStack: string[];
    startHere: { path: string; reason: string }[];
  };
  stats?: { totalFiles: number; totalFolders: number };
  cached?: boolean;
}

interface AnalyzeError {
  message: string;
  status: number;
}

function errorHeadline(err: AnalyzeError): string {
  if (err.status === 404) return "Repo not found";
  if (err.status === 403 || err.status === 429) return "Rate limited";
  if (err.status === 400) return "Invalid repo";
  return "Something went wrong";
}

function LoadingIndicator({ repoUrl }: { repoUrl: string }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 120 80" className="w-24 h-16">
        <rect
          className="loading-box-rect"
          x="4"
          y="4"
          width="112"
          height="72"
          rx="2"
        />
      </svg>
      <p className="font-mono text-[var(--bp-steel)] text-sm">
        Reading {repoUrl}…
      </p>
    </div>
  );
}

function ShareButton({ repoLabel }: { repoLabel: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title: `${repoLabel} — Tracepaper`, url });
        return;
      } catch {
        // User cancelled the native share sheet — not an error, just do nothing.
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail without HTTPS or permissions — fail quietly, button just won't confirm.
    }
  }

  return (
    <button
      onClick={handleShare}
      className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--bp-steel)] hover:text-[var(--bp-cream)] border border-[var(--bp-steel)]/40 hover:border-[var(--bp-cream)]/60 rounded-sm px-3 py-1.5 transition-colors whitespace-nowrap"
    >
      {copied ? (
        <CheckIcon size={14} weight="bold" />
      ) : (
        <LinkSimpleIcon size={14} />
      )}
      {copied ? "COPIED" : "SHARE"}
    </button>
  );
}

function AnalyzeAttempt({
  repoUrl,
  onRetry,
}: {
  repoUrl: string;
  onRetry: () => void;
}) {
  const router = useRouter();
  const treeRef = useRef<BlueprintTreeHandle>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<AnalyzeError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoUrl }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok)
          throw {
            message: json.error ?? "Something went wrong.",
            status: res.status,
          };
        if (!cancelled) {
          setData(json);
          addRecentRepo(json.repoInfo.owner, json.repoInfo.repo);
        }
      })
      .catch((err: AnalyzeError | Error) => {
        if (cancelled) return;
        if (err instanceof Error) {
          setError({ message: err.message, status: 0 });
        } else {
          setError(err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [repoUrl]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <LoadingIndicator repoUrl={repoUrl} />
      </main>
    );
  }

  if (error || !data) {
    const isRetryable =
      !error ||
      error.status === 403 ||
      error.status === 429 ||
      error.status === 0 ||
      error.status >= 500;
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <p className="font-mono text-[var(--bp-red)] text-sm font-bold mb-2">
            {error ? errorHeadline(error) : "Something went wrong"}
          </p>
          <p className="font-mono text-[var(--bp-steel)] text-xs mb-6">
            {error?.message}
          </p>
          <div className="flex gap-3 justify-center">
            {isRetryable && (
              <button
                onClick={onRetry}
                className="font-mono text-xs border border-[var(--bp-steel)] rounded-sm px-4 py-2 hover:border-[var(--bp-red)] hover:text-[var(--bp-red)] transition-colors"
              >
                ↻ Retry
              </button>
            )}
            <button
              onClick={() => router.push("/")}
              className="font-mono text-xs border border-[var(--bp-steel)] rounded-sm px-4 py-2 hover:border-[var(--bp-cream)] hover:text-[var(--bp-cream)] transition-colors"
            >
              ← Try another repo
            </button>
          </div>
        </div>
      </main>
    );
  }

  const folders = buildFolderTree(data.files, data.overview.startHere);
  const allPaths = data.files.map((f) => f.path);
  const repoLabel = `${data.repoInfo.owner}/${data.repoInfo.repo}`;

  function handleExport() {
    if (!data) return;
    const markdown = buildMarkdown(data);
    downloadMarkdown(`${data.repoInfo.repo}-analysis.md`, markdown);
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm text-[var(--bp-line)]">
              {data.overview.summary}
            </p>
            {data.cached && (
              <span className="flex items-center gap-1 font-mono text-[10px] text-[var(--bp-red)] border border-[var(--bp-red)]/40 rounded-sm px-2 py-0.5 whitespace-nowrap">
                <LightningIcon size={12} weight="fill" />
                CACHED
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ShareButton repoLabel={repoLabel} />
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--bp-steel)] hover:text-[var(--bp-cream)] border border-[var(--bp-steel)]/40 hover:border-[var(--bp-cream)]/60 rounded-sm px-3 py-1.5 transition-colors whitespace-nowrap"
            >
              <DownloadSimpleIcon size={14} />
              EXPORT .MD
            </button>
          </div>
        </div>

        {data.stats && (
          <div className="flex items-center gap-2 mb-8">
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--bp-line)] border border-[var(--bp-steel)]/30 rounded-full px-3 py-1">
              <FolderIcon size={12} />
              {data.stats.totalFolders} folders
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-[var(--bp-line)] border border-[var(--bp-steel)]/30 rounded-full px-3 py-1">
              <FileIcon size={12} />
              {data.stats.totalFiles} files
            </span>
          </div>
        )}

        <BlueprintTree
          ref={treeRef}
          owner={data.repoInfo.owner}
          repo={data.repoInfo.repo}
          branch={data.repoInfo.defaultBranch}
          folders={folders}
          techStack={data.overview.techStack}
        />
        <QABox
          owner={data.repoInfo.owner}
          repo={data.repoInfo.repo}
          branch={data.repoInfo.defaultBranch}
          allPaths={allPaths}
          onAnswer={(relevantFiles) => {
            if (relevantFiles[0])
              treeRef.current?.spotlightPath(relevantFiles[0]);
          }}
        />
      </div>
    </main>
  );
}

function AnalyzeShell() {
  const params = useSearchParams();
  const repoUrl = params.get("repo") ?? "";
  const [attempt, setAttempt] = useState(0);

  if (!repoUrl) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <p className="font-mono text-[var(--bp-red)] text-sm">
          No repo specified.
        </p>
      </main>
    );
  }

  return (
    <AnalyzeAttempt
      key={`${repoUrl}::${attempt}`}
      repoUrl={repoUrl}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}

export default function AnalyzeClient() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center" />
      }
    >
      <AnalyzeShell />
    </Suspense>
  );
}
