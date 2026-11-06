/**
 * Return the preview view box that wraps authored diagram content and routes.
 * This mirrors the homepage preview preparation while keeping source exports intact.
 */
export function cropSvgToLayout(svg, layout) {
  const rects = [
    ...layout.nodes.map(node => node.obstacle),
    ...layout.groups.map(group => group.bounds),
    ...layout.edges.flatMap(edge => [
      ...edge.points.map(point => ({ ...point, w: 0, h: 0 })),
      ...(edge.badge ? [{ x: edge.badge.x - 12, y: edge.badge.y - 12, w: 24, h: 24 }] : []),
    ]),
  ];
  if (!rects.length) throw new Error('Cannot crop a diagram preview with no layout content');
  const x = Math.floor(Math.min(...rects.map(rect => rect.x)) - 24);
  const y = Math.floor(Math.min(...rects.map(rect => rect.y)) - 24);
  const width = Math.ceil(Math.max(...rects.map(rect => rect.x + rect.w)) - x + 24);
  const height = Math.ceil(Math.max(...rects.map(rect => rect.y + rect.h)) - y + 24);
  const preview = svg.replace(/<svg\b[^>]*>/, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">`);
  return { svg: preview, width, height, x, y };
}
