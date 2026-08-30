import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { url } from '../lib/site';
export const GET: APIRoute = async ({ site }) => {
  const docs = (await getCollection('docs')).sort((a,b) => a.data.order - b.data.order);
  return new Response('# Dumb Diagrams\n\nLLM-first architecture diagrams as code. Run `dumbdiagrams init` from a parent directory to create a project folder with agent guidance, draft portable .dgm files, and run `dumbdiagrams studio` to open any local file. Deterministic layout; no hosted model or built-in AI service. Requires Node.js 24+. AWS-first, local, desktop-focused.\n\n## Documentation\n\n' + docs.map(doc => {
    const path = url(`docs/${doc.id === 'index' ? '' : `${doc.id}/`}`);
    return `- [${doc.data.title}](${site ? new URL(path, site) : path}): ${doc.data.description}`;
  }).join('\n') + '\n\n## Start\n\n```bash\nnpm install -g create-dumb-diagrams\ndumbdiagrams init\ndumbdiagrams studio\n```\n\nRead AGENTS.md, then the relevant `.dumbdiagrams/` instructions and example bundle before authoring. Use exact catalog types and preserve saved views. Use **Open** in Studio to select a `.dgm` file from anywhere on disk.\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
