/** Return the stable identity used to match a baseline warning to its review. */
export function routingWarningKey(warning) {
  return `${warning.file}\0${warning.code}\0${warning.message}`;
}

/**
 * Every baselined warning must have one or more explicit, completed reviews.
 * A matching review with an absent, unknown, or pending status is not enough;
 * its decision must also contain non-whitespace text.
 */
export function routingReviewFailures(warnings, reviews = []) {
  const byWarning = new Map();
  for (const review of Array.isArray(reviews) ? reviews : []) {
    if (!review || typeof review !== "object") continue;
    const key = routingWarningKey(review);
    const matches = byWarning.get(key) ?? [];
    matches.push(review);
    byWarning.set(key, matches);
  }

  const failures = [];
  for (const warning of warnings) {
    const matches = byWarning.get(routingWarningKey(warning)) ?? [];
    if (!matches.length) {
      failures.push({ warning, reason: "missing review" });
      continue;
    }
    for (const review of matches) {
      if (review?.status !== "reviewed") {
        failures.push({
          warning,
          reason: `review status must be reviewed (found ${review?.status ?? "missing"})`,
        });
      } else if (typeof review.decision !== "string" || !review.decision.trim()) {
        failures.push({ warning, reason: "review decision must be non-empty" });
      }
    }
  }
  return failures;
}

/** Return baseline entries that use a hard invariant tier. */
export function hardRoutingWarnings(warnings, tierForCode) {
  return warnings.filter((warning) => tierForCode(warning.code) === "hard");
}

/** Return warning entries present on only one side of a baseline comparison. */
export function routingWarningDelta(actual, expected) {
  const expectedKeys = new Set(expected.map(routingWarningKey));
  const actualKeys = new Set(actual.map(routingWarningKey));
  return {
    added: actual.filter((warning) => !expectedKeys.has(routingWarningKey(warning))),
    removed: expected.filter((warning) => !actualKeys.has(routingWarningKey(warning))),
  };
}
