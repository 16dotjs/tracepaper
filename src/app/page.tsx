"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";
import { ClockCounterClockwiseIcon, XIcon } from "@phosphor-icons/react";
import {
  getRecentRepos,
  removeRecentRepo,
  formatRelativeTime,
  RecentRepo,
} from "@/lib/recentRepos";
import HeroBlueprint, { HeroBlueprintHandle } from "@/components/HeroBlueprint";

gsap.registerPlugin(Flip);

const TRY_REPOS = [
  "facebook/react",
  "vercel/swr",
  "stripe/stripe-node",
  "openai/openai-node",
  "tanstack/query",
];

const CHIP_HIGHLIGHTS: Record<string, string[]> = {
  "facebook/react": ["root", "folderA", "fileA1"],
  "vercel/swr": ["root", "folderA", "fileA2"],
  "stripe/stripe-node": ["root", "folderB", "fileB1"],
  "openai/openai-node": ["root", "folderB", "folderC"],
  "tanstack/query": ["root", "folderB", "folderC", "fileC1"],
};

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
  const [expanding, setExpanding] = useState(false);
  const [recentRepos, setRecentRepos] = useState<RecentRepo[]>([]);
  const router = useRouter();

  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const heroWrapperRef = useRef<HTMLDivElement>(null);
  const heroDiagramRef = useRef<HeroBlueprintHandle>(null);
  const formColumnRef = useRef<HTMLDivElement>(null);
  const flipStateRef = useRef<Flip.FlipState | null>(null);
  const pendingRepoRef = useRef<string>("");

  useEffect(() => {
    // localStorage isn't available during SSR, so this must run post-mount to avoid
    // a hydration mismatch. That's the correct pattern here, not something to restructure around.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecentRepos(getRecentRepos());
  }, []);

  useEffect(() => {
    if (!chipsRef.current) return;
    const chips = chipsRef.current.querySelectorAll(".chip");
    gsap.from(chips, {
      opacity: 0,
      y: 8,
      duration: 0.4,
      stagger: 0.06,
      delay: 0.4,
      ease: "power2.out",
    });
  }, []);

  useLayoutEffect(() => {
    if (!expanding || !heroWrapperRef.current || !flipStateRef.current) return;
    Flip.from(flipStateRef.current, {
      duration: 0.9,
      ease: "power2.inOut",
      absolute: true,
      onComplete: () => {
        router.push(
          `/analyze?repo=${encodeURIComponent(pendingRepoRef.current)}`,
        );
      },
    });
  }, [expanding, router]);

  function handlePaste() {
    if (!inputRef.current) return;
    gsap.fromTo(
      inputRef.current,
      { boxShadow: "0 0 0 2px rgba(212,85,46,0.6)" },
      {
        boxShadow: "0 0 0 0 rgba(212,85,46,0)",
        duration: 0.8,
        ease: "power2.out",
      },
    );
  }

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
    pendingRepoRef.current = trimmed;

    fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoUrl: trimmed }),
    }).catch(() => {});

    if (formColumnRef.current) {
      gsap.to(formColumnRef.current, {
        opacity: 0,
        duration: 0.35,
        ease: "power2.out",
      });
    }
    if (heroWrapperRef.current) {
      flipStateRef.current = Flip.getState(heroWrapperRef.current);
    }
    setExpanding(true);
  }

  function handleRecentClick(r: RecentRepo) {
    setSubmitting(true);
    router.push(`/analyze?repo=${encodeURIComponent(`${r.owner}/${r.repo}`)}`);
  }

  function handleRemoveRecent(r: RecentRepo) {
    removeRecentRepo(r.owner, r.repo);
    setRecentRepos(getRecentRepos());
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-4xl md:grid md:grid-cols-[380px_1fr] md:gap-16 md:items-center">
        <div
          ref={heroWrapperRef}
          className={
            expanding
              ? "fixed inset-0 z-50 flex items-center justify-center bg-[var(--bp-navy-deep)] p-10"
              : "w-full max-w-sm mx-auto mb-10 md:mb-0 md:max-w-none"
          }
        >
          <div className={expanding ? "w-full max-w-2xl" : "w-full"}>
            <HeroBlueprint ref={heroDiagramRef} />
          </div>
        </div>

        <div ref={formColumnRef} className="w-full max-w-md mx-auto md:mx-0">
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

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
            <input
              ref={inputRef}
              type="text"
              value={repoUrl}
              onChange={(e) => {
                setRepoUrl(e.target.value);
                if (error) setError(null);
              }}
              onPaste={handlePaste}
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
font-bold py-3 rounded-sm transition-all duration-200
hover:opacity-90 hover:-translate-y-0.5 hover:shadow-[0_4px_20px_rgba(212,85,46,0.3)]
disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {submitting ? "OPENING…" : "ANALYZE →"}
            </button>
          </form>

          <div
            ref={chipsRef}
            className="mt-6 flex flex-wrap items-center gap-2"
          >
            <span className="font-mono text-xs text-[var(--bp-steel)] mr-1">
              TRY:
            </span>
            {TRY_REPOS.map((repo) => (
              <button
                key={repo}
                type="button"
                onClick={() => setRepoUrl(repo)}
                onMouseEnter={() =>
                  heroDiagramRef.current?.highlightPath(
                    CHIP_HIGHLIGHTS[repo] ?? [],
                  )
                }
                onMouseLeave={() => heroDiagramRef.current?.clearHighlight()}
                className="chip font-mono text-[11px] text-[var(--bp-steel)] border border-[var(--bp-steel)]/30
rounded-full px-3 py-1 transition-all duration-200
hover:text-[var(--bp-cream)] hover:border-[var(--bp-red)]/60
hover:shadow-[0_0_12px_rgba(212,85,46,0.25)]"
              >
                {repo}
              </button>
            ))}
          </div>

          {recentRepos.length > 0 && (
            <div className="mt-8 border-t border-[var(--bp-steel)]/30 pt-4">
              <p className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--bp-steel)] tracking-wider mb-3">
                <ClockCounterClockwiseIcon size={12} />
                RECENTLY ANALYZED
              </p>
              <div className="space-y-1.5">
                {recentRepos.map((r) => (
                  <div
                    key={`${r.owner}/${r.repo}`}
                    className="flex items-center rounded-sm border border-[var(--bp-steel)]/20
hover:border-[var(--bp-red)]/50 transition-colors group"
                  >
                    <button
                      type="button"
                      onClick={() => handleRecentClick(r)}
                      disabled={submitting}
                      className="flex-1 flex items-center justify-between text-left px-3 py-2
disabled:opacity-50"
                    >
                      <span className="font-mono text-xs text-[var(--bp-line)]">
                        {r.owner}/{r.repo}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--bp-steel)] ml-2">
                        {formatRelativeTime(r.analyzedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveRecent(r)}
                      aria-label={`Remove ${r.owner}/${r.repo} from recently analyzed`}
                      className="px-3 py-2 text-[var(--bp-steel)] hover:text-[var(--bp-red)]
transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100
focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--bp-red)] rounded-sm"
                    >
                      <XIcon size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
