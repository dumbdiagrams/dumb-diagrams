import { readFileSync } from 'node:fs';

// Build-time only. Studio imports these same files in editor/src/examples.ts.
export const exampleIds = [
  'image-thumbnail-pipeline',
  'aws-data-transfer-hub',
  'bedrock-claims-processing',
  'azure-private-app-service',
];
export function loadExamples() {
  return exampleIds.map(id => {
    const source = readFileSync(new URL(`../../../../examples/diagrams/${id}.dgm`, import.meta.url), 'utf8');
    const prompt = readFileSync(new URL(`../../../../examples/prompts/${id}.md`, import.meta.url), 'utf8');
    const title = source.match(/^\s*title "([^"]+)"/m)?.[1];
    if (!title) throw new Error(`Missing example title: ${id}`);
    return { id, title, source, prompt };
  });
}
