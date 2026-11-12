import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { create as createFont } from 'fontkit';
import sax from 'sax';
import sharp from 'sharp';
import wawoff2 from 'wawoff2';

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const diagramPath = join(siteRoot, 'public/diagrams/aws-medium-factory-iot-telemetry-preview.svg');
const templatePath = join(siteRoot, 'scripts/social-card.template.svg');
const svgPath = join(siteRoot, 'public/social-card.svg');
const pngPath = join(siteRoot, 'public/social-card.png');

const brandRequire = createRequire(new URL('../../brand/package.json', import.meta.url));
const [template, diagram, brandBytes, codeBytes] = await Promise.all([
  readFile(templatePath, 'utf8'),
  readFile(diagramPath, 'utf8'),
  readFile(brandRequire.resolve('@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2')),
  readFile(brandRequire.resolve('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2')),
]);
// Decode WOFF2 before selecting variable weights: fontkit's variation API
// expects the uncompressed SFNT directory. No machine-installed fonts are used.
const brandFont = createFont(Buffer.from(await wawoff2.decompress(brandBytes)));
const codeFont = createFont(Buffer.from(await wawoff2.decompress(codeBytes)));
const weights = new Map();

function parseSvg(source) {
  const document = { children: [] };
  const stack = [document];
  const parser = sax.parser(true);
  parser.onopentag = ({ name, attributes }) => {
    const element = { name, attributes, children: [] };
    stack.at(-1).children.push(element);
    stack.push(element);
  };
  parser.onclosetag = () => stack.pop();
  parser.ontext = text => stack.at(-1).children.push(text);
  parser.oncdata = parser.ontext;
  parser.write(source).close();
  return document.children.find(node => node.name === 'svg');
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function serialize(node) {
  if (typeof node === 'string') return escapeXml(node);
  const attributes = Object.entries(node.attributes).map(([key, value]) => ` ${key}="${escapeXml(value)}"`).join('');
  return `<${node.name}${attributes}>${node.children.map(serialize).join('')}</${node.name}>`;
}

let iconIndex = 0;
function inlineIcons(node) {
  if (typeof node === 'string') return node;
  if (node.name === 'image') {
    const { href, 'xlink:href': xlinkHref, ...placement } = node.attributes;
    const uri = href || xlinkHref;
    if (!uri?.startsWith('data:image/svg+xml')) throw new Error('Social card icons must be embedded SVG');
    const comma = uri.indexOf(',');
    const source = uri.slice(0, comma).includes(';base64')
      ? Buffer.from(uri.slice(comma + 1), 'base64').toString('utf8')
      : decodeURIComponent(uri.slice(comma + 1));
    const icon = parseSvg(source);
    const prefix = `card-icon-${iconIndex++}-`;
    const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    function scope(element) {
      if (typeof element === 'string') return;
      if (element.attributes.id) element.attributes.id = prefix + element.attributes.id;
      for (const [key, value] of Object.entries(element.attributes)) {
        let scoped = value;
        for (const id of ids) {
          scoped = scoped.replaceAll(`url(#${id})`, `url(#${prefix}${id})`);
          if ((key === 'href' || key === 'xlink:href') && scoped === `#${id}`) scoped = `#${prefix}${id}`;
        }
        element.attributes[key] = scoped;
      }
      element.children.forEach(scope);
    }
    scope(icon);
    return inlineIcons({ ...icon, attributes: { ...icon.attributes, ...placement } });
  }
  node.children = node.children.map(inlineIcons);
  return node;
}

function fontFor(attributes) {
  if (attributes['font-family'] === 'IBM Plex Mono') return codeFont;
  const weight = Number(attributes['font-weight'] || 400);
  if (!weights.has(weight)) weights.set(weight, brandFont.getVariation({ wght: weight }));
  return weights.get(weight);
}

// This operates on the controlled template and engine-generated text/tspans.
// Outline only this illustration; downloadable diagrams keep runtime typography.
function outlineText(node, inherited = {}) {
  if (typeof node === 'string') return node;
  const attributes = { ...inherited, ...node.attributes };
  if (node.name !== 'text') {
    node.children = node.children.map(child => outlineText(child, attributes));
    return node;
  }
  const runs = [];
  function collect(element, style) {
    if (typeof element === 'string') {
      if (element) runs.push({ text: element, style });
      return;
    }
    element.children.forEach(child => collect(child, { ...style, ...element.attributes }));
  }
  node.children.forEach(child => collect(child, attributes));
  let advance = 0;
  const paths = [];
  for (const { text, style } of runs) {
    const font = fontFor(style);
    const size = Number(style['font-size'] || 12);
    const scale = size / font.unitsPerEm;
    const spacing = Number(style['letter-spacing'] || 0);
    const layout = font.layout(text);
    let offsetY = 0;
    for (let i = 0; i < layout.glyphs.length; i++) {
      const glyph = layout.glyphs[i];
      const position = layout.positions[i];
      const outline = glyph.path.toSVG();
      if (outline) paths.push({
        name: 'path',
        attributes: {
          d: outline,
          transform: `translate(${advance + position.xOffset * scale} ${offsetY - position.yOffset * scale}) scale(${scale} ${-scale})`,
          fill: style.fill || '#163964',
        },
        children: [],
      });
      advance += position.xAdvance * scale + spacing;
      offsetY -= position.yAdvance * scale;
    }
  }
  const anchor = attributes['text-anchor'];
  const width = advance - Number(attributes['letter-spacing'] || 0);
  const shift = anchor === 'middle' ? width / 2 : anchor === 'end' ? width : 0;
  const italic = attributes['font-style'] === 'italic' ? ' skewX(-12)' : '';
  return {
    name: 'g',
    attributes: {
      'aria-label': runs.map(run => run.text).join(''),
      transform: `translate(${Number(attributes.x || 0) - shift} ${Number(attributes.y || 0)})${italic}`,
    },
    children: paths,
  };
}

const diagramRoot = inlineIcons(parseSvg(diagram));
// Carry the renderer's white step numbers into explicit presentation attributes
// before removing its document-wide text stylesheet from the inline composition.
function prepareDiagram(node, textAnnotation = false) {
  if (typeof node === 'string') return;
  const annotation = textAnnotation || node.attributes['data-annotation-style'] === 'text';
  if (node.name === 'text') {
    node.attributes.fill = /(?:group-badge|edge-badge)-text/.test(node.attributes.class || '') ? '#FFFFFF' : (node.attributes.fill || '#163964');
    node.attributes['font-family'] = 'Manrope';
    if (annotation) node.attributes['font-size'] = '14';
  }
  node.children = node.children.filter(child => child.name !== 'style');
  node.children.forEach(child => prepareDiagram(child, annotation));
}
prepareDiagram(diagramRoot);
Object.assign(diagramRoot.attributes, { x: '58', y: '366', width: '1084', height: '220', preserveAspectRatio: 'xMidYMid meet' });
const placeholder = '__DIAGRAM_SVG__';
if (template.split(placeholder).length !== 2) throw new Error('Social card template must have one diagram placeholder');
const card = parseSvg(template.replace(placeholder, serialize(diagramRoot)));
const svg = `${serialize(outlineText(card)).replace(/[\t ]+$/gm, '')}\n`;
if (/<(?:image|text|tspan)\b/.test(svg)) throw new Error('Social card must contain only self-contained vector artwork');

await writeFile(svgPath, svg);
await sharp(Buffer.from(svg)).png().toFile(pngPath);
console.log(`Generated ${svgPath} and ${pngPath} from ${diagramPath}`);
