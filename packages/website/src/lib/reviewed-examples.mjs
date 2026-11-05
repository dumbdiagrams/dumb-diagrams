import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { approvedRoot } from './examples.mjs';

const DIFFICULTIES = ['easy', 'medium', 'hard'];

/** @typedef {{ id: string, run: string, provider: 'aws' | 'azure' | 'gcp' | 'cloud-agnostic', difficulty: 'easy' | 'medium' | 'hard', model: string, generatedOn: string, strictPass: boolean, routingWarnings: number, title: string, width: number, height: number, reviewNote?: string, files: Record<'svg' | 'source' | 'prompt' | 'requirements', string>, paths: Record<'svg' | 'source' | 'prompt' | 'requirements', string>, promptText: string }} ReviewedExample */

/** Every bundle of every approved run, ordered by difficulty within a run. @returns {ReviewedExample[]} */
export function loadReviewedExamples() {
  const root = approvedRoot();
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
    .flatMap(run => {
      const manifest = JSON.parse(readFileSync(join(root, run, 'manifest.json'), 'utf8'));
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
            generatedOn: manifest.generatedOn,
            title: readFileSync(paths.source, 'utf8').match(/^\s*title "([^"]+)"/m)?.[1] ?? bundle.id,
            width: Number(dimensions[1]),
            height: Number(dimensions[2]),
            reviewNote: bundle.strictPass
              ? undefined
              : `Strict validation reports ${bundle.routingWarnings} routing findings, mostly plain arrow crossings; accepted in review.`,
            files: {
              svg: `${bundle.id}.svg`,
              source: `${bundle.id}.dgm`,
              prompt: `${bundle.id}.prompt.md`,
              requirements: `${bundle.id}.requirements.json`,
            },
            paths,
            promptText: readFileSync(paths.prompt, 'utf8').replace(/^# .*\n+/, ''),
          };
        })
        .sort((a, b) => DIFFICULTIES.indexOf(a.difficulty) - DIFFICULTIES.indexOf(b.difficulty) || a.id.localeCompare(b.id));
    });
}
