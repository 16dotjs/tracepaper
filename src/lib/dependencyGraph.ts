interface TsconfigAliases {
  [aliasPrefix: string]: string;
}

interface ResolutionContext {
  tsconfigAliases: TsconfigAliases;
  goModuleName: string | null;
  hasSrcRoot: boolean;
}

export type GraphLanguage = "javascript" | "python" | "go";

const LANGUAGE_EXTENSIONS: Record<GraphLanguage, Set<string>> = {
  javascript: new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs"]),
  python: new Set(["py"]),
  go: new Set(["go"]),
};

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
const PY_RESOLUTION_SUFFIXES = [".py", "/__init__.py"];

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

export function detectLanguage(path: string): GraphLanguage | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  for (const [lang, exts] of Object.entries(LANGUAGE_EXTENSIONS) as [
    GraphLanguage,
    Set<string>,
  ][]) {
    if (exts.has(ext)) return lang;
  }
  return null;
}

export function isGraphEligible(path: string): boolean {
  return detectLanguage(path) !== null;
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

export function parseGoModuleName(goModContent: string): string | null {
  const match = goModContent.match(/^module\s+(\S+)/m);
  return match ? match[1] : null;
}

const JS_IMPORT_REGEX =
  /(?:import|export)\s+(?:[\w*\s{},]+\s+from\s+)?['"]([^'"]+)['"]|(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/g;

function extractJsImports(content: string): string[] {
  const specs = new Set<string>();
  let match: RegExpExecArray | null;
  JS_IMPORT_REGEX.lastIndex = 0;
  while ((match = JS_IMPORT_REGEX.exec(content)) !== null) {
    const spec = match[1] ?? match[2];
    if (spec) specs.add(spec);
  }
  return Array.from(specs);
}

const PY_FROM_IMPORT_REGEX = /^\s*from\s+([.\w]+)\s+import\b/gm;
const PY_IMPORT_REGEX = /^\s*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/gm;

function extractPythonImports(content: string): string[] {
  const specs = new Set<string>();
  let match: RegExpExecArray | null;

  PY_FROM_IMPORT_REGEX.lastIndex = 0;
  while ((match = PY_FROM_IMPORT_REGEX.exec(content)) !== null) {
    specs.add(match[1]);
  }

  PY_IMPORT_REGEX.lastIndex = 0;
  while ((match = PY_IMPORT_REGEX.exec(content)) !== null) {
    match[1].split(",").forEach((m) => specs.add(m.trim()));
  }

  return Array.from(specs);
}

const GO_SINGLE_IMPORT_REGEX = /^\s*import\s+(?:\w+\s+)?"([^"]+)"/gm;
const GO_IMPORT_BLOCK_REGEX = /import\s*\(([\s\S]*?)\)/g;
const GO_QUOTED_REGEX = /"([^"]+)"/g;

function extractGoImports(content: string): string[] {
  const specs = new Set<string>();
  let match: RegExpExecArray | null;

  GO_SINGLE_IMPORT_REGEX.lastIndex = 0;
  while ((match = GO_SINGLE_IMPORT_REGEX.exec(content)) !== null) {
    specs.add(match[1]);
  }

  GO_IMPORT_BLOCK_REGEX.lastIndex = 0;
  while ((match = GO_IMPORT_BLOCK_REGEX.exec(content)) !== null) {
    const block = match[1];
    let quoted: RegExpExecArray | null;
    GO_QUOTED_REGEX.lastIndex = 0;
    while ((quoted = GO_QUOTED_REGEX.exec(block)) !== null) {
      specs.add(quoted[1]);
    }
  }

  return Array.from(specs);
}

export function extractImportSpecifiers(
  content: string,
  language: GraphLanguage,
): string[] {
  if (language === "python") return extractPythonImports(content);
  if (language === "go") return extractGoImports(content);
  return extractJsImports(content);
}

