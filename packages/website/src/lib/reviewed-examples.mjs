import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDgmResult } from '@dumb-diagrams/runtime/dsl';

import { approvedRoot } from './examples.mjs';

const DIFFICULTIES = ['easy', 'medium', 'hard'];

/** @typedef {{ id: string, run: string, provider: 'aws' | 'azure' | 'gcp' | 'cloud-agnostic', difficulty: 'easy' | 'medium' | 'hard', model: string, reasoning?: string, featured: boolean, label: string, generatedOn: string, strictPass: boolean, routingWarnings: number, title: string, width: number, height: number, reviewNote?: string, files: Record<'svg' | 'source' | 'prompt' | 'requirements', string>, paths: Record<'svg' | 'source' | 'prompt' | 'requirements', string>, promptText: string }} ReviewedExample */

/** Every bundle of every approved run, featured run first, ordered by difficulty within a run. @returns {ReviewedExample[]} */
export function loadReviewedExamples() {
  const root = approvedRoot();
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({ run: entry.name, manifest: JSON.parse(readFileSync(join(root, entry.name, 'manifest.json'), 'utf8')) }))
    .sort((a, b) => Number(Boolean(b.manifest.featured)) - Number(Boolean(a.manifest.featured)) || a.run.localeCompare(b.run))
    .flatMap(({ run, manifest }) => {
      return manifest.bundles
        .map(bundle => {
          const directory = join(root, run, bundle.id);
          const paths = {
            svg: join(directory, 'diagram.svg'),
            source: join(directory, 'diagram.dgm'),
            prompt: join(directory, 'user-prompt.md'),
            requirements: join(directory, 'requirements.json'),
          };
          const svg = readFileSync(paths.svg, 'utf8');
          const dimensions = svg.match(/<svg\b[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"/);
          if (!dimensions) throw new Error(`${run}/${bundle.id}: SVG has no width and height`);
          return {
            ...bundle,
            run,
            model: manifest.model,
            reasoning: manifest.reasoning,
            featured: Boolean(manifest.featured),
            label: manifest.reasoning ? `${manifest.model} (${manifest.reasoning})` : manifest.model,
            generatedOn: manifest.generatedOn,
            title: parseDgmResult(readFileSync(paths.source, 'utf8')).map(doc => doc.title).unwrapOr(undefined) ?? bundle.id,
            width: Number(dimensions[1]),
            height: Number(dimensions[2]),
            reviewNote: bundle.strictPass
              ? undefined
              : `Strict validation reports ${bundle.routingWarnings} routing findings, mostly plain arrow crossings; accepted in review.`,
            files: {
              svg: `${run}/${bundle.id}.svg`,
              source: `${run}/${bundle.id}.dgm`,
              prompt: `${run}/${bundle.id}.prompt.md`,
              requirements: `${run}/${bundle.id}.requirements.json`,
            },
            paths,
            promptText: readFileSync(paths.prompt, 'utf8').replace(/^# .*\n+/, ''),
          };
        })
        .sort((a, b) => DIFFICULTIES.indexOf(a.difficulty) - DIFFICULTIES.indexOf(b.difficulty) || a.id.localeCompare(b.id));
    });
}
