"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

interface GraphNode {
  path: string;
  layer: number;
}

interface GraphEdge {
  from: string;
  to: string;
}

interface DependencyGraphProps {
  owner: string;
  repo: string;
  branch: string;
  paths: string[];
}

interface SelectedFile {
  path: string;
  explanation: string;
  loading: boolean;
}

const NS = "http://www.w3.org/2000/svg";
const COL_WIDTH = 170;
const ROW_HEIGHT = 46;
const MARGIN = 50;
const LABEL_MAX_WIDTH = 120;

function fitLabel(
  el: SVGTextElement,
  fullText: string,
  maxWidth: number,
): void {
  el.textContent = fullText;
  if (el.getComputedTextLength() <= maxWidth) return;
  const ellipsis = "…";
  let lo = 0,
    hi = fullText.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    el.textContent = ellipsis + fullText.slice(fullText.length - mid);
    if (el.getComputedTextLength() <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  el.textContent =
    lo > 0 ? ellipsis + fullText.slice(fullText.length - lo) : ellipsis;
}

function fileLabel(path: string): string {
  const segments = path.split("/");
  return segments[segments.length - 1];
}

export default function DependencyGraph({
  owner,
  repo,
  branch,
  paths,
}: DependencyGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<GraphNode[] | null>(null);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [unresolvedCount, setUnresolvedCount] = useState(0);
  const [eligibleFileCount, setEligibleFileCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedFile | null>(null);
  const [focusedPath, setFocusedPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/dependency-graph", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner, repo, branch, paths }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok)
          throw new Error(json.error ?? "Failed to build dependency graph.");
        if (!cancelled) {
          setNodes(json.nodes);
          setEdges(json.edges);
          setUnresolvedCount(json.unresolvedCount ?? 0);
          setEligibleFileCount(json.eligibleFileCount ?? 0);
        }
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Unknown error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo, branch]);

  async function handleNodeClick(path: string) {
    setFocusedPath(path);
    setSelected({ path, explanation: "", loading: true });
    try {
      const res = await fetch("/api/explain-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, branch, path }),
      });
      const data = await res.json();
      setSelected({
        path,
        explanation: res.ok ? data.explanation : `Error: ${data.error}`,
        loading: false,
      });
    } catch {
      setSelected({
        path,
        explanation:
          "⚠ Failed to fetch explanation — click the node again to retry.",
        loading: false,
      });
    }
  }

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !nodes) return;

    function prepDraw(el: SVGGeometryElement) {
      const len = el.getTotalLength();
      el.style.strokeDasharray = String(len);
      el.style.strokeDashoffset = String(len);
      return len;
    }

    const byLayer = new Map<number, GraphNode[]>();
    nodes.forEach((n) => {
      if (!byLayer.has(n.layer)) byLayer.set(n.layer, []);
      byLayer.get(n.layer)!.push(n);
    });
    byLayer.forEach((list) =>
      list.sort((a, b) => a.path.localeCompare(b.path)),
    );

    const positions = new Map<string, { x: number; y: number }>();
    let maxRows = 1;
    byLayer.forEach((list, layer) => {
      maxRows = Math.max(maxRows, list.length);
      list.forEach((node, i) => {
        positions.set(node.path, {
          x: MARGIN + layer * COL_WIDTH,
          y: MARGIN + i * ROW_HEIGHT,
        });
      });
    });

    const maxLayer = Math.max(0, ...nodes.map((n) => n.layer));
    const width = MARGIN * 2 + (maxLayer + 1) * COL_WIDTH;
    const height = MARGIN * 2 + maxRows * ROW_HEIGHT;

    const connected = focusedPath
      ? new Set([
          focusedPath,
          ...edges.filter((e) => e.from === focusedPath).map((e) => e.to),
          ...edges.filter((e) => e.to === focusedPath).map((e) => e.from),
        ])
      : null;

    let markup = "";
    edges.forEach((edge, i) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) return;
      const touchesFocus =
        focusedPath !== null &&
        (edge.from === focusedPath || edge.to === focusedPath);
      const midX = (from.x + to.x) / 2;
      const d = `M ${from.x + 8},${from.y} C ${midX},${from.y} ${midX},${to.y} ${to.x - 14},${to.y}`;
      const cls = `graph-edge${touchesFocus ? " focused" : ""}${focusedPath && !touchesFocus ? " graph-dim" : ""}`;
      markup += `<path class="${cls}" id="edge-${i}" d="${d}"/>`;
    });

    nodes.forEach((node) => {
      const pos = positions.get(node.path);
      if (!pos) return;
      const isFocused = focusedPath === node.path;
      const isDim = connected ? !connected.has(node.path) : false;
      markup += `<g id="node-${node.path}" transform="translate(${pos.x},${pos.y})" opacity="0"${isDim ? ' class="graph-dim"' : ""}>
        <path d="M -6,-9 L 3,-9 L 7,-5 L 7,9 L -6,9 Z" fill="none" stroke="${isFocused ? "var(--bp-red)" : "var(--bp-line)"}" stroke-width="${isFocused ? 2 : 1.4}"/>
        <path d="M 3,-9 L 3,-5 L 7,-5 Z" fill="var(--bp-steel)" opacity="0.3"/>
        <text class="graph-node-label${isFocused ? " focused" : ""}" id="label-${node.path}" x="14" y="4"></text>
      </g>`;
    });

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.innerHTML = markup;

    nodes.forEach((node) => {
      const escaped = CSS.escape(node.path);
      const labelEl = svg.querySelector<SVGTextElement>(`#label-${escaped}`);
      if (labelEl) fitLabel(labelEl, fileLabel(node.path), LABEL_MAX_WIDTH);
      const nodeEl = svg.querySelector<SVGGElement>(`#node-${escaped}`);
      if (nodeEl)
        nodeEl.addEventListener("click", () => handleNodeClick(node.path));
    });

    const edgeEls = svg.querySelectorAll<SVGGeometryElement>(".graph-edge");
    const nodeEls = svg.querySelectorAll<SVGGElement>('[id^="node-"]');

    edgeEls.forEach(prepDraw);
    const tl = gsap.timeline({ defaults: { ease: "power2.inOut" } });
    tl.to(Array.from(edgeEls), {
      strokeDashoffset: 0,
      duration: 0.5,
      stagger: 0.02,
    }).to(
      Array.from(nodeEls),
      { opacity: 1, duration: 0.3, stagger: 0.015, ease: "back.out(2)" },
      "-=0.3",
    );

    return () => {
      tl.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, focusedPath]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
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
          Tracing imports…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <p className="font-mono text-[var(--bp-red)] text-xs py-8 text-center">
        {error}
      </p>
    );
  }

  if (!nodes || nodes.length === 0) {
    const message =
      eligibleFileCount === 0
        ? "None of the analyzed files are in a language this feature currently supports (JavaScript/TypeScript Python, or Go)."
        : unresolvedCount > 0
          ? `Found ${eligibleFileCount} JS/TS file${eligibleFileCount > 1 ? "s" : ""} in the sample, but the files they import weren't part of this analysis's 40-file subset — so no connections could be drawn between files that are actually here.`
          : `Found ${eligibleFileCount} JS/TS file${eligibleFileCount > 1 ? "s" : ""} in the sample, but none of them import each other directly (they may only import external packages).`;
    return (
      <p className="font-mono text-[var(--bp-steel)] text-xs py-8 text-center max-w-md mx-auto">
        {message}
      </p>
    );
  }

  return (
    <div>
      <p className="font-mono text-[10px] text-[var(--bp-steel)] mb-2">
        Showing relationships among the {nodes.length} analyzed files only — not
        the full repository.
        {unresolvedCount > 0 &&
          ` ${unresolvedCount} import${unresolvedCount > 1 ? "s" : ""} pointed outside this set and aren't shown.`}
      </p>
      <svg ref={svgRef} className="bp-svg w-full h-auto" />
      <div className="mt-4 border border-[var(--bp-steel)]/40 rounded-sm p-4 font-mono text-sm">
        <p className="text-[var(--bp-steel)] text-xs tracking-wide mb-1">
          SELECTED FILE
        </p>
        <p className="text-[var(--bp-cream)] font-bold mb-1">
          {selected?.path ?? "—"}
        </p>
        <p className="text-[var(--bp-line)] text-xs">
          {selected?.loading
            ? "Claude is reading this file…"
            : (selected?.explanation ??
              "Click any node above to see its explanation and highlight its connections.")}
        </p>
      </div>
    </div>
  );
}
