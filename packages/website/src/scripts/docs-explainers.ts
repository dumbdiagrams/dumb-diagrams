type Explainer = HTMLElement & { dataset: { explainer?: string; active?: string } };

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

function reveal(panel: HTMLElement) {
  if (reducedMotion.matches) return;
  panel.animate(
    [
      { opacity: 0, transform: "translateY(8px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
    { duration: 240, easing: "cubic-bezier(.2,.75,.25,1)", fill: "both" },
  );
  for (const element of panel.querySelectorAll<HTMLElement>(
    ".stage-machine, .candidate-card.winner, .quality-verdict, .route-verdict",
  )) {
    element.animate(
      [
        { opacity: 0.35, transform: "scale(.985)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      { duration: 320, delay: 70, easing: "cubic-bezier(.2,.75,.25,1)", fill: "both" },
    );
  }
  for (const cue of panel.querySelectorAll<SVGElement>(".crossing-mark, .crossing-label")) {
    cue.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 330, easing: "ease-out", fill: "both" });
  }
  for (const path of panel.querySelectorAll<SVGPathElement>(".candidate-path")) {
    const length = path.getTotalLength();
    path.animate(
      [
        { strokeDasharray: `${length}`, strokeDashoffset: `${length}` },
        { strokeDasharray: `${length}`, strokeDashoffset: "0" },
      ],
      { duration: 420, delay: 60, easing: "cubic-bezier(.3,.7,.2,1)" },
    );
  }
}

function activate(root: Explainer, id: string, focus = false, animate = false) {
  root.dataset.active = id;
  const controls = [...root.querySelectorAll<HTMLButtonElement>("[data-explainer-control]")];
  for (const control of controls) {
    const selected = control.dataset.explainerControl === id;
    control.setAttribute("aria-selected", String(selected));
    control.tabIndex = selected ? 0 : -1;
    if (selected && focus) control.focus();
  }
  for (const panel of root.querySelectorAll<HTMLElement>("[data-explainer-panel]")) {
    const selected = panel.dataset.explainerPanel === id;
    panel.hidden = !selected;
    panel.inert = !selected;
    if (selected && animate) reveal(panel);
  }
}

for (const root of document.querySelectorAll<Explainer>("[data-explainer]")) {
  root.dataset.enhanced = "true";
  const controls = [...root.querySelectorAll<HTMLButtonElement>("[data-explainer-control]")];
  const initial = root.dataset.active || controls[0]?.dataset.explainerControl;
  if (initial) activate(root, initial);
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
