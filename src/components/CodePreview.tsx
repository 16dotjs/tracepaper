"use client";

import { Highlight } from "prism-react-renderer";
import { blueprintTheme } from "@/lib/prismTheme";
import { getLanguageFromPath } from "@/lib/languageMap";

interface CodePreviewProps {
  code: string;
  path: string;
  truncated?: boolean;
}

export default function CodePreview({
  code,
  path,
  truncated,
}: CodePreviewProps) {
  const language = getLanguageFromPath(path);

  return (
    <div className="border border-[var(--bp-steel)]/30 rounded-sm overflow-hidden">
      <Highlight code={code} language={language} theme={blueprintTheme}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={`${className} text-[11px] leading-relaxed p-3 overflow-x-auto`}
            style={{ ...style, backgroundColor: "var(--bp-navy)", margin: 0 }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                <span className="inline-block w-8 select-none text-[var(--bp-steel)]/50 mr-2">
                  {i + 1}
                </span>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
      {truncated && (
        <p className="text-[10px] font-mono text-[var(--bp-steel)]/60 px-3 py-1.5 border-t border-[var(--bp-steel)]/20">
          Showing a truncated preview — full file is longer.
        </p>
      )}
    </div>
  );
}
