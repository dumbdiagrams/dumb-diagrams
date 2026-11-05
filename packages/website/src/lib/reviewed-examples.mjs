import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDirectory = fileURLToPath(new URL('.', import.meta.url));
const archiveRoots = [
  resolve(moduleDirectory, '../../../../examples/reviewed'),
  resolve(process.cwd(), 'examples/reviewed'),
  resolve(process.cwd(), '../../examples/reviewed'),
];

/** @typedef {{ id: string, provider: 'aws' | 'azure' | 'gcp' | 'cloud-agnostic', title: string, difficulty: 'Easy' | 'Medium', appVersion: string, reviewedOn: string, curatedId: string, svg: string, source: string, prompt: string, width: number, height: number, sha256: string, reviewNote?: string, svgName: string, sourceName: string, promptName: string, requirementsName: string, svgBytes: Buffer, sourceText: string, promptText: string, requirementsText: string }} ReviewedExample */

function locateArchive() {
  for (const archiveRoot of archiveRoots) {
    try {
      const manifestPath = join(archiveRoot, 'manifest.json');
      return { archiveRoot, manifest: JSON.parse(readFileSync(manifestPath, 'utf8')) };
    } catch {}
  }
  throw new Error('Could not locate examples/reviewed/manifest.json');
}

/** @returns {ReviewedExample[]} */
export function loadReviewedExamples() {
  const { archiveRoot, manifest } = locateArchive();
  return manifest.examples.map(record => {
    const requirements = record.source.replace(/\.dgm$/, '.requirements.json');
    return {
      ...record,
      svgName: basename(record.svg),
      sourceName: basename(record.source),
      promptName: basename(record.prompt),
      requirementsName: basename(requirements),
      svgBytes: readFileSync(resolve(archiveRoot, record.svg.replace(/^examples\/reviewed\//, ''))),
      sourceText: readFileSync(resolve(archiveRoot, record.source.replace(/^examples\/reviewed\//, '')), 'utf8'),
      promptText: readFileSync(resolve(archiveRoot, record.prompt.replace(/^examples\/reviewed\//, '')), 'utf8'),
      requirementsText: readFileSync(resolve(archiveRoot, requirements.replace(/^examples\/reviewed\//, '')), 'utf8'),
    };
  });
}