export function resolveJsImport(
  spec: string,
  fromPath: string,
  knownPaths: Set<string>,
  aliases: TsconfigAliases,
): string[] {
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

  if (candidateBase === null) return [];

  for (const suffix of RESOLUTION_SUFFIXES) {
    const candidate = candidateBase + suffix;
    if (knownPaths.has(candidate)) return [candidate];
  }
  return [];
}

export function resolvePythonImport(
  spec: string,
  fromPath: string,
  knownPaths: Set<string>,
  ctx: ResolutionContext,
): string[] {
  const dotMatch = spec.match(/^(\.+)(.*)$/);

  if (dotMatch) {
    const dotCount = dotMatch[1].length;
    const remainder = dotMatch[2];
    let dir = dirname(fromPath);
    for (let i = 0; i < dotCount - 1; i++) dir = dirname(dir);

    if (remainder === "") {
      const initPath = joinPath(dir, "__init__.py");
      return knownPaths.has(initPath) ? [initPath] : [];
    }

    const remainderPath = remainder.replace(/\./g, "/");
    const base = joinPath(dir, remainderPath);
    for (const suffix of PY_RESOLUTION_SUFFIXES) {
      const candidate = base + suffix;
      if (knownPaths.has(candidate)) return [candidate];
    }
    return [];
  }

  const dottedPath = spec.replace(/\./g, "/");
  const roots = ctx.hasSrcRoot ? ["", "src/"] : [""];
  for (const root of roots) {
    for (const suffix of PY_RESOLUTION_SUFFIXES) {
      const candidate = root + dottedPath + suffix;
      if (knownPaths.has(candidate)) return [candidate];
    }
  }
  return [];
}

export function resolveGoImport(
  spec: string,
  knownPaths: Set<string>,
  goModuleName: string | null,
): { resolved: string[]; wasInternal: boolean } {
  if (!goModuleName || !spec.startsWith(goModuleName)) {
    return { resolved: [], wasInternal: false };
  }
  const localDir = spec.slice(goModuleName.length).replace(/^\//, "");
  const matches = Array.from(knownPaths).filter((p) => dirname(p) === localDir);
  return { resolved: matches, wasInternal: true };
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
  goModContent: string | null,
): DependencyGraphResult {
  const tsconfigAliases = tsconfigContent
    ? parseTsconfigPaths(tsconfigContent)
    : {};
  const goModuleName = goModContent ? parseGoModuleName(goModContent) : null;
  const knownPaths = new Set(files.map((f) => f.path));
  const hasSrcRoot = Array.from(knownPaths).some((p) => p.startsWith("src/"));
  const ctx: ResolutionContext = { tsconfigAliases, goModuleName, hasSrcRoot };

  const edgeSet = new Set<string>();
  const edges: GraphEdge[] = [];
  let unresolvedCount = 0;

  files.forEach((file) => {
    const language = detectLanguage(file.path);
    if (!language) return;

    extractImportSpecifiers(file.content, language).forEach((spec) => {
      let resolvedPaths: string[] = [];
      let countIfUnresolved = false;

      if (language === "javascript") {
        resolvedPaths = resolveJsImport(
          spec,
          file.path,
          knownPaths,
          tsconfigAliases,
        );
        countIfUnresolved =
          spec.startsWith(".") ||
          Object.keys(tsconfigAliases).some((p) => spec.startsWith(p));
      } else if (language === "python") {
        resolvedPaths = resolvePythonImport(spec, file.path, knownPaths, ctx);
        countIfUnresolved = spec.startsWith(".");
      } else if (language === "go") {
        const goResult = resolveGoImport(spec, knownPaths, goModuleName);
        resolvedPaths = goResult.resolved;
        countIfUnresolved = goResult.wasInternal;
      }

      if (resolvedPaths.length === 0) {
        if (countIfUnresolved) unresolvedCount++;
        return;
      }

      resolvedPaths.forEach((resolved) => {
        if (resolved === file.path) return;
        const edgeKey = `${file.path}→${resolved}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          edges.push({ from: file.path, to: resolved });
        }
      });
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
