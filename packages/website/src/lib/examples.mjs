import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Build-time only. Studio imports these same files in editor/src/examples.ts.
export const exampleIds = [
  'image-thumbnail-pipeline',
  'aws-data-transfer-hub',
  'bedrock-claims-processing',
];
const descriptions = {
  'image-thumbnail-pipeline': 'A direct-upload image flow that uses an S3 event to invoke Lambda and persist thumbnails and metadata.',
  'aws-data-transfer-hub': 'A compact cross-account deployment flow for UI hosting, authentication, workflow automation, replication templates, and Fargate workloads.',
  'bedrock-claims-processing': 'A claims workflow that combines S3 document intake, Bedrock Data Automation, SageMaker fraud detection, DynamoDB state, Nova insights, and email notification.',
};
export function loadExamples() {
  const curatedRoot = [
    resolve('examples/curated'),
    resolve('../../examples/curated'),
  ].find(existsSync);
  if (!curatedRoot) throw new Error('Could not locate the canonical examples/curated directory');
  return exampleIds.map(id => {
    const directory = join(curatedRoot, id);
    const source = readFileSync(join(directory, 'diagram.dgm'), 'utf8');
    const prompt = readFileSync(join(directory, 'user-prompt.md'), 'utf8');
    const interpretation = readFileSync(join(directory, 'architecture-brief.md'), 'utf8');
    const referenceSpec = readFileSync(join(directory, 'reference-spec.md'), 'utf8');
    const requirements = readFileSync(join(directory, 'requirements.json'), 'utf8');
    const title = source.match(/^\s*title "([^"]+)"/m)?.[1];
    if (!title) throw new Error(`Missing example title: ${id}`);
    return { id, title, description: descriptions[id], source, prompt, interpretation, referenceSpec, requirements };
  });
}
