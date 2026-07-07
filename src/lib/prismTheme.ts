import type { PrismTheme } from "prism-react-renderer";

export const blueprintTheme: PrismTheme = {
  plain: {
    color: "var(--bp-line)",
    backgroundColor: "transparent",
  },
  styles: [
    {
      types: ["comment", "prolog", "doctype", "cdata"],
      style: { color: "var(--bp-steel)", fontStyle: "italic" },
    },
    { types: ["punctuation"], style: { color: "var(--bp-steel)" } },
    {
      types: [
        "property",
        "tag",
        "boolean",
        "number",
        "constant",
        "symbol",
        "deleted",
      ],
      style: { color: "var(--bp-red)" },
    },
    {
      types: ["selector", "attr-name", "string", "char", "builtin", "inserted"],
      style: { color: "var(--bp-cream)" },
    },
    {
      types: ["operator", "entity", "url"],
      style: { color: "var(--bp-steel)" },
    },
    {
      types: ["atrule", "attr-value", "keyword"],
      style: { color: "var(--bp-red)", fontWeight: "bold" },
    },
    {
      types: ["function", "class-name"],
      style: { color: "var(--bp-line)", fontWeight: "bold" },
    },
    {
      types: ["regex", "important", "variable"],
      style: { color: "var(--bp-cream)" },
    },
  ],
};
