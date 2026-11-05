import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Build-time only. Studio imports these same files in editor/src/examples.ts.
const run = 'sonnet-5-5-low-2026-11-05';
export const exampleIds = [
  'aws-medium-image-thumbnail-pipeline',
  'aws-medium-factory-iot-telemetry',
  'aws-easy-static-website-delivery',
];
const descriptions = {
  'aws-medium-image-thumbnail-pipeline': 'An upload API that stores originals, queues thumbnail jobs for a processor, and serves both images through a CDN.',
  'aws-medium-factory-iot-telemetry': 'Factory sensors stream readings through IoT Core and Kinesis to a Lambda that stores time series in Timestream and raises SNS alerts.',
  'aws-easy-static-website-delivery': 'A visitor resolves the site through DNS and loads it from a CDN backed by the bucket that stores the website files.',
};

/** The checked-in approved runs, wherever the build is started from. */
export function approvedRoot() {
  const root = [
    resolve(fileURLToPath(new URL('../../../../examples/approved', import.meta.url))),
    resolve('examples/approved'),
    resolve('../../examples/approved'),
  ].find(existsSync);
  if (!root) throw new Error('Could not locate the examples/approved directory');
  return root;
}

export function loadExamples() {
  const runRoot = join(approvedRoot(), run);
  return exampleIds.map(id => {
    const directory = join(runRoot, id);
    const source = readFileSync(join(directory, 'diagram.dgm'), 'utf8');
    const prompt = readFileSync(join(directory, 'user-prompt.md'), 'utf8');
    const interpretation = readFileSync(join(directory, 'architecture-brief.md'), 'utf8');
    const requirements = readFileSync(join(directory, 'requirements.json'), 'utf8');
    const title = source.match(/^\s*title "([^"]+)"/m)?.[1];
    if (!title) throw new Error(`Missing example title: ${id}`);
    return { id, title, description: descriptions[id], source, prompt, interpretation, requirements };
  });
}
