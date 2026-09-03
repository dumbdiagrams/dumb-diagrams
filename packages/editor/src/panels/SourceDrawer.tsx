import { useEffect, useRef, useState } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { searchKeymap } from "@codemirror/search";
import { keymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";

export type SourceLocation = Readonly<{
  offset: number;
  line: number;
  column: number;
}>;

export type SourceDiagnostic = Readonly<{
  message: string;
  location?: SourceLocation;
}>;

/** Accessibility attributes for CodeMirror's actual editable element. */
export function sourceEditorAccessibilityAttributes(hasDiagnostics: boolean): Record<string, string> {
  return {
    "aria-label": "Diagram source",
    ...(hasDiagnostics ? { "aria-describedby": "source-editor-diagnostics" } : {}),
  };
}

export function sourceEditorAccessibilityExtension(hasDiagnostics: boolean) {
  return EditorView.contentAttributes.of(sourceEditorAccessibilityAttributes(hasDiagnostics));
}

/**
 * Parser errors retain their original text and, where available, include a
 * one-based character offset. Turn that offset into an editor-friendly
 * location without changing the public parser error contract.
 */
export function sourceDiagnostic(source: string, message: string): SourceDiagnostic {
  const match = message.match(/\bcharacter\s+(\d+)\b/i);
  if (!match) return { message };
  const character = Number(match[1]);
  if (!Number.isSafeInteger(character)) return { message };
  const offset = Math.max(0, Math.min(source.length, character - 1));
  const before = source.slice(0, offset);
  const line = before.split("\n").length;
  const column = offset - before.lastIndexOf("\n");
  return {
    message: `Line ${line}, column ${column}: ${message}`,
    location: { offset, line, column },
  };
}

function useResolvedTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof document === "undefined") return "light";
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
  onCopy,
  canFormat = true,
  onReset,
  onFormat,
}: {
  source: string;
  issues: Array<{ message: string }>;
  onChange: (source: string) => void;
  onCommit: () => void;
  onCopy: () => void;
  canFormat?: boolean;
  onReset?: () => void;
  onFormat: () => void;
}) {
  const resolvedTheme = useResolvedTheme();
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const diagnostics = issues.map((issue) => sourceDiagnostic(source, issue.message));

  const focusDiagnostic = (location: SourceLocation) => {
    const view = editorRef.current?.view;
    if (!view) return;
    view.dispatch({
      selection: { anchor: location.offset },
      effects: EditorView.scrollIntoView(location.offset, { y: "center" }),
    });
    view.focus();
  };

  return (
    <div className="source-drawer">
      <div className="code-actions">
        <button type="button" onClick={onFormat} disabled={!canFormat}>Format</button>
        <button type="button" onClick={onCopy}>
          Copy
        </button>
        {onReset && <button type="button" onClick={onReset}>Reset example</button>}
      </div>
      {diagnostics.length > 0 && (
        <div className="issues" role="status" aria-live="polite" id="source-editor-diagnostics">
          {diagnostics.map((diagnostic, index) => diagnostic.location ? (
            <button
              type="button"
              className="source-diagnostic"
              key={index}
              title={`Jump to line ${diagnostic.location.line}, column ${diagnostic.location.column}`}
              onClick={() => focusDiagnostic(diagnostic.location!)}
            >
              {diagnostic.message}
            </button>
          ) : <div key={index}>{diagnostic.message}</div>)}
        </div>
      )}
      <div className="source-editor-shell">
        <CodeMirror
          ref={editorRef}
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
            sourceEditorAccessibilityExtension(diagnostics.length > 0),
            keymap.of([...defaultKeymap, ...searchKeymap]),
          ]}
          onChange={onChange}
          onBlur={onCommit}
        />
      </div>
    </div>
  );
}
