type Explainer = HTMLElement & { dataset: { explainer?: string; active?: string } };
type MotionState = {
  panel: HTMLElement;
  revision: number;
  fades: Animation[];
  routeFrame?: number;
  routeColor?: Animation;
};

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const states = new Map<Explainer, MotionState>();
const contents = (panel: HTMLElement) => [...panel.querySelectorAll<HTMLElement | SVGElement>("[data-motion-content]")];
const routePath = (panel: HTMLElement) => panel.querySelector<SVGPathElement>(".candidate-path");
const routeGeometry = (lane: number) => `M80 90L80 ${lane}L400 ${lane}L400 90`;

function interrupt(state: MotionState) {
  // Preserve the visible opacity so a quick second selection never flashes.
  for (const animation of state.fades) {
    const target = (animation.effect as KeyframeEffect).target as HTMLElement | SVGElement;
    target.style.opacity = getComputedStyle(target).opacity;
  }
  for (const animation of state.fades) animation.cancel();
  state.fades = [];
  if (state.routeFrame !== undefined) cancelAnimationFrame(state.routeFrame);
  state.routeFrame = undefined;
  state.routeColor?.cancel();
  state.routeColor = undefined;
}

function resetContents(state: MotionState, panel: HTMLElement) {
  for (const animation of state.fades) animation.cancel();
  state.fades = [];
  for (const element of contents(panel)) element.style.removeProperty("opacity");
}

function show(root: Explainer, panel: HTMLElement) {
  for (const item of root.querySelectorAll<HTMLElement>("[data-explainer-panel]")) {
    const selected = item === panel;
    item.hidden = !selected;
    item.inert = !selected;
    item.setAttribute("aria-hidden", String(!selected));
  }
}

async function fade(state: MotionState, panel: HTMLElement, opacity: number, duration: number) {
  state.fades = contents(panel).map((element) =>
    element.animate([{ opacity: getComputedStyle(element).opacity }, { opacity }], {
      duration,
      easing: opacity === 0 ? "cubic-bezier(.4,0,1,1)" : "cubic-bezier(.16,1,.3,1)",
      fill: "both",
    }),
  );
  await Promise.all(state.fades.map((animation) => animation.finished));
}

function morphRoute(state: MotionState, panel: HTMLElement, from: { lane: number; color: string } | undefined) {
  const path = routePath(panel);
  if (!path || !from) return;
  const lane = Number(path.dataset.routeLane);
  const color = getComputedStyle(path).stroke;
  const started = performance.now();
  path.setAttribute("d", routeGeometry(from.lane));
  state.routeColor = path.animate([{ stroke: from.color }, { stroke: color }], { duration: 320, easing: "ease-out" });
  const frame = (now: number) => {
    const progress = Math.min(1, (now - started) / 420);
    const eased = 1 - (1 - progress) ** 3;
    path.setAttribute("d", routeGeometry(from.lane + (lane - from.lane) * eased));
    state.routeFrame = progress < 1 ? requestAnimationFrame(frame) : undefined;
  };
  state.routeFrame = requestAnimationFrame(frame);
}

async function transition(root: Explainer, state: MotionState, next: HTMLElement, revision: number) {
  try {
    if (state.panel !== next) {
      const previous = state.panel;
      previous.inert = true;
      previous.setAttribute("aria-hidden", "true");
      await fade(state, previous, 0, 110);
      if (state.revision !== revision) return;

      const path = routePath(previous);
      const from = path
        ? {
            lane: Number(path.getAttribute("d")?.match(/-?\d+(?:\.\d+)?/g)?.[3]),
            color: getComputedStyle(path).stroke,
          }
        : undefined;
      // Swap only after the old labels disappear. The shared frames stay still.
      show(root, next);
      resetContents(state, previous);
      if (path) path.setAttribute("d", routeGeometry(Number(path.dataset.routeLane)));
      for (const element of contents(next)) element.style.opacity = "0";
      state.panel = next;
      morphRoute(state, next, from);
    } else {
      show(root, next);
      const path = routePath(next);
      if (path) {
        morphRoute(state, next, {
          lane: Number(path.getAttribute("d")?.match(/-?\d+(?:\.\d+)?/g)?.[3]),
          color: getComputedStyle(path).stroke,
        });
      }
    }

    await fade(state, next, 1, 260);
    if (state.revision === revision) resetContents(state, next);
  } catch (error) {
    // A newer selection continues from the current opacity in interrupt().
    if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
  }
}

function activate(root: Explainer, id: string, focus = false, animate = false) {
  const state = states.get(root);
  const next = [...root.querySelectorAll<HTMLElement>("[data-explainer-panel]")].find(
    (panel) => panel.dataset.explainerPanel === id,
  );
  if (!state || !next) return;
  const unchanged = root.dataset.active === id;
  for (const control of root.querySelectorAll<HTMLButtonElement>("[data-explainer-control]")) {
    const selected = control.dataset.explainerControl === id;
    control.setAttribute("aria-selected", String(selected));
    control.tabIndex = selected ? 0 : -1;
    if (selected && focus) control.focus();
  }
  if (unchanged && animate) return;
  root.dataset.active = id;
  const revision = ++state.revision;
  interrupt(state);
  if (!animate || reducedMotion.matches) {
    show(root, next);
    for (const panel of root.querySelectorAll<HTMLElement>("[data-explainer-panel]")) {
      for (const element of contents(panel)) element.style.removeProperty("opacity");
      const path = routePath(panel);
      if (path) path.setAttribute("d", routeGeometry(Number(path.dataset.routeLane)));
    }
    state.panel = next;
    if (reducedMotion.matches) {
      // WebKit can retain visibility transitions created before the media rule settles.
      for (const animation of root.getAnimations({ subtree: true })) animation.cancel();
    }
    return;
  }
  void transition(root, state, next, revision);
}

for (const root of document.querySelectorAll<Explainer>("[data-explainer]")) {
  const controls = [...root.querySelectorAll<HTMLButtonElement>("[data-explainer-control]")];
  const initial = root.dataset.active || controls[0]?.dataset.explainerControl;
  const panel = [...root.querySelectorAll<HTMLElement>("[data-explainer-panel]")].find(
    (item) => item.dataset.explainerPanel === initial,
  );
  if (!initial || !panel) continue;
  states.set(root, { panel, revision: 0, fades: [] });
  root.dataset.enhanced = "true";
  activate(root, initial);
  controls.forEach((control, index) => {
    control.addEventListener("click", () => activate(root, control.dataset.explainerControl || "", false, true));
    control.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? controls.length - 1
            : (index + delta + controls.length) % controls.length;
      const id = controls[next]?.dataset.explainerControl;
      if (id) activate(root, id, true, true);
    });
  });
}

reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches) {
    for (const root of states.keys()) activate(root, root.dataset.active || "");
  }
});
