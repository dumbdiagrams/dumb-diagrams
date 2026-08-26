import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { url } from '../lib/site';
export const GET: APIRoute = async ({ site }) => {
  const docs = (await getCollection('docs')).sort((a,b) => a.data.order - b.data.order);
  return new Response('# Dumb Diagrams\n\nArchitecture diagrams for coding agents to start and people to refine. Requires Node.js 24+. AWS-first, local, desktop-focused.\n\n## Documentation\n\n' + docs.map(doc => {
    const path = url(`docs/${doc.id === 'index' ? '' : `${doc.id}/`}`);
    return `- [${doc.data.title}](${site ? new URL(path, site) : path}): ${doc.data.description}`;
  }).join('\n') + '\n\n## Start\n\nnpm create dumb-diagrams@latest\n\nRead DUMB_DIAGRAMS.md and the closest example before authoring. Use exact catalog types. Preserve saved views. Validate diagrams before finishing.\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
