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
  const terminalElement = terminal;
  const promptElement = prompt;

  const fullPrompt = promptElement.textContent?.replace(/\s*$/, "") || "";
  const terminalDone = terminalElement.dataset.terminalComplete === "true";
  let current = 0;
  let unlocked = reduced.matches ? 2 : terminalDone ? 1 : 0;
  let promptDone = reduced.matches;
  let typingFrame = 0;
  let promptStarted = false;

  const messages = [
    "The project is ready. Open it with your coding agent to draft a .dgm file.",
    "Describe your architecture in your favorite code editor with an integrated LLM.",
    "Open the file in Studio and use its layout, routing, styling, and source tools to adjust the result.",
  ];

  function updateControls() {
    tabs.forEach((tab, index) => {
      const active = index === current;
      tab.disabled = index > unlocked;
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
      nextButton.disabled = unlocked < 1;
      nextStepNumberElement.textContent = unlocked < 1 ? "STEP 01" : "NEXT · 02";
      nextLabelElement.textContent = unlocked < 1 ? "Creating project…" : "Open project with agent";
      statusElement.textContent =
        unlocked < 1 ? "Running the CLI… the next step unlocks when the project is ready." : messages[0];
    } else if (current === 1) {
      nextButton.disabled = !promptDone;
      nextStepNumberElement.textContent = "NEXT · 03";
      nextLabelElement.textContent = promptDone ? "Open the file in Studio" : "Agent is drafting…";
      statusElement.textContent = messages[1];
    } else {
      nextButton.disabled = false;
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
    unlocked = Math.max(unlocked, 2);
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
    if (target > unlocked) return;
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
      const available = tabs.filter((_, stage) => stage <= unlocked);
      const position = available.indexOf(tab);
      const target =
        event.key === "Home"
          ? available[0]
          : event.key === "End"
            ? available.at(-1)
            : event.key === "ArrowRight"
              ? available[(position + 1) % available.length]
              : available[(position - 1 + available.length) % available.length];
      target?.focus();
      target?.click();
    });
  });
  nextButton.addEventListener("click", () => {
    if (current < 2) setStage(current + 1);
    else {
      promptStarted = false;
      promptDone = false;
      unlocked = reduced.matches ? 2 : 1;
      promptElement.textContent = fullPrompt;
      setStage(0);
    }
  });
  journey.addEventListener("terminal:complete", () => {
    unlocked = Math.max(unlocked, 1);
    updateControls();
  });
  reduced.addEventListener("change", () => {
    if (reduced.matches) {
      cancelAnimationFrame(typingFrame);
      unlocked = 2;
      finishPrompt();
      updateControls();
    }
  });

  if (terminalElement.dataset.terminalComplete === "true") unlocked = Math.max(unlocked, 1);
  updateControls();
});
