const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

document.querySelectorAll<HTMLDetailsElement>('.faq-list details').forEach(details => {
  const summary = details.querySelector('summary')!;
  const answer = details.querySelector('p')!;
  let expanded = details.open;
  let unfolding: Animation | undefined;
  let fading: Animation | undefined;

  function cancel() {
    if (unfolding) {
      unfolding.onfinish = null;
      unfolding.cancel();
    }
    fading?.cancel();
    unfolding = fading = undefined;
  }

  function finish() {
    details.open = expanded;
    cancel();
    details.style.removeProperty('height');
    details.style.removeProperty('overflow');
    delete details.dataset.faqExpanded;
  }

  summary.addEventListener('click', event => {
    // Leave the native disclosure behavior intact without animation support.
    if (typeof details.animate !== 'function') return;
    event.preventDefault();
    expanded = unfolding ? !expanded : !details.open;
    if (reduced.matches) {
      finish();
      return;
    }

    // Capture the current frame so repeated clicks reverse without jumping.
    const height = details.getBoundingClientRect().height;
    const opacity = details.open ? getComputedStyle(answer).opacity : '0';
    cancel();
    details.style.removeProperty('height');
    details.open = true;
    details.dataset.faqExpanded = String(expanded);
    const border = details.offsetHeight - details.clientHeight;
    const target = expanded ? details.getBoundingClientRect().height : summary.getBoundingClientRect().height + border;
    details.style.height = `${height}px`;
    details.style.overflow = 'hidden';
    const timing = { duration: expanded ? 380 : 280, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'both' as const };
    unfolding = details.animate({ height: [`${height}px`, `${target}px`] }, timing);
    fading = answer.animate({ opacity: [opacity, expanded ? '1' : '0'] }, timing);
    unfolding.onfinish = finish;
  });

  summary.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!event.repeat) summary.click();
  });

  reduced.addEventListener('change', () => {
    if (reduced.matches && unfolding) finish();
  });
});

const terminal = document.querySelector<HTMLElement>('[data-terminal]');
if (terminal) {
  const terminalElement = terminal;
  const command = terminal.querySelector<HTMLElement>('[data-terminal-command]')!;
  const fullCommand = command.textContent || '';
  const rows = [...terminal.querySelectorAll<HTMLElement>('[data-terminal-row]')];
  const viewport = terminal.querySelector<HTMLElement>('[data-terminal-viewport]')!;
  const pause = terminal.querySelector<HTMLButtonElement>('[data-terminal-pause]')!;
  const replay = terminal.querySelector<HTMLButtonElement>('[data-terminal-replay]')!;
  const controls = terminal.querySelector<HTMLElement>('.terminal-controls')!;
  const duration = Math.max(...rows.map(row => Number(row.dataset.at))) + 250;
  let frame = 0;
  let elapsed = 0;
  let previousTime: number | null = null;
  let running = false;
  let userPaused = false;
  let inView = !('IntersectionObserver' in window);

  function stopFrame() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = null;
  }
  function finish(showBeginning = false, announce = false) {
    stopFrame();
    running = false;
    command.textContent = fullCommand;
    rows.forEach(row => { row.hidden = false; });
    terminalElement.dataset.terminalComplete = 'true';
    pause.style.visibility = 'hidden';
    viewport.scrollTop = showBeginning ? 0 : viewport.scrollHeight;
    if (announce) terminalElement.dispatchEvent(new CustomEvent('terminal:complete', { bubbles: true }));
  }
  function tick(time: number) {
    if (!running || userPaused || document.hidden) return;
    if (previousTime !== null) elapsed += time - previousTime;
    previousTime = time;
    const nextCommand = fullCommand.slice(0, Math.floor(Math.min(1, elapsed / 1100) * fullCommand.length));
    if (command.textContent !== nextCommand) command.textContent = nextCommand;
    let revealed = false;
    rows.forEach(row => {
      if (row.hidden && elapsed >= Number(row.dataset.at)) {
        row.hidden = false;
        revealed = true;
      }
    });
    if (revealed) viewport.scrollTop = viewport.scrollHeight;
    if (elapsed >= duration) finish(false, true);
    else frame = requestAnimationFrame(tick);
  }
  function syncPlayback() {
    stopFrame();
    pause.textContent = userPaused ? 'Resume' : 'Pause';
    pause.setAttribute('aria-label', `${userPaused ? 'Resume' : 'Pause'} terminal animation`);
    if (running && !userPaused && !document.hidden && inView) frame = requestAnimationFrame(tick);
  }
  function play() {
    finish(true);
    delete terminalElement.dataset.terminalComplete;
    if (reduced.matches) return;
    elapsed = 0;
    running = true;
    userPaused = false;
    command.textContent = '';
    rows.forEach(row => { row.hidden = true; });
    pause.style.removeProperty('visibility');
    syncPlayback();
  }
  function preferenceChanged() {
    controls.hidden = reduced.matches;
    if (reduced.matches) finish(true, true);
    else play();
  }
  function pauseForReading() {
    if (running) { userPaused = true; syncPlayback(); }
  }
  pause.addEventListener('click', () => { userPaused = !userPaused; syncPlayback(); });
  replay.addEventListener('click', play);
  viewport.addEventListener('wheel', pauseForReading, { passive: true });
  viewport.addEventListener('touchstart', pauseForReading, { passive: true });
  viewport.addEventListener('keydown', event => {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) pauseForReading();
  });
  document.addEventListener('visibilitychange', syncPlayback);
  reduced.addEventListener('change', preferenceChanged);
  preferenceChanged();
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      syncPlayback();
    }, { threshold: .2 }).observe(terminal);
  }
}

// Content is visible without JS. Entrances and border accents run once in view;
// hover/focus can replay a border sweep, but nothing loops while the page idles.
const entrances = new Set<Animation>();
if ('IntersectionObserver' in window) {
  const duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-reveal')) || 700;
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      if (reduced.matches || typeof (entry.target as HTMLElement).animate !== 'function') return;
      const animation = (entry.target as HTMLElement).animate(
        { opacity: [.8, 1], transform: ['translateY(8px)', 'translateY(0px)'] },
        { duration, easing: 'cubic-bezier(.22, 1, .36, 1)', delay: Number((entry.target as HTMLElement).dataset.revealDelay || 0) });
      entrances.add(animation);
      animation.onfinish = () => entrances.delete(animation);
    });
  }, { threshold: .12 });
  document.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element));
  const borders = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      borders.unobserve(entry.target);
      if (!reduced.matches) entry.target.setAttribute('data-tracing', '');
    });
  }, { threshold: .65 });
  document.querySelectorAll<HTMLElement>('[data-trace]').forEach(element => {
    borders.observe(element);
    element.addEventListener('animationend', event => {
      if (event.animationName === 'border-trace') element.removeAttribute('data-tracing');
    });
  });
  reduced.addEventListener('change', () => {
    if (reduced.matches) {
      entrances.forEach(animation => animation.finish());
      document.querySelectorAll('[data-tracing]').forEach(element => element.removeAttribute('data-tracing'));
    }
  });
}
