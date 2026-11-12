import type { Annotation, AnnotationStyle, TextFontFamily, TextAlign } from "@dumb-diagrams/runtime/core";
import type { CSSProperties } from "react";
import { DIAGRAM_LIMITS, normalizeMultilineText } from "@dumb-diagrams/runtime/core";
import { matchAnnotationTheme, themesForStyle } from "@dumb-diagrams/runtime/render";
import { ANNOTATION_STYLES } from "../editor-model";
import "../styles/annotation-controls.css";

export function NoteComposer({
  style,
  onStyleChange,
  onCreate,
}: {
  style: AnnotationStyle;
  onStyleChange: (style: AnnotationStyle) => void;
  onCreate: () => void;
}) {
  const selected = ANNOTATION_STYLES.find((candidate) => candidate.id === style) ?? ANNOTATION_STYLES[0]!;

  return (
    <div className="note-composer">
      <div className="note-composer-intro">
        <NoteStylePreview style={style} className="note-composer-preview" />
        <div>
          <strong>{selected.label}</strong>
          <p>{selected.description}</p>
        </div>
      </div>

      <div className="property-section note-composer-section">
        <label>Choose a note type</label>
        <NoteStyleOptions selectedStyle={style} onStyleChange={onStyleChange} showPreviews includeText={false} />
      </div>

      <div className="note-composer-footer">
        <button type="button" className="primary-button note-create-button" onClick={onCreate}>
          Create {selected.label}
        </button>
      </div>
    </div>
  );
}

export function TextComposer({
  value,
  font,
  fontSize,
  align,
  onChange,
  onFontChange,
  onFontSizeChange,
  onAlignChange,
  onCreate,
}: {
  value: string;
  font: TextFontFamily;
  fontSize: number;
  align: TextAlign;
  onChange: (value: string) => void;
  onFontChange: (font: TextFontFamily) => void;
  onFontSizeChange: (fontSize: number) => void;
  onAlignChange: (align: TextAlign) => void;
  onCreate: () => void;
}) {
  return (
    <div className="text-composer">
      <div className="property-section">
        <label htmlFor="text-composer-content">Text content</label>
        <textarea
          id="text-composer-content"
          data-autofocus
          value={value}
          maxLength={DIAGRAM_LIMITS.annotationCharacters}
          rows={5}
          placeholder="Type something…"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") onCreate();
          }}
          aria-describedby="text-composer-hint"
        />
        <p id="text-composer-hint" className="property-hint">
          Press ⌘Enter or Ctrl+Enter to place. You can edit or drag it afterward.
        </p>
      </div>
      <TextFormattingControls
        idPrefix="composer"
        font={font}
        fontSize={fontSize}
        align={align}
        onChange={({ font: nextFont, fontSize: nextSize, align: nextAlign }) => {
          if (nextFont !== undefined) onFontChange(nextFont);
          if (nextSize !== undefined) onFontSizeChange(nextSize);
          if (nextAlign !== undefined) onAlignChange(nextAlign);
        }}
      />
      <div className="note-composer-footer">
        <button
          type="button"
          className="primary-button note-create-button"
          onClick={onCreate}
          disabled={!normalizeMultilineText(value)}
        >
          Place text
        </button>
      </div>
    </div>
  );
}

