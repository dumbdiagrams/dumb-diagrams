import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { url } from '../lib/site';
export const GET: APIRoute = async ({ site }) => {
  const docs = (await getCollection('docs')).sort((a,b) => a.data.order - b.data.order);
  return new Response('# Dumb Diagrams\n\nLLM-first architecture diagrams as code. Draft readable .dgm files with a coding agent, validate with the CLI, refine locally in Studio, and version in Git. Deterministic layout and SVG export; no hosted model or built-in AI service. Requires Node.js 24+. AWS-first, local, desktop-focused.\n\n## Documentation\n\n' + docs.map(doc => {
    const path = url(`docs/${doc.id === 'index' ? '' : `${doc.id}/`}`);
    return `- [${doc.data.title}](${site ? new URL(path, site) : path}): ${doc.data.description}`;
  }).join('\n') + '\n\n## Start\n\nnpm create dumb-diagrams@latest\n\nRead DUMB_DIAGRAMS.md and the closest example before authoring. Use exact catalog types. Preserve saved views. Validate diagrams before finishing.\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
