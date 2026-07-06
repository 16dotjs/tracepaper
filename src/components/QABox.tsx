"use client";

import { useState } from "react";

interface QABoxProps {
  owner: string;
  repo: string;
  branch: string;
  allPaths: string[];
  onAnswer: (relevantFiles: string[]) => void;
}

export default function QABox({
  owner,
  repo,
  branch,
  allPaths,
  onAnswer,
}: QABoxProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (trimmed.length < 3) {
      setError("Ask a real question — a few words at least.");
      return;
    }
    setError(null);
    setLoading(true);
    setAnswer(null);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          branch,
          question: trimmed,
          allPaths,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setAnswer(data.answer);
      if (Array.isArray(data.relevantFiles) && data.relevantFiles.length > 0) {
        onAnswer(data.relevantFiles);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get an answer.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 border border-[var(--bp-steel)]/40 rounded-sm p-4">
      <p className="font-mono text-xs text-[var(--bp-steel)] tracking-wide mb-3">
        ASK ABOUT THIS REPO
      </p>
      <form onSubmit={handleAsk} className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
            if (error) setError(null);
          }}
          placeholder='e.g. "where is authentication handled?"'
          disabled={loading}
          className="flex-1 bg-transparent border border-[var(--bp-steel)] rounded-sm px-3 py-2
                     font-mono text-sm placeholder:text-[var(--bp-steel)]/60
                     focus:outline-none focus:border-[var(--bp-red)] transition-colors disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-[var(--bp-red)] text-[var(--bp-navy-deep)] font-mono text-sm font-bold
                     px-4 py-2 rounded-sm hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {loading ? "…" : "ASK"}
        </button>
      </form>
      {error && (
        <p className="text-[var(--bp-red)] text-xs font-mono mt-2">{error}</p>
      )}
      {answer && (
        <p className="font-mono text-xs text-[var(--bp-cream)] mt-3 leading-relaxed">
          {answer}
        </p>
      )}
    </div>
  );
}
