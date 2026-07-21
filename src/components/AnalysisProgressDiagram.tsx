"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ANALYZE_STAGES, AnalyzeStage } from "@/lib/analyzeProtocol";

const STAGE_LABELS: Record<AnalyzeStage, string> = {
  "repo-info": "Reading repo info",
  tree: "Mapping file tree",
  branches: "Fetching branches",
  "key-files": "Selecting key files",
  "core-files": "Reading core files",
  "claude-overview": "Claude analyzing",
};

interface AnalysisProgressDiagramProps {
  repoUrl: string;
  stagesDone: Set<AnalyzeStage>;
  joining: boolean;
}

export default function AnalysisProgressDiagram({
  repoUrl,
  stagesDone,
  joining,
}: AnalysisProgressDiagramProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || joining) return;

    function prepDraw(el: SVGGeometryElement) {
      const len = el.getTotalLength();
      el.style.strokeDasharray = String(len);
      el.style.strokeDashoffset = String(len);
      return len;
    }

    const nodeSpacing = 90;
    const startX = 30;
    const y = 40;
    const width = startX * 2 + nodeSpacing * (ANALYZE_STAGES.length - 1);

    // The first not-yet-done stage, in defined order, gets a pulsing "likely active" hint.
    // This is an inference from execution order, not a literal claim — branches/tree run in
    // parallel and can genuinely complete out of order, so this occasionally guesses which
    // one is "next" slightly wrong. Still an honest best-effort signal, not a false one.
    const firstPendingIndex = ANALYZE_STAGES.findIndex(
      (s) => !stagesDone.has(s),
    );

    let markup = "";
    ANALYZE_STAGES.forEach((stage, i) => {
      const x = startX + i * nodeSpacing;
      const done = stagesDone.has(stage);
      const isActive = i === firstPendingIndex;

      if (i > 0) {
        const prevX = startX + (i - 1) * nodeSpacing;
        markup += `<line class="progress-connector${done ? " done" : ""}" id="connector-${i}" x1="${prevX + 10}" y1="${y}" x2="${x - 10}" y2="${y}"/>`;
      }

      markup += `<circle class="progress-node${done ? " done" : ""}${isActive ? " active" : ""}" id="node-${stage}" cx="${x}" cy="${y}" r="7"/>`;
      markup += `<text class="progress-label" x="${x}" y="${y + 24}" text-anchor="middle">${STAGE_LABELS[stage]}</text>`;
    });

    svg.setAttribute("viewBox", `0 0 ${width} 70`);
    svg.innerHTML = markup;

    svg
      .querySelectorAll<SVGGeometryElement>(".progress-connector.done")
      .forEach((el) => {
        prepDraw(el);
        gsap.to(el, {
          strokeDashoffset: 0,
          duration: 0.4,
          ease: "power2.inOut",
        });
      });

    const activeNode = svg.querySelector(".progress-node.active");
    if (activeNode) {
      gsap.to(activeNode, {
        opacity: 0.35,
        duration: 0.6,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    }
  }, [stagesDone, joining]);

  if (joining) {
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
        <p className="font-mono text-[var(--bp-steel)] text-sm text-center max-w-xs">
          Another analysis for this repo is already in progress — waiting for it
          to finish…
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <svg
        ref={svgRef}
        className="bp-svg"
        style={{ maxWidth: 560, width: "100%", height: "auto" }}
      />
      <p className="font-mono text-[var(--bp-steel)] text-sm">
        Reading {repoUrl}…
      </p>
    </div>
  );
}
