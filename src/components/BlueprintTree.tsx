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
import { CodeIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
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
const COL_WIDTH = 380;
const FILE_LABEL_MAX_WIDTH = COL_WIDTH - 40;
const ROOM_LABEL_MAX_WIDTH = COL_WIDTH - 26;
const SEARCH_DEBOUNCE_MS = 200;

function fitTextToWidth(
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
    if (el.getComputedTextLength() <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  el.textContent =
    lo > 0 ? ellipsis + fullText.slice(fullText.length - lo) : ellipsis;
}

const BlueprintTree = forwardRef<BlueprintTreeHandle, BlueprintTreeProps>(
  function BlueprintTree({ owner, repo, branch, folders, techStack }, ref) {
    const svgRef = useRef<SVGSVGElement>(null);
    const fileElementsRef = useRef<
      Record<
        string,
        { el: SVGGraphicsElement; file: TreeFolder["files"][number] }
      >
    >({});
    const hasAnimatedIntroRef = useRef(false);
    const [selected, setSelected] = useState<SelectedFile | null>(null);
    const [showCode, setShowCode] = useState(false);
    const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
    const [searchInput, setSearchInput] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    useEffect(() => {
      const handle = setTimeout(
        () => setDebouncedSearch(searchInput),
        SEARCH_DEBOUNCE_MS,
      );
      return () => clearTimeout(handle);
    }, [searchInput]);

    const query = debouncedSearch.trim().toLowerCase();
    const isSearching = query.length > 0;
    const totalMatches = isSearching
      ? folders.reduce(
          (sum, f) =>
            sum +
            f.files.filter((file) =>
              file.fullPath.toLowerCase().includes(query),
            ).length,
          0,
        )
      : 0;

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

    const toggleRoom = useCallback((folderName: string) => {
      setExpandedRooms((prev) => {
        const next = new Set(prev);
        if (next.has(folderName)) next.delete(folderName);
        else next.add(folderName);
        return next;
      });
    }, []);

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
      const startY = 160;
      const colY = [startY, startY];
      const gap = 22;

      const rooms = folders.map((folder) => {
        const roomHasMatch =
          isSearching &&
          folder.files.some((f) => f.fullPath.toLowerCase().includes(query));
        const manuallyExpanded = expandedRooms.has(folder.name);
        const isExpanded = manuallyExpanded || roomHasMatch;
        const hasToggle = folder.files.length > MAX_VISIBLE_FILES;
        const visibleFiles = isExpanded
          ? folder.files
          : folder.files.slice(0, MAX_VISIBLE_FILES);
        const overflowCount = folder.files.length - visibleFiles.length;
        const toggleHeight = hasToggle ? 20 : 0;
        const height = 30 + 12 + visibleFiles.length * 20 + toggleHeight + 16;
        const col = colY[0] <= colY[1] ? 0 : 1;
        const room = {
          folder,
          x: colX[col],
          y: colY[col],
          width: COL_WIDTH,
          height,
          visibleFiles,
          overflowCount,
          hasToggle,
          isExpanded,
          roomDim: isSearching && !roomHasMatch,
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
      <text class="meta-value" id="metaStack" x="52" y="88"></text>
      <circle class="pulse-dot" id="pulseDot" cx="270" cy="40" r="3.5" opacity="0"/>
      <text class="meta-label" x="278" y="43">ANALYZED</text>
      <text class="heading" id="mainHeading" x="40" y="132">${repo.toUpperCase()} — REPOSITORY ANALYSIS</text>
    `;

      let clipDefs = "";

      rooms.forEach((room, ri) => {
        clipDefs += `<clipPath id="room-clip-${ri}"><rect x="${room.x - 2}" y="${room.y - 2}" width="${room.width + 4}" height="${room.height + 4}"/></clipPath>`;

        markup += `<g clip-path="url(#room-clip-${ri})"${room.roomDim ? ' class="search-dim"' : ""}>
        <rect class="room-rect" x="${room.x}" y="${room.y}" width="${room.width}" height="${room.height}"/>
        <text class="room-label" id="room-label-${ri}" x="${room.x + 16}" y="${room.y + 20}"></text>
        <line class="divider" x1="${room.x}" y1="${room.y + 32}" x2="${room.x + room.width}" y2="${room.y + 32}"/>`;
        room.visibleFiles.forEach((file, fi) => {
          const id = `f-${ri}-${fi}`;
          const isExtra = fi >= MAX_VISIBLE_FILES;
          const isMatch =
            isSearching && file.fullPath.toLowerCase().includes(query);
          const isDimmed = isSearching && !isMatch;
          const cls = [
            "file-label",
            isExtra && "extra-row",
            isMatch && "search-match",
            isDimmed && "search-dim",
          ]
            .filter(Boolean)
            .join(" ");
          markup += `<text class="${cls}" id="${id}" x="${room.x + 30}" y="${room.y + 54 + fi * 20}"></text>`;
        });
        if (room.hasToggle) {
          const toggleId = `toggle-${ri}`;
          const ty = room.y + 54 + room.visibleFiles.length * 20;
          const label = room.isExpanded
            ? "− show less"
            : `+ ${room.overflowCount} more file${room.overflowCount > 1 ? "s" : ""}`;
          markup += `<text class="overflow-label" id="${toggleId}" x="${room.x + 30}" y="${ty}">${label}</text>`;
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
        ${clipDefs}
      </defs>` + markup;

      const metaStackEl = svg.querySelector<SVGTextElement>("#metaStack");
      if (metaStackEl)
        metaStackEl.textContent = techStack.slice(0, 3).join(" · ") || "—";

      rooms.forEach((room, ri) => {
        const labelEl = svg.querySelector<SVGTextElement>(`#room-label-${ri}`);
        if (labelEl)
          fitTextToWidth(labelEl, room.folder.name, ROOM_LABEL_MAX_WIDTH);

        room.visibleFiles.forEach((file, fi) => {
          const id = `f-${ri}-${fi}`;
          const el = svg.querySelector<SVGTextElement>(`#${id}`);
          if (el) fitTextToWidth(el, file.name, FILE_LABEL_MAX_WIDTH);
        });
      });

      rooms.forEach((room, ri) => {
        room.visibleFiles.forEach((file, fi) => {
          const id = `f-${ri}-${fi}`;
          const el = svg.querySelector<SVGGraphicsElement>(`#${id}`);
          if (!el) return;
          fileElementsRef.current[id] = { el, file };
          el.addEventListener("click", () => handleFileClick(id));
        });
        if (room.hasToggle) {
          const toggleEl = svg.querySelector<SVGGraphicsElement>(
            `#toggle-${ri}`,
          );
          if (toggleEl) {
            toggleEl.addEventListener("click", () =>
              toggleRoom(room.folder.name),
            );
          }
        }
      });

      const roomRects = svg.querySelectorAll<SVGGeometryElement>(".room-rect");
      const dividers = svg.querySelectorAll<SVGGeometryElement>(".divider");
      const fileLabels = svg.querySelectorAll(".file-label, .overflow-label");
      const titleBlock = svg.querySelector<SVGGeometryElement>("#titleBlock")!;
      const mainHeading = svg.querySelector("#mainHeading")!;
      const sectionLabel = svg.querySelector(".section-label")!;
      const pulseDot = svg.querySelector("#pulseDot")!;
      const annotationLayer = svg.querySelector("#annotationLayer")!;
      const notesLayer = svg.querySelector("#notesLayer")!;

      const animate = !hasAnimatedIntroRef.current;
      const tl = gsap.timeline({ defaults: { ease: "power2.inOut" } });

      if (animate) {
        prepDraw(titleBlock);
        roomRects.forEach(prepDraw);
        dividers.forEach(prepDraw);
        gsap.set([...Array.from(fileLabels), mainHeading], {
          opacity: 0,
          y: 6,
        });
        gsap.set(sectionLabel, { opacity: 0 });

        tl.to(titleBlock, { strokeDashoffset: 0, duration: 0.6 })
          .to(mainHeading, { opacity: 1, y: 0, duration: 0.5 }, "-=0.2")
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
          .to(pulseDot, { opacity: 1, duration: 0.2 })
          .to(
            pulseDot,
            { opacity: 0.25, duration: 0.6, repeat: -1, yoyo: true },
            "<",
          )
          .to(sectionLabel, { opacity: 1, duration: 0.3 }, "-=0.1");
      } else {
        gsap.set(
          [titleBlock, ...Array.from(roomRects), ...Array.from(dividers)],
          { strokeDashoffset: 0 },
        );
        gsap.set([...Array.from(fileLabels), mainHeading], {
          opacity: 1,
          y: 0,
        });
        gsap.set(sectionLabel, { opacity: 1 });
        gsap.set(pulseDot, { opacity: 0.25 });
        gsap.to(pulseDot, {
          opacity: 0.6,
          duration: 0.6,
          repeat: -1,
          yoyo: true,
        });
      }

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

        const badgeX = cx + rx + 14;
        const badge = document.createElementNS(NS, "g");
        const badgeCircle = document.createElementNS(NS, "circle");
        badgeCircle.setAttribute("class", "badge-circle");
        badgeCircle.setAttribute("cx", String(badgeX));
        badgeCircle.setAttribute("cy", String(cy));
        badgeCircle.setAttribute("r", "11");
        badge.appendChild(badgeCircle);
        const badgeText = document.createElementNS(NS, "text");
        badgeText.setAttribute("class", "badge-text");
        badgeText.setAttribute("x", String(badgeX));
        badgeText.setAttribute("y", String(cy + 4));
        badgeText.textContent = String(file.startHereOrder);
        badge.appendChild(badgeText);
        annotationLayer.appendChild(badge);

        const noteY = notesY + 34 + i * 24;
        const note = document.createElementNS(NS, "g");
        const noteNum = document.createElementNS(NS, "text");
        noteNum.setAttribute("class", "note-num");
        noteNum.setAttribute("x", "60");
        noteNum.setAttribute("y", String(noteY));
        noteNum.textContent = String(file.startHereOrder).padStart(2, "0");
        note.appendChild(noteNum);
        const noteText = document.createElementNS(NS, "text");
        noteText.setAttribute("class", "note-text");
        noteText.setAttribute("x", "82");
        noteText.setAttribute("y", String(noteY));
        noteText.textContent = `${file.fullPath} — ${file.startHereReason}`;
        note.appendChild(noteText);
        notesLayer.appendChild(note);

        if (animate) {
          prepDraw(ann as unknown as SVGGeometryElement);
          gsap.set(badge, {
            opacity: 0,
            scale: 0,
            transformOrigin: `${badgeX}px ${cy}px`,
          });
          gsap.set(note, { opacity: 0, y: 6 });
          tl.to(ann, { strokeDashoffset: 0, duration: 0.6 }, "+=0.3")
            .to(
              badge,
              { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2.2)" },
              "-=0.15",
            )
            .to(note, { opacity: 1, y: 0, duration: 0.35 }, "-=0.1");
        } else {
          gsap.set(badge, { opacity: 1, scale: 1 });
          gsap.set(note, { opacity: 1, y: 0 });
        }
      });

      if (animate) {
        hasAnimatedIntroRef.current = true;
      } else {
        const extraRows = svg.querySelectorAll(".extra-row");
        if (extraRows.length) {
          gsap.fromTo(
            extraRows,
            { opacity: 0, y: 4 },
            { opacity: 1, y: 0, duration: 0.25, stagger: 0.02 },
          );
        }
      }

      return () => {
        tl.kill();
      };
    }, [
      folders,
      owner,
      repo,
      techStack,
      handleFileClick,
      toggleRoom,
      expandedRooms,
      isSearching,
      query,
    ]);

    return (
      <div>
        <div className="mb-3 relative">
          <MagnifyingGlassIcon
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--bp-steel)]"
          />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Filter files…"
            className="w-full bg-transparent border border-[var(--bp-steel)]/40 rounded-sm pl-8 pr-8 py-2
                     font-mono text-xs placeholder:text-[var(--bp-steel)]/50
                     focus:outline-none focus:border-[var(--bp-red)] transition-colors"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--bp-steel)] hover:text-[var(--bp-red)] transition-colors"
            >
              <XIcon size={12} />
            </button>
          )}
        </div>
        {isSearching && totalMatches === 0 && (
          <p className="text-[10px] font-mono text-[var(--bp-steel)] mb-2">
            No files match &quot;{searchInput}&quot;
          </p>
        )}

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
