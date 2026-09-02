import { useEffect, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { searchKeymap } from "@codemirror/search";
import { keymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";

function useResolvedTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const attr = document.documentElement.dataset.theme;
    if (attr === "dark") return "dark";
    return "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      const attr = root.dataset.theme;
      setTheme(attr === "dark" ? "dark" : "light");
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      observer.disconnect();
    };
  }, []);

  return theme;
}

const lightEditorTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--surface-solid)",
    color: "var(--ink)",
  },
  ".cm-content": {
    caretColor: "var(--accent)",
    padding: "12px 0",
  },
  ".cm-gutters": {
    backgroundColor: "var(--surface-elevated)",
    color: "var(--muted)",
    borderRight: "1px solid var(--line)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--accent-soft)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--accent) 24%, transparent)",
  },
});

export function SourceDrawer({
  source,
  issues,
  onChange,
  onCommit,
  canFormat = true,
  onReset,
  onFormat,
}: {
  source: string;
  issues: Array<{ message: string }>;
  onChange: (source: string) => void;
  onCommit: () => void;
  canFormat?: boolean;
  onReset?: () => void;
  onFormat: () => void;
}) {
  const resolvedTheme = useResolvedTheme();

  return (
    <div className="source-drawer">
      <div className="code-actions">
        <button type="button" onClick={onFormat} disabled={!canFormat}>Format</button>
        <button type="button" onClick={() => navigator.clipboard.writeText(source)}>
          Copy
        </button>
        {onReset && <button type="button" onClick={onReset}>Reset example</button>}
      </div>
      {issues.length > 0 && (
        <div className="issues" role="status">
          {issues.map((issue, index) => <div key={index}>{issue.message}</div>)}
        </div>
      )}
      <div className="source-editor-shell">
        <CodeMirror
          value={source}
          height="100%"
          theme={resolvedTheme === "dark" ? oneDark : lightEditorTheme}
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            bracketMatching: true,
            highlightActiveLine: true,
          }}
          extensions={[
            EditorView.lineWrapping,
            keymap.of([...defaultKeymap, ...searchKeymap]),
          ]}
          onChange={onChange}
          onBlur={onCommit}
        />
      </div>
    </div>
  );
}
