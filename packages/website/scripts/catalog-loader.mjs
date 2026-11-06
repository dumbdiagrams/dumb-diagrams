import { readFile } from 'node:fs/promises';
import { getCatalogEntryByBrowserPath } from '@dumb-diagrams/runtime/catalog';
import { errAsync, ResultAsync } from 'neverthrow';

const root = new URL('../../../', import.meta.url);

/** Load local catalog assets for both website export pipelines. */
export function loadCatalogSvg(browserPath) {
  const entry = getCatalogEntryByBrowserPath(browserPath);
  const failure = cause => ({
    code: 'catalog-icon-load-failed',
    message: cause instanceof Error ? cause.message : `Missing catalog entry: ${browserPath}`,
    browserPath,
    ...(cause === undefined ? {} : { cause }),
  });
  return entry
    ? ResultAsync.fromPromise(Promise.resolve().then(() => readFile(new URL(entry.iconPath, root), 'utf8')), failure)
    : errAsync(failure());
}
