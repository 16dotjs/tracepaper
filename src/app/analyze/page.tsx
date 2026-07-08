import type { Metadata } from "next";
import AnalyzeClient from "@/components/AnalyzeClient";
import { parseRepoUrl } from "@/lib/github";

interface Props {
  searchParams: Promise<{ repo?: string }>;
}

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const { repo: repoUrl } = await searchParams;
  const parsed = repoUrl ? parseRepoUrl(repoUrl) : null;

  if (!parsed) {
    return {
      title: "Tracepaper — understand any repo in minutes",
      description: "AI-powered GitHub repo onboarding.",
    };
  }

  const repoLabel = `${parsed.owner}/${parsed.repo}`;
  const title = `${repoLabel} — Tracepaper`;
  const description = `AI-powered analysis of ${repoLabel}. Understand its structure, architecture, and where to start reading — in minutes.`;
  const ogImageUrl = `/api/og?repo=${encodeURIComponent(repoLabel)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default function AnalyzePage() {
  return <AnalyzeClient />;
}
