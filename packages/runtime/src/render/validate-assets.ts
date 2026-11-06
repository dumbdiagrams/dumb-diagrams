import type { DiagramDocument, ValidationIssue } from "../core/index.js";

import { sanitizeSvgResult } from "./sanitize-svg.js";

/**
 * Sanitize embedded SVG markup (untrusted) before rendering, reporting
 * failures as issues instead of compiler exceptions. Document validation only
 * checks asset metadata and size.
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
