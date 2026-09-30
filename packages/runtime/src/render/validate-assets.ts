import type { DiagramDocument, ValidationIssue } from "../core/index.js";

import { sanitizeSvgResult } from "./sanitize-svg.js";

/**
 * Validate embedded SVGs before a compiler reaches the rendering boundary.
 *
 * The document constraint validator intentionally only checks asset metadata
 * and size limits. SVG markup is untrusted content, so it must be checked at
 * the render boundary without allowing sanitizer errors to escape as compiler
 * exceptions.
 */
export function validateEmbeddedAssets(doc: DiagramDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const asset of doc.assets ?? []) {
    const sanitized = sanitizeSvgResult(asset.content);
    if (sanitized.isErr()) {
      issues.push({
        level: "error",
        code: "invalid-asset",
        message: `Asset ${asset.id}: ${sanitized.error.message}`,
        id: asset.id,
      });
    }
  }
  return issues;
}
