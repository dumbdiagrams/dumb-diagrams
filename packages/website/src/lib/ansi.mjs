// The CLI emits only SGR color/style sequences. Escape all text before adding
// our own spans: terminal output is never treated as trusted HTML.
export function ansiToHtml(input) {
  let color = '';
  let bold = false;
  let dim = false;
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const render = text => {
    if (!text) return '';
    const styles = [color && `color:${color}`, bold && 'font-weight:700', dim && 'opacity:.72'].filter(Boolean).join(';');
    return styles ? `<span style="${styles}">${escape(text)}</span>` : escape(text);
  };
  let html = '';
  let offset = 0;
  for (const match of input.matchAll(/\x1b\[([\d;]*)m/g)) {
    html += render(input.slice(offset, match.index));
    const codes = match[1].split(';').map(Number);
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      if (code === 0) { color = ''; bold = false; dim = false; }
      else if (code === 1) bold = true;
      else if (code === 2) dim = true;
      else if (code === 22) { bold = false; dim = false; }
      else if (code === 39) color = '';
      else if (code === 38 && codes[i + 1] === 2 && codes.slice(i + 2, i + 5).length === 3) {
        const rgb = codes.slice(i + 2, i + 5).map(channel => Math.max(0, Math.min(255, channel)));
        color = `rgb(${rgb.join(',')})`;
        i += 4;
      }
    }
    offset = match.index + match[0].length;
  }
  return html + render(input.slice(offset));
}
