const copyResets = new WeakMap<HTMLButtonElement, number>();
const copyLabels = new WeakMap<HTMLButtonElement, string>();

async function copyText(button: HTMLButtonElement, text: string) {
  const original = copyLabels.get(button) ?? button.innerHTML;
  copyLabels.set(button, original);
  window.clearTimeout(copyResets.get(button));
  const compact = button.classList.contains('copy-button');
  const status = button.closest('[data-install]')?.querySelector('[data-copy-status]');
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = compact ? '✓' : 'Copied';
    if (status) status.textContent = 'Command copied to clipboard.';
  } catch {
    button.textContent = compact ? '!' : 'Select text';
    if (status) status.textContent = 'Could not copy. Select the command to copy it manually.';
    const code = button.dataset.copyTarget ? document.getElementById(button.dataset.copyTarget) : button.closest('[data-install], pre, .source-pane')?.querySelector('code');
    if (code) {
      const range = document.createRange();
      range.selectNodeContents(code);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    }
  }
  copyResets.set(button, window.setTimeout(() => { button.innerHTML = original; }, 1800));
}

document.querySelectorAll<HTMLButtonElement>('[data-copy], [data-copy-target]').forEach(button => {
  button.addEventListener('click', () => copyText(button, button.dataset.copyTarget ? document.getElementById(button.dataset.copyTarget)?.textContent || '' : button.dataset.copy || ''));
});

document.querySelectorAll<HTMLElement>('[data-install]').forEach(install => {
  const methods = install.querySelectorAll<HTMLButtonElement>('[data-command]');
  methods.forEach(button => button.addEventListener('click', () => {
    methods.forEach(method => method.setAttribute('aria-pressed', String(method === button)));
    const code = install.querySelector('[data-command-text]');
    const copy = install.querySelector<HTMLButtonElement>('[data-copy]');
    if (code) {
      code.textContent = button.dataset.command || '';
      code.scrollLeft = 0;
    }
    if (copy) copy.dataset.copy = button.dataset.command;
  }));
});

document.querySelectorAll<HTMLElement>('[data-tabs]').forEach(tablist => {
  const tabs = [...tablist.querySelectorAll<HTMLButtonElement>(':scope > [role="tab"]')];
  function select(tab: HTMLButtonElement) {
    if (tab.getAttribute('aria-selected') === 'true') return;
    tabs.forEach(button => {
      button.setAttribute('aria-selected', String(button === tab));
      button.tabIndex = button === tab ? 0 : -1;
      const panel = document.getElementById(button.getAttribute('aria-controls') || '');
      if (panel) {
        panel.hidden = button !== tab;
        panel.inert = button !== tab;
        if (!panel.hidden) panel.querySelectorAll('[data-diagram-preview]').forEach(preview => preview.dispatchEvent(new Event('preview:visible')));
      }
    });
    // Reveal an offscreen mobile tab without scrolling the whole page.
    const listBounds = tablist.getBoundingClientRect();
    const tabBounds = tab.getBoundingClientRect();
    if (tabBounds.left < listBounds.left) tablist.scrollLeft += tabBounds.left - listBounds.left;
    else if (tabBounds.right > listBounds.right) tablist.scrollLeft += tabBounds.right - listBounds.right;
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      select(tabs[next]);
      tabs[next].focus({ preventScroll: true });
    });
  });
});

document.querySelectorAll<HTMLElement>('.prose pre').forEach(pre => {
  const code = pre.querySelector('code');
  if (!code) return;
  const button = document.createElement('button');
  button.className = 'code-copy';
  button.type = 'button';
  button.textContent = 'Copy';
  button.setAttribute('aria-label', 'Copy code block');
  button.addEventListener('click', () => copyText(button, code.textContent || ''));
  pre.append(button);
});

document.querySelectorAll<HTMLElement>('[data-diagram-preview]').forEach(preview => {
  const viewport = preview.querySelector<HTMLElement>('.diagram-viewport')!;
  const image = viewport.querySelector('img')!;
  const zoomOut = preview.querySelector<HTMLButtonElement>('[data-zoom="out"]')!;
  const zoomIn = preview.querySelector<HTMLButtonElement>('[data-zoom="in"]')!;
  const fit = preview.querySelector<HTMLButtonElement>('[data-zoom="fit"]')!;
  let zoom = 1;
  function center() {
    viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
    viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) / 2;
  }
  function update() {
    viewport.style.setProperty('--diagram-zoom', String(zoom));
    fit.textContent = `${Math.round(zoom * 100)}%`;
    zoomOut.disabled = zoom <= 1;
    zoomIn.disabled = zoom >= 2.5;
    center();
  }
  zoomOut.addEventListener('click', () => { zoom = Math.max(1, zoom - .25); update(); });
  zoomIn.addEventListener('click', () => { zoom = Math.min(2.5, zoom + .25); update(); });
  fit.addEventListener('click', () => { zoom = 1; update(); });
  image.addEventListener('load', center);
  preview.addEventListener('preview:visible', center);
  update();
});

const docsNavigation = document.querySelector<HTMLDetailsElement>('.docs-navigation');
if (docsNavigation) {
  const mobile = window.matchMedia('(max-width: 680px)');
  const syncNavigation = () => { docsNavigation.open = !mobile.matches; };
  syncNavigation();
  mobile.addEventListener('change', syncNavigation);
}
