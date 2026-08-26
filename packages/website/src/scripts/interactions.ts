async function copyText(button: HTMLButtonElement, text: string) {
  const original = button.innerHTML;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
    const status = button.closest('[data-install]')?.querySelector('[data-copy-status]');
    if (status) status.textContent = 'Command copied to clipboard.';
  } catch {
    button.textContent = 'Select text';
    const code = button.closest('[data-install], pre, .source-pane')?.querySelector('code');
    if (code) {
      const range = document.createRange();
      range.selectNodeContents(code);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    }
  }
  window.setTimeout(() => { button.innerHTML = original; }, 1800);
}

document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(button => {
  button.addEventListener('click', () => copyText(button, button.dataset.copy || ''));
});

document.querySelectorAll<HTMLElement>('[data-install]').forEach(install => {
  const methods = install.querySelectorAll<HTMLButtonElement>('[data-command]');
  methods.forEach(button => button.addEventListener('click', () => {
    methods.forEach(method => method.setAttribute('aria-pressed', String(method === button)));
    const code = install.querySelector('[data-command-text]');
    const copy = install.querySelector<HTMLButtonElement>('[data-copy]');
    if (code) code.textContent = button.dataset.command || '';
    if (copy) copy.dataset.copy = button.dataset.command;
  }));
});

document.querySelectorAll<HTMLElement>('[data-demo]').forEach(demo => {
  const tabs = [...demo.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  function select(tab: HTMLButtonElement) {
    tabs.forEach(button => {
      button.setAttribute('aria-selected', String(button === tab));
      button.tabIndex = button === tab ? 0 : -1;
      const panel = document.getElementById(button.getAttribute('aria-controls') || '');
      if (panel) panel.hidden = button !== tab;
    });
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
      tabs[next].focus();
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

document.querySelectorAll<HTMLButtonElement>('[data-source-toggle]').forEach(button => {
  button.addEventListener('click', () => {
    const source = document.getElementById(button.getAttribute('aria-controls') || '');
    const expanded = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(expanded));
    button.textContent = expanded ? 'Hide .dgm source ↑' : 'Show .dgm source ↓';
    source?.classList.toggle('is-visible', expanded);
  });
});

const docsNavigation = document.querySelector<HTMLDetailsElement>('.docs-navigation');
if (docsNavigation) {
  const mobile = window.matchMedia('(max-width: 680px)');
  const syncNavigation = () => { docsNavigation.open = !mobile.matches; };
  syncNavigation();
  mobile.addEventListener('change', syncNavigation);
}