export function TextFormattingControls(props: {
  idPrefix: string;
  font: TextFontFamily;
  fontSize: number;
  align: TextAlign;
  noteStyle?: AnnotationStyle;
  themeSource?: Pick<Annotation, "background" | "color" | "style">;
  onChange: (format: { font?: TextFontFamily; fontSize?: number; align?: TextAlign; theme?: string }) => void;
}) {
  const { idPrefix, font, fontSize, align, noteStyle, themeSource, onChange } = props;
  const activeTheme = themeSource ? matchAnnotationTheme(themeSource) : null;
  const fontSizes = [...new Set([12, 14, 16, 20, 24, 32, fontSize])].sort((a, b) => a - b);
  return (
    <div className="property-section text-formatting">
      <div className="property-control-row">
        <label htmlFor={`${idPrefix}-text-font-family`}>Font</label>
        <select
          id={`${idPrefix}-text-font-family`}
          value={font}
          onChange={(event) => onChange({ font: event.target.value as TextFontFamily })}
        >
          <option value="sans">Sans serif</option>
          <option value="serif">Serif</option>
          <option value="mono">Monospace</option>
        </select>
      </div>
      <div className="property-control-row">
        <label htmlFor={`${idPrefix}-text-font-size`}>Size</label>
        <select
          id={`${idPrefix}-text-font-size`}
          value={fontSize}
          onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
        >
          {fontSizes.map((size) => (
            <option key={size} value={size}>
              {size}px
            </option>
          ))}
        </select>
      </div>
      <div>
        <span className="property-control-label">Alignment</span>
        <div className="button-pair button-triplet" role="group" aria-label="Text alignment">
          {(["left", "center", "right"] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={align === candidate ? "is-active" : ""}
              aria-pressed={align === candidate}
              onClick={() => onChange({ align: candidate })}
            >
              {candidate[0]!.toUpperCase() + candidate.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {noteStyle && themesForStyle(noteStyle).length > 0 && (
        <AnnotationThemeSwatches
          id={`${idPrefix}-theme`}
          style={noteStyle}
          activeThemeId={activeTheme?.id ?? ""}
          onChange={(themeId) => onChange({ theme: themeId })}
        />
      )}
    </div>
  );
}

function AnnotationThemeSwatches({
  id,
  style,
  activeThemeId,
  onChange,
}: {
  id: string;
  style: AnnotationStyle;
  activeThemeId: string;
  onChange: (themeId: string) => void;
}) {
  const options = themesForStyle(style);
  const usingDefault = activeThemeId === "";

  return (
    <div className="annotation-color-control">
      <span className="property-control-label" id={`${id}-label`}>
        Colour theme
      </span>
      <div className="annotation-color-swatches" role="group" aria-labelledby={`${id}-label`}>
        <button
          type="button"
          className={`annotation-color-swatch is-default${usingDefault ? " is-active" : ""}`}
          aria-label="Colour theme: Style default"
          aria-pressed={usingDefault}
          title="Style default"
          onClick={() => onChange("")}
        >
          <span aria-hidden="true" />
        </button>
        {options.map((theme) => {
          const selected = activeThemeId === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              className={`annotation-color-swatch annotation-theme-swatch${selected ? " is-active" : ""}`}
              style={
                {
                  "--swatch-color": theme.background,
                  "--swatch-ink": theme.color,
                } as CSSProperties
              }
              aria-label={`Colour theme: ${theme.label}`}
              aria-pressed={selected}
              title={theme.label}
              onClick={() => onChange(theme.id)}
            >
              <span aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function NoteStyleOptions({
  selectedStyle,
  onStyleChange,
  showPreviews = false,
  includeText = true,
}: {
  selectedStyle: AnnotationStyle;
  onStyleChange: (style: AnnotationStyle) => void;
  showPreviews?: boolean;
  includeText?: boolean;
}) {
  const styles = includeText ? ANNOTATION_STYLES : ANNOTATION_STYLES.filter((candidate) => candidate.id !== "text");

  return (
    <div className={`note-style-grid${showPreviews ? " note-style-grid-with-previews" : ""}`}>
      {styles.map((candidate) => (
        <button
          key={candidate.id}
          type="button"
          className={`note-style-button${selectedStyle === candidate.id ? " is-active" : ""}`}
          aria-label={candidate.label}
          aria-pressed={selectedStyle === candidate.id}
          onClick={() => onStyleChange(candidate.id)}
        >
          {showPreviews && <NoteStylePreview style={candidate.id} />}
          <strong>{candidate.label}</strong>
          <span className="note-style-description">{candidate.description}</span>
        </button>
      ))}
    </div>
  );
}

function NoteStylePreview({ style, className = "" }: { style: AnnotationStyle; className?: string }) {
  return (
    <span
      className={`note-style-preview note-style-preview-${style}${className ? ` ${className}` : ""}`}
      data-note-style-preview={style}
      aria-hidden="true"
    >
      {style === "paper" && (
        <>
          <span className="note-preview-fold" />
          <span className="note-preview-line note-preview-line-long" />
          <span className="note-preview-line note-preview-line-short" />
          <span className="note-preview-line note-preview-line-medium" />
        </>
      )}
      {style === "code" && (
        <>
          <span className="note-preview-code-line note-preview-code-line-long" />
          <span className="note-preview-code-line note-preview-code-line-medium" />
          <span className="note-preview-code-line note-preview-code-line-short" />
        </>
      )}
      {style === "text" && (
        <>
          <span className="note-preview-text-line note-preview-text-line-long">Text</span>
          <span className="note-preview-text-line note-preview-text-line-short">editable</span>
        </>
      )}
      {style === "callout" && (
        <>
          <span className="note-preview-callout-mark">i</span>
          <span className="note-preview-callout-line note-preview-callout-line-long" />
          <span className="note-preview-callout-line note-preview-callout-line-short" />
        </>
      )}
      {style === "checklist" && (
        <>
          <span className="note-preview-check-row">
            <i>✓</i>
            <b />
          </span>
          <span className="note-preview-check-row">
            <i />
            <b />
          </span>
          <span className="note-preview-check-row">
            <i />
            <b />
          </span>
        </>
      )}
    </span>
  );
}
