import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const diagramPath = join(siteRoot, 'public/diagrams/aws-medium-factory-iot-telemetry-preview.svg');
const templatePath = join(siteRoot, 'scripts/social-card.template.svg');
const svgPath = join(siteRoot, 'public/social-card.svg');
const pngPath = join(siteRoot, 'public/social-card.png');

const [template, diagram] = await Promise.all([
  readFile(templatePath, 'utf8'),
  readFile(diagramPath),
]);
const placeholder = '__DIAGRAM_DATA_URI__';
if (template.split(placeholder).length !== 2) throw new Error('Social card template must have one diagram placeholder');
const diagramData = `data:image/svg+xml;base64,${diagram.toString('base64')}`;
const svg = template.replace(placeholder, diagramData);

await writeFile(svgPath, svg);
await sharp(Buffer.from(svg)).png().toFile(pngPath);
console.log(`Generated ${svgPath} and ${pngPath} from ${diagramPath}`);
