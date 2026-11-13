const journeys = document.querySelectorAll<HTMLElement>("[data-hero-journey]");

journeys.forEach((journey) => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const tabs = [...journey.querySelectorAll<HTMLButtonElement>("[data-stage-tab]")];
  const panels = [...journey.querySelectorAll<HTMLElement>("[data-stage-panel]")];
  const next = journey.querySelector<HTMLButtonElement>("[data-next-step]");
  const nextStepNumber = journey.querySelector<HTMLElement>("[data-next-step-number]");
  const nextLabel = journey.querySelector<HTMLElement>("[data-next-label]");
  const status = journey.querySelector<HTMLElement>("[data-journey-status]");
  const terminal = journey.querySelector<HTMLElement>("[data-terminal]");
  const prompt = journey.querySelector<HTMLElement>("[data-editor-prompt]");
  if (!next || !nextStepNumber || !nextLabel || !status || !terminal || !prompt) return;
  const nextButton = next;
  const nextStepNumberElement = nextStepNumber;
  const nextLabelElement = nextLabel;
  const statusElement = status;
  const promptElement = prompt;

  const fullPrompt = promptElement.textContent?.replace(/\s*$/, "") || "";
  let current = 0;
  let promptDone = reduced.matches;
  let typingFrame = 0;
  let promptStarted = false;

  const messages = [
    "Create a project, then open it with your coding agent to draft a .dgm file.",
    "Describe your architecture in your favorite code editor with an integrated LLM.",
    "Open the file in Studio and use its layout, routing, styling, and source tools to adjust the result.",
  ];

  function updateControls() {
    tabs.forEach((tab, index) => {
      const active = index === current;
      tab.setAttribute("aria-selected", String(active));
      tab.id = `journey-stage-tab-${index}`;
    });
    panels.forEach((panel, index) => {
      const active = index === current;
      panel.dataset.active = active ? "" : undefined;
      panel.setAttribute("aria-hidden", String(!active));
      if (active) panel.setAttribute("data-entering", "");
      else panel.removeAttribute("data-entering");
    });
    if (current === 0) {
      nextStepNumberElement.textContent = "NEXT · 02";
      nextLabelElement.textContent = "Open project with agent";
      statusElement.textContent = messages[0];
    } else if (current === 1) {
      nextStepNumberElement.textContent = "NEXT · 03";
      nextLabelElement.textContent = "Open the file in Studio";
      statusElement.textContent = messages[1];
    } else {
      nextStepNumberElement.textContent = "REPLAY · 01";
      nextLabelElement.textContent = "Replay journey";
      statusElement.textContent = messages[2];
    }
  }

  function finishPrompt() {
    if (promptDone) return;
    promptDone = true;
    promptElement.textContent = fullPrompt;
    promptElement.scrollTop = promptElement.scrollHeight;
    updateControls();
    journey.dispatchEvent(new CustomEvent("hero-journey:prompt-complete", { bubbles: true }));
  }

  function typePrompt() {
    if (promptStarted || promptDone) return;
    promptStarted = true;
    if (reduced.matches) {
      finishPrompt();
      return;
    }
    const started = performance.now();
    const duration = Math.min(4200, Math.max(2000, fullPrompt.length * 1.45));
    const frame = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      promptElement.textContent = fullPrompt.slice(0, Math.floor(fullPrompt.length * progress));
      promptElement.scrollTop = promptElement.scrollHeight;
      if (progress >= 1) finishPrompt();
      else typingFrame = requestAnimationFrame(frame);
    };
    typingFrame = requestAnimationFrame(frame);
  }

  function setStage(stage: number) {
    const target = Math.max(0, Math.min(2, stage));
    current = target;
    if (current === 1) typePrompt();
    updateControls();
  }

  journey.classList.add("is-enhanced");
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => setStage(index));
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const position = tabs.indexOf(tab);
      const target =
        event.key === "Home"
          ? tabs[0]
          : event.key === "End"
            ? tabs.at(-1)
            : event.key === "ArrowRight"
              ? tabs[(position + 1) % tabs.length]
              : tabs[(position - 1 + tabs.length) % tabs.length];
      target?.focus();
      target?.click();
    });
  });
  nextButton.addEventListener("click", () => {
    if (current < 2) setStage(current + 1);
    else {
      cancelAnimationFrame(typingFrame);
      promptStarted = false;
      promptDone = reduced.matches;
      promptElement.textContent = fullPrompt;
      setStage(0);
    }
  });
  reduced.addEventListener("change", () => {
    if (reduced.matches) {
      cancelAnimationFrame(typingFrame);
      finishPrompt();
      updateControls();
    }
  });

  updateControls();
});
