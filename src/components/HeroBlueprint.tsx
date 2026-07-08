"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { gsap } from "gsap";

interface Node {
  id: string;
  x: number;
  y: number;
  type: "folder" | "file";
}

interface Edge {
  from: string;
  to: string;
}

const NODES: Node[] = [
  { id: "root", x: 200, y: 50, type: "folder" },
  { id: "folderA", x: 120, y: 140, type: "folder" },
  { id: "folderB", x: 280, y: 140, type: "folder" },
  { id: "fileA1", x: 80, y: 230, type: "file" },
  { id: "fileA2", x: 160, y: 230, type: "file" },
  { id: "fileB1", x: 240, y: 230, type: "file" },
  { id: "folderC", x: 320, y: 230, type: "folder" },
  { id: "fileC1", x: 320, y: 320, type: "file" },
];

const EDGES: Edge[] = [
  { from: "root", to: "folderA" },
  { from: "root", to: "folderB" },
  { from: "folderA", to: "fileA1" },
  { from: "folderA", to: "fileA2" },
  { from: "folderB", to: "fileB1" },
  { from: "folderB", to: "folderC" },
  { from: "folderC", to: "fileC1" },
];

const PULSE_ROUTE = ["root", "folderB", "folderC", "fileC1"];

export interface HeroBlueprintHandle {
  highlightPath: (nodeIds: string[]) => void;
  clearHighlight: () => void;
}

function nodeById(id: string): Node {
  return NODES.find((n) => n.id === id)!;
}

function elbowPath(from: Node, to: Node): string {
  const midY = (from.y + to.y) / 2;
  return `M ${from.x},${from.y} L ${from.x},${midY} L ${to.x},${midY} L ${to.x},${to.y}`;
}

function cornerBracket(x: number, y: number, dx: number, dy: number): string {
  return `M ${x},${y + dy} L ${x},${y} L ${x + dx},${y}`;
}

