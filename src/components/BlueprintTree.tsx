"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { gsap } from "gsap";
import { CodeIcon } from "@phosphor-icons/react";
import CodePreview from "./CodePreview";
import type { TreeFolder } from "@/lib/repoTree";

interface BlueprintTreeProps {
  owner: string;
  repo: string;
  branch: string;
  folders: TreeFolder[];
  techStack: string[];
}

export interface BlueprintTreeHandle {
  spotlightPath: (path: string) => void;
}

interface SelectedFile {
  path: string;
  explanation: string;
  content?: string;
  truncated?: boolean;
  loading: boolean;
}

const NS = "http://www.w3.org/2000/svg";
const MAX_VISIBLE_FILES = 4;

const BlueprintTree = forwardRef<BlueprintTreeHandle, BlueprintTreeProps>(
  function BlueprintTree({ owner, repo, branch, folders, techStack }, ref) {
    const svgRef = useRef<SVGSVGElement>(null);
    const fileElementsRef = useRef<
      Record<
        string,
        { el: SVGGraphicsElement; file: TreeFolder["files"][number] }
      >
    >({});
    const [selected, setSelected] = useState<SelectedFile | null>(null);
    const [showCode, setShowCode] = useState(false);

    const handleFileClick = useCallback(
      async (id: string) => {
        const entry = fileElementsRef.current[id];
        const svg = svgRef.current;
        if (!entry || !svg) return;
        const { el, file } = entry;
        const bbox = el.getBBox();
        const pad = 6,
          y = bbox.y + bbox.height + 4;
        const line = svg.querySelector<SVGGeometryElement>("#spotlightLine")!;

        svg
          .querySelectorAll(".file-label")
          .forEach((f) => f.classList.remove("active-file"));
        el.classList.add("active-file");

        gsap.killTweensOf(line);
        line.setAttribute("x1", String(bbox.x - pad));
        line.setAttribute("x2", String(bbox.x + bbox.width + pad));
        line.setAttribute("y1", String(y));
        line.setAttribute("y2", String(y));
        const len = line.getTotalLength();
        gsap.set(line, {
          strokeDasharray: len,
          strokeDashoffset: len,
          opacity: 1,
        });
        gsap.to(line, {
          strokeDashoffset: 0,
          duration: 0.45,
          ease: "power2.inOut",
        });

        el.scrollIntoView({ behavior: "smooth", block: "center" });

        setShowCode(false);
        setSelected({ path: file.fullPath, explanation: "", loading: true });

        try {
          const res = await fetch("/api/explain-file", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ owner, repo, branch, path: file.fullPath }),
          });
          const data = await res.json();
          setSelected({
            path: file.fullPath,
            explanation: res.ok ? data.explanation : `Error: ${data.error}`,
            content: res.ok ? data.content : undefined,
            truncated: res.ok ? data.truncated : undefined,
            loading: false,
          });
        } catch {
          setSelected({
            path: file.fullPath,
            explanation:
              "⚠ Failed to fetch explanation — click the file again to retry.",
            loading: false,
          });
        }
      },
      [owner, repo, branch],
    );

    useImperativeHandle(
      ref,
      () => ({
        spotlightPath: (path: string) => {
          const match = Object.entries(fileElementsRef.current).find(
            ([, v]) => v.file.fullPath === path,
          );
          if (match) handleFileClick(match[0]);
        },
      }),
      [handleFileClick],
    );

    useEffect(() => {
      const svg = svgRef.current;
      if (!svg) return;
      fileElementsRef.current = {};

      function prepDraw(el: SVGGeometryElement) {
        const len = el.getTotalLength();
        el.style.strokeDasharray = String(len);
        el.style.strokeDashoffset = String(len);
        return len;
      }

      const colX = [60, 460];
      const colWidth = 380;
      const startY = 160;
      const colY = [startY, startY];
      const gap = 22;

      const rooms = folders.map((folder) => {
        const visibleFiles = folder.files.slice(0, MAX_VISIBLE_FILES);
        const overflow = folder.files.length - visibleFiles.length;
        const height =
          30 + 12 + visibleFiles.length * 20 + (overflow > 0 ? 20 : 0) + 16;
        const col = colY[0] <= colY[1] ? 0 : 1;
        const room = {
          folder,
          x: colX[col],
          y: colY[col],
          width: colWidth,
          height,
          visibleFiles,
          overflow,
        };
        colY[col] += height + gap;
        return room;
      });

      const contentBottom = Math.max(colY[0], colY[1]) - gap;
      const startHereFiles = folders
        .flatMap((f) => f.files)
        .filter((f) => f.startHereOrder)
        .sort((a, b) => a.startHereOrder! - b.startHereOrder!);

      let markup = `
      <rect id="titleBlock" x="40" y="24" width="260" height="86" rx="2" fill="none" stroke="var(--bp-line)" stroke-width="1.4"/>
      <text class="meta-label" x="52" y="44">PROJECT</text>
      <text class="meta-value" x="52" y="58">${owner}/${repo}</text>
      <text class="meta-label" x="52" y="74">STACK</text>
      <text class="meta-value" x="52" y="88">${techStack.slice(0, 3).join(" · ") || "—"}</text>
      <circle class="pulse-dot" id="pulseDot" cx="270" cy="40" r="3.5" opacity="0"/>
      <text class="meta-label" x="278" y="43">ANALYZED</text>
      <text class="heading" id="mainHeading" x="40" y="132">${repo.toUpperCase()} — REPOSITORY ANALYSIS</text>
    `;

      rooms.forEach((room, ri) => {
        markup += `<g>
        <rect class="room-rect" x="${room.x}" y="${room.y}" width="${room.width}" height="${room.height}"/>
        <text class="room-label" x="${room.x + 16}" y="${room.y + 20}">${room.folder.name}</text>
        <line class="divider" x1="${room.x}" y1="${room.y + 32}" x2="${room.x + room.width}" y2="${room.y + 32}"/>`;
        room.visibleFiles.forEach((file, fi) => {
          const id = `f-${ri}-${fi}`;
          markup += `<text class="file-label" id="${id}" x="${room.x + 30}" y="${room.y + 54 + fi * 20}">${file.name}</text>`;
        });
        if (room.overflow > 0) {
          markup += `<text class="overflow-label" x="${room.x + 30}" y="${room.y + 54 + room.visibleFiles.length * 20}">+ ${room.overflow} more file${room.overflow > 1 ? "s" : ""}</text>`;
        }
        markup += `</g>`;
      });

      markup += `<g id="annotationLayer"></g><line class="spotlight-line" id="spotlightLine"/>`;

      const notesY = contentBottom + 30;
      const noteCount = Math.max(startHereFiles.length, 1);
      markup += `<line class="divider" x1="60" y1="${notesY}" x2="840" y2="${notesY}"/>`;
      markup += `<text class="section-label" x="60" y="${notesY + 22}">AI-RECOMMENDED READING ORDER</text>`;
      markup += `<g id="notesLayer"></g>`;

      svg.setAttribute(
        "viewBox",
        `0 0 900 ${notesY + 34 + noteCount * 24 + 30}`,
      );
      svg.innerHTML =
        `<defs>
        <filter id="pencil" x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" result="noise" seed="7"/>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.5"/>
        </filter>
      </defs>` + markup;

      rooms.forEach((room, ri) => {
        room.visibleFiles.forEach((file, fi) => {
          const id = `f-${ri}-${fi}`;
          const el = svg.querySelector<SVGGraphicsElement>(`#${id}`);
          if (!el) return;
          fileElementsRef.current[id] = { el, file };
          el.addEventListener("click", () => handleFileClick(id));
        });
      });

      const roomRects = svg.querySelectorAll<SVGGeometryElement>(".room-rect");
      const dividers = svg.querySelectorAll<SVGGeometryElement>(".divider");
      const fileLabels = svg.querySelectorAll(".file-label, .overflow-label");
      const titleBlock = svg.querySelector<SVGGeometryElement>("#titleBlock")!;
      const annotationLayer = svg.querySelector("#annotationLayer")!;
      const notesLayer = svg.querySelector("#notesLayer")!;

      prepDraw(titleBlock);
      roomRects.forEach(prepDraw);
      dividers.forEach(prepDraw);
      gsap.set([...Array.from(fileLabels), svg.querySelector("#mainHeading")], {
        opacity: 0,
        y: 6,
      });
      gsap.set(svg.querySelector(".section-label"), { opacity: 0 });

      const tl = gsap.timeline({ defaults: { ease: "power2.inOut" } });
      tl.to(titleBlock, { strokeDashoffset: 0, duration: 0.6 })
        .to(
          svg.querySelector("#mainHeading"),
          { opacity: 1, y: 0, duration: 0.5 },
          "-=0.2",
        )
        .to(
          Array.from(roomRects),
          { strokeDashoffset: 0, duration: 0.5, stagger: 0.12 },
          "+=0.1",
        )
        .to(
          Array.from(dividers),
          { strokeDashoffset: 0, duration: 0.3, stagger: 0.12 },
          "<",
        )
        .to(
          Array.from(fileLabels),
          { opacity: 1, y: 0, duration: 0.3, stagger: 0.025 },
          "-=0.4",
        )
        .to(svg.querySelector("#pulseDot"), { opacity: 1, duration: 0.2 })
        .to(
          svg.querySelector("#pulseDot"),
          { opacity: 0.25, duration: 0.6, repeat: -1, yoyo: true },
          "<",
        )
        .to(
          svg.querySelector(".section-label"),
          { opacity: 1, duration: 0.3 },
          "-=0.1",
        );

      startHereFiles.forEach((file, i) => {
        const entry = Object.values(fileElementsRef.current).find(
          (e) => e.file.fullPath === file.fullPath,
        );
        if (!entry) return;
        const bbox = entry.el.getBBox();
        const cx = bbox.x + bbox.width / 2,
          cy = bbox.y + bbox.height / 2;
        const rx = bbox.width / 2 + 12,
          ry = bbox.height / 2 + 7;

        const ann = document.createElementNS(NS, "ellipse");
        ann.setAttribute("class", "annotation");
        ann.setAttribute("filter", "url(#pencil)");
        ann.setAttribute("cx", String(cx));
        ann.setAttribute("cy", String(cy));
        ann.setAttribute("rx", String(rx));
        ann.setAttribute("ry", String(ry));
        annotationLayer.appendChild(ann);
        prepDraw(ann as unknown as SVGGeometryElement);

        const badgeX = cx + rx + 14;
        const badge = document.createElementNS(NS, "g");
        badge.innerHTML = `<circle class="badge-circle" cx="${badgeX}" cy="${cy}" r="11"/><text class="badge-text" x="${badgeX}" y="${cy + 4}">${file.startHereOrder}</text>`;
        annotationLayer.appendChild(badge);
        gsap.set(badge, {
          opacity: 0,
          scale: 0,
          transformOrigin: `${badgeX}px ${cy}px`,
        });

        const noteY = notesY + 34 + i * 24;
        const note = document.createElementNS(NS, "g");
        note.innerHTML = `<text class="note-num" x="60" y="${noteY}">${String(file.startHereOrder).padStart(2, "0")}</text><text class="note-text" x="82" y="${noteY}">${file.fullPath} — ${file.startHereReason}</text>`;
        notesLayer.appendChild(note);
        gsap.set(note, { opacity: 0, y: 6 });

        tl.to(ann, { strokeDashoffset: 0, duration: 0.6 }, "+=0.3")
          .to(
            badge,
            { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2.2)" },
            "-=0.15",
          )
          .to(note, { opacity: 1, y: 0, duration: 0.35 }, "-=0.1");
      });

      return () => {
        tl.kill();
      };
    }, [folders, owner, repo, techStack, handleFileClick]);

    return (
      <div>
        <svg
          ref={svgRef}
          viewBox="0 0 900 700"
          className="bp-svg w-full h-auto"
        />
        <div className="mt-4 border border-[var(--bp-steel)]/40 rounded-sm p-4 font-mono text-sm">
          <p className="text-[var(--bp-steel)] text-xs tracking-wide mb-1">
            SELECTED FILE
          </p>
          <p className="text-[var(--bp-cream)] font-bold mb-1">
            {selected?.path ?? "—"}
          </p>
          <p className="text-[var(--bp-line)] text-xs mb-3">
            {selected?.loading
              ? "Claude is reading this file…"
              : (selected?.explanation ??
                "Click any file above to see Claude's explanation of it.")}
          </p>
          {selected?.content && !selected.loading && (
            <div>
              <button
                onClick={() => setShowCode((v) => !v)}
                className="flex items-center gap-1 text-[10px] font-mono text-[var(--bp-steel)] hover:text-[var(--bp-red)] transition-colors mb-2"
              >
                <CodeIcon size={12} weight={showCode ? "fill" : "regular"} />
                {showCode ? "HIDE CODE" : "VIEW CODE"}
              </button>
              {showCode && (
                <CodePreview
                  code={selected.content}
                  path={selected.path}
                  truncated={selected.truncated}
                />
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
);

export default BlueprintTree;
