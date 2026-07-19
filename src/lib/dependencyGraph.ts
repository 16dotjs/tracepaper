interface TsconfigAliases {
  [aliasPrefix: string]: string;
}

const IMPORT_REGEX =
  /(?:import|export)\s+(?:[\w*\s{},]+\s+from\s+)?['"]([^'"]+)['"]|(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/g;
const CODE_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs"]);
const RESOLUTION_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
];

export interface GraphNode {
  path: string;
  layer: number;
}
export interface GraphEdge {
  from: string;
  to: string;
}
export interface DependencyGraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  unresolvedCount: number;
  eligibleFileCount: number;
}

export function isGraphEligible(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return CODE_EXTENSIONS.has(ext);
}

function dirname(filePath: string): string {
  const idx = filePath.lastIndexOf("/");
  return idx === -1 ? "" : filePath.slice(0, idx);
}

function normalizeSegments(pathStr: string): string {
  const stack: string[] = [];
  pathStr.split("/").forEach((part) => {
    if (part === "" || part === ".") return;
    if (part === "..") stack.pop();
    else stack.push(part);
  });
  return stack.join("/");
}

function joinPath(...parts: string[]): string {
  return normalizeSegments(parts.join("/"));
}

export function parseTsconfigPaths(tsconfigContent: string): TsconfigAliases {
  const aliases: TsconfigAliases = {};
  try {
    const stripped = tsconfigContent
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    const parsed = JSON.parse(stripped);
    const paths = parsed?.compilerOptions?.paths;
    if (!paths || typeof paths !== "object") return aliases;

    Object.entries(paths).forEach(([key, value]) => {
      if (
        !key.endsWith("/*") ||
        !Array.isArray(value) ||
        typeof value[0] !== "string"
      )
        return;
      const aliasPrefix = key.slice(0, -1);
      const target = value[0].replace(/^\.\//, "").replace(/\*$/, "");
      aliases[aliasPrefix] = target;
    });
  } catch {}
  return aliases;
}

export function extractImportSpecifiers(content: string): string[] {
  const specs = new Set<string>();
  let match: RegExpExecArray | null;
  IMPORT_REGEX.lastIndex = 0;
  while ((match = IMPORT_REGEX.exec(content)) !== null) {
    const spec = match[1] ?? match[2];
    if (spec) specs.add(spec);
  }
  return Array.from(specs);
}

export function resolveImportPath(
  spec: string,
  fromPath: string,
  knownPaths: Set<string>,
  aliases: TsconfigAliases,
): string | null {
  let candidateBase: string | null = null;

  if (spec.startsWith(".")) {
    candidateBase = joinPath(dirname(fromPath), spec);
  } else {
    const aliasKey = Object.keys(aliases).find((prefix) =>
      spec.startsWith(prefix),
    );
    if (aliasKey) {
      candidateBase = normalizeSegments(
        aliases[aliasKey] + spec.slice(aliasKey.length),
      );
    }
  }

  if (candidateBase === null) return null;

  for (const suffix of RESOLUTION_SUFFIXES) {
    const candidate = candidateBase + suffix;
    if (knownPaths.has(candidate)) return candidate;
  }
  return null;
}

function computeLayers(
  nodes: string[],
  edges: GraphEdge[],
): Map<string, number> {
  const inDegree = new Map<string, number>();
  nodes.forEach((n) => inDegree.set(n, 0));
  edges.forEach((e) => inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1));

  const layer = new Map<string, number>();
  const roots = nodes.filter((n) => (inDegree.get(n) ?? 0) === 0);
  (roots.length > 0 ? roots : nodes.slice(0, 1)).forEach((n) =>
    layer.set(n, 0),
  );

  let iterations = 0;
  const maxIterations = nodes.length * 4;
  let changed = true;
  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;
    edges.forEach(({ from, to }) => {
      const fromLayer = layer.get(from);
      if (fromLayer === undefined) return;
      const candidate = fromLayer + 1;
      if ((layer.get(to) ?? -1) < candidate) {
        layer.set(to, candidate);
        changed = true;
      }
    });
  }

  nodes.forEach((n) => {
    if (!layer.has(n)) layer.set(n, 0);
  });
  return layer;
}

export function buildDependencyGraph(
  files: { path: string; content: string }[],
  tsconfigContent: string | null,
): DependencyGraphResult {
  const aliases = tsconfigContent ? parseTsconfigPaths(tsconfigContent) : {};
  const knownPaths = new Set(files.map((f) => f.path));
  const edgeSet = new Set<string>();
  const edges: GraphEdge[] = [];
  let unresolvedCount = 0;

  files.forEach((file) => {
    if (!isGraphEligible(file.path)) return;
    extractImportSpecifiers(file.content).forEach((spec) => {
      const resolved = resolveImportPath(spec, file.path, knownPaths, aliases);
      if (!resolved || resolved === file.path) {
        const looksLocal =
          spec.startsWith(".") ||
          Object.keys(aliases).some((p) => spec.startsWith(p));
        if (looksLocal) unresolvedCount++;
        return;
      }
      const edgeKey = `${file.path}→${resolved}`;
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edges.push({ from: file.path, to: resolved });
      }
    });
  });

  const nodePaths = Array.from(knownPaths).filter(
    (p) => isGraphEligible(p) && edges.some((e) => e.from === p || e.to === p),
  );

  const layers = computeLayers(nodePaths, edges);
  const nodes: GraphNode[] = nodePaths.map((path) => ({
    path,
    layer: layers.get(path) ?? 0,
  }));

  const eligibleFileCount = files.filter((f) => isGraphEligible(f.path)).length;

  return { nodes, edges, unresolvedCount, eligibleFileCount };
}