const HeroBlueprint = forwardRef<HeroBlueprintHandle>(
  function HeroBlueprint(_props, ref) {
    const svgRef = useRef<SVGSVGElement>(null);
    const edgeElsRef = useRef<
      { from: string; to: string; el: SVGGeometryElement }[]
    >([]);
    const nodeElsRef = useRef<Record<string, SVGGElement>>({});

    useImperativeHandle(
      ref,
      () => ({
        highlightPath: (nodeIds: string[]) => {
          edgeElsRef.current.forEach(({ from, to, el }) => {
            const active = nodeIds.includes(from) && nodeIds.includes(to);
            el.style.stroke = active ? "var(--bp-red)" : "var(--bp-steel)";
            el.style.strokeWidth = active ? "2" : "1.2";
          });
          nodeIds.forEach((id) => {
            const g = nodeElsRef.current[id];
            if (g)
              gsap.to(g, { scale: 1.15, duration: 0.25, ease: "power2.out" });
          });
        },
        clearHighlight: () => {
          edgeElsRef.current.forEach(({ el }) => {
            el.style.stroke = "var(--bp-steel)";
            el.style.strokeWidth = "1.2";
          });
          Object.values(nodeElsRef.current).forEach((g) => {
            gsap.to(g, { scale: 1, duration: 0.25, ease: "power2.out" });
          });
        },
      }),
      [],
    );

    useEffect(() => {
      const svg = svgRef.current;
      if (!svg) return;

      function prepDraw(el: SVGGeometryElement) {
        const len = el.getTotalLength();
        el.style.strokeDasharray = String(len);
        el.style.strokeDashoffset = String(len);
        return len;
      }

      let markup = `
      <defs>
        <pattern id="hero-dotgrid" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="var(--bp-line)" opacity="0.15" />
        </pattern>
      </defs>
      <rect x="10" y="10" width="380" height="380" fill="url(#hero-dotgrid)" />
      <rect id="hero-frame" x="10" y="10" width="380" height="380" rx="3" fill="none" stroke="var(--bp-line)" stroke-width="1.2" />
    `;

      const bracketLen = 16;
      const corners: [number, number, number, number][] = [
        [10, 10, bracketLen, bracketLen],
        [390, 10, -bracketLen, bracketLen],
        [10, 390, bracketLen, -bracketLen],
        [390, 390, -bracketLen, -bracketLen],
      ];
      corners.forEach(([x, y, dx, dy], i) => {
        markup += `<path id="hero-corner-${i}" d="${cornerBracket(x, y, dx, dy)}" fill="none" stroke="var(--bp-red)" stroke-width="1.6" stroke-linecap="square" />`;
      });

      EDGES.forEach((edge, i) => {
        const d = elbowPath(nodeById(edge.from), nodeById(edge.to));
        markup += `<path id="hero-edge-${i}" d="${d}" fill="none" style="stroke:var(--bp-steel);stroke-width:1.2;transition:stroke 0.25s ease, stroke-width 0.25s ease;" />`;
      });

      const pulseNodes = PULSE_ROUTE.map(nodeById);
      let pulseD = `M ${pulseNodes[0].x},${pulseNodes[0].y}`;
      for (let i = 1; i < pulseNodes.length; i++) {
        const from = pulseNodes[i - 1],
          to = pulseNodes[i];
        const midY = (from.y + to.y) / 2;
        pulseD += ` L ${from.x},${midY} L ${to.x},${midY} L ${to.x},${to.y}`;
      }
      markup += `<path id="hero-pulse-guide" d="${pulseD}" fill="none" stroke="none" />`;
      markup += `<circle id="hero-pulse-dot" r="3" fill="var(--bp-red)" opacity="0" />`;

      NODES.forEach((node) => {
        if (node.type === "folder") {
          markup += `<g id="hero-node-${node.id}" transform="translate(${node.x},${node.y})" opacity="0">
          <path d="M -10,-7 L -3,-7 L -1,-4 L 10,-4 L 10,7 L -10,7 Z" fill="none" stroke="var(--bp-line)" stroke-width="1.4" />
        </g>`;
        } else {
          markup += `<g id="hero-node-${node.id}" transform="translate(${node.x},${node.y})" opacity="0">
          <path d="M -6,-9 L 3,-9 L 7,-5 L 7,9 L -6,9 Z" fill="none" stroke="var(--bp-line)" stroke-width="1.4" />
          <path d="M 3,-9 L 3,-5 L 7,-5 Z" fill="var(--bp-steel)" opacity="0.3" />
        </g>`;
        }
      });

      svg.innerHTML = markup;

      const frame = svg.querySelector<SVGGeometryElement>("#hero-frame")!;
      const cornerEls = Array.from(
        svg.querySelectorAll<SVGGeometryElement>('[id^="hero-corner-"]'),
      );
      const rootNode = svg.querySelector<SVGGElement>("#hero-node-root")!;
      const pulseGuide =
        svg.querySelector<SVGGeometryElement>("#hero-pulse-guide")!;
      const pulseDot = svg.querySelector<SVGCircleElement>("#hero-pulse-dot")!;

      edgeElsRef.current = EDGES.map((edge, i) => ({
        from: edge.from,
        to: edge.to,
        el: svg.querySelector<SVGGeometryElement>(`#hero-edge-${i}`)!,
      }));
      NODES.forEach((node) => {
        nodeElsRef.current[node.id] = svg.querySelector<SVGGElement>(
          `#hero-node-${node.id}`,
        )!;
      });

      prepDraw(frame);
      cornerEls.forEach(prepDraw);
      gsap.set(rootNode, { transformOrigin: "center" });

      const tl = gsap.timeline({ defaults: { ease: "power2.inOut" } });

      tl.to(frame, { strokeDashoffset: 0, duration: 0.6 })
        .to(
          cornerEls,
          { strokeDashoffset: 0, duration: 0.3, stagger: 0.08 },
          "-=0.2",
        )
        .to(
          rootNode,
          { opacity: 1, duration: 0.3, ease: "back.out(2)" },
          "-=0.1",
        );

      EDGES.forEach((edge, i) => {
        const edgeEl = edgeElsRef.current[i].el;
        const nodeEl = nodeElsRef.current[edge.to];
        prepDraw(edgeEl);
        gsap.set(nodeEl, { transformOrigin: "center" });
        tl.to(edgeEl, { strokeDashoffset: 0, duration: 0.4 }, "-=0.05").to(
          nodeEl,
          { opacity: 1, duration: 0.3, ease: "back.out(2)" },
          "-=0.15",
        );
      });

      const guideLength = pulseGuide.getTotalLength();
      const pulseState = { progress: 0 };
      const pulseTl = gsap.timeline({ repeat: -1, repeatDelay: 6, delay: 2.5 });
      pulseTl
        .to(pulseDot, { opacity: 1, duration: 0.3 })
        .to(
          pulseState,
          {
            progress: 1,
            duration: 2.2,
            ease: "power1.inOut",
            onUpdate: () => {
              const pt = pulseGuide.getPointAtLength(
                pulseState.progress * guideLength,
              );
              pulseDot.setAttribute("cx", String(pt.x));
              pulseDot.setAttribute("cy", String(pt.y));
            },
          },
          "<",
        )
        .to(pulseDot, { opacity: 0, duration: 0.3 })
        .set(pulseState, { progress: 0 });

      return () => {
        tl.kill();
        pulseTl.kill();
      };
    }, []);

    return <svg ref={svgRef} viewBox="0 0 400 400" className="w-full h-auto" />;
  },
);

export default HeroBlueprint;
