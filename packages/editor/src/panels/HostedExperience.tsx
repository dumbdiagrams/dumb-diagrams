import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { CreditsNotice } from "./CreditsNotice";
import { Modal } from "../ui/Modal";
import {
  BrowserCompatibilityMessage,
  BrowserCompatibilityNotice,
  dismissBrowserCompatibilityNotice,
  isCurrentBrowserStrictGoogleChrome,
} from "./BrowserCompatibilityNotice";

type PreferenceState = {
  welcomeDismissed: boolean;
  tourDismissed: boolean;
};

const PREFERENCES_KEY = "dumb-diagrams:hosted-preferences:v1";
const REPOSITORY_URL = "https://github.com/dumbdiagrams/dumb-diagrams";
const DOCS_URL = "https://dumbdiagrams.com/docs/quick-start/";
const DOCS_HOME_URL = "https://dumbdiagrams.com/docs/";

const TOUR_STEPS = [
  {
    selector: '[aria-label="File"]',
    title: "Open a diagram",
    body: "Use File → Open .dgm to choose a local diagram file.",
  },
  {
    selector: ".studio-tabbar-actions .top-menu-trigger",
    title: "Find examples",
    body: "Help → Browse examples opens bundled starting points.",
  },
  {
    selector: ".tool-dock",
    title: "Explore the tools",
    body: "Select moves items. Boundaries groups related resources. Resources adds icons. Text and Add note add context. Layers helps you find and organise items. Source opens the .dgm text.",
  },
  {
    selector: ".canvas-pane",
    title: "Refine the canvas",
    body: "Move items on the canvas and use the Inspector for precise edits.",
  },
  {
    selector: '[aria-label="More export formats"], .topbar-group',
    title: "Save and export",
    body: "Save your .dgm file or export an image when you are ready.",
  },
] as const;

function readPreferences(): PreferenceState {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || "null") as Partial<PreferenceState> | null;
    return { welcomeDismissed: value?.welcomeDismissed === true, tourDismissed: value?.tourDismissed === true };
  } catch {
    return { welcomeDismissed: false, tourDismissed: false };
  }
}

function writePreferences(value: PreferenceState): void {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(value));
  } catch {
    // Private browsing and disabled storage must not prevent Studio from opening.
  }
}

export function HostedPrivacyTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="hosted-privacy-trigger" onClick={onOpen} title="Privacy and local-only commitment">
      Local-only
    </button>
  );
}

export function HostedExperience({
  workspaceReady,
  welcomeOpen,
  onWelcomeOpenChange,
  privacyOpen,
  onPrivacyOpenChange,
  settingsOpen,
  onSettingsOpenChange,
}: {
  workspaceReady: boolean;
  welcomeOpen: boolean;
  onWelcomeOpenChange: (open: boolean) => void;
  privacyOpen: boolean;
  onPrivacyOpenChange: (open: boolean) => void;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
}) {
  const [preferences, setPreferences] = useState<PreferenceState>(() => readPreferences());
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [welcomeDontShow, setWelcomeDontShow] = useState(false);
  const [tourDontShow, setTourDontShow] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<{ left: number; top: number; width: number }>();
  const [welcomeResolved, setWelcomeResolved] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const welcomePromptedRef = useRef(false);
  const tourContainerRef = useRef<HTMLDivElement>(null);
  const previousTourFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!workspaceReady) return;
    if (!preferences.welcomeDismissed && !welcomePromptedRef.current) {
      welcomePromptedRef.current = true;
      onWelcomeOpenChange(true);
    }
    setWelcomeResolved(true);
  }, [workspaceReady, preferences.welcomeDismissed, onWelcomeOpenChange]);

  const updatePreferences = (next: Partial<PreferenceState>) => {
    setPreferences((current) => {
      const value = { ...current, ...next };
      writePreferences(value);
      return value;
    });
  };

  const startTour = () => {
    if (!isCurrentBrowserStrictGoogleChrome()) dismissBrowserCompatibilityNotice();
    if (welcomeDontShow) updatePreferences({ welcomeDismissed: true });
    previousTourFocusRef.current = document.activeElement as HTMLElement | null;
    onWelcomeOpenChange(false);
    onSettingsOpenChange(false);
    setTourStep(0);
  };

  const finishTour = () => {
    if (tourDontShow) updatePreferences({ tourDismissed: true });
    setTourStep(null);
  };

  // Measure the new step before paint so its text and position change together.
  useLayoutEffect(() => {
    if (tourStep === null) return;
    const update = () => {
      const element = document.querySelector<HTMLElement>(TOUR_STEPS[tourStep].selector);
      const rect = element?.getBoundingClientRect() ?? null;
      setTargetRect(rect);
      const width = Math.min(360, window.innerWidth - 32);
      const height = tooltipRef.current?.getBoundingClientRect().height ?? 0;
      const maxTop = Math.max(16, window.innerHeight - height - 16);
      const below = rect ? rect.bottom + 14 : (window.innerHeight - height) / 2;
      const preferredTop = rect && below > maxTop ? rect.top - height - 14 : below;
      setTooltipStyle({
        width,
        left: Math.max(16, Math.min(rect?.left ?? (window.innerWidth - width) / 2, window.innerWidth - width - 16)),
        top: Math.max(16, Math.min(preferredTop, maxTop)),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [tourStep]);

  useEffect(() => {
    if (tourStep !== null) {
      const focusTimer = window.setTimeout(() => {
        const first = tourContainerRef.current?.querySelector<HTMLElement>("button, input");
        first?.focus();
      }, 0);
      return () => window.clearTimeout(focusTimer);
    }
    previousTourFocusRef.current?.focus();
    previousTourFocusRef.current = null;
  }, [tourStep]);

  const currentTour = tourStep === null ? null : TOUR_STEPS[tourStep];

  const closeWelcome = () => {
    if (!isCurrentBrowserStrictGoogleChrome()) dismissBrowserCompatibilityNotice();
    if (welcomeDontShow) updatePreferences({ welcomeDismissed: true });
    onWelcomeOpenChange(false);
  };

  return (
    <>
      <Modal
        open={welcomeOpen}
        title="Studio runs locally"
        subtitle="A browser editor for your local diagrams."
        onClose={closeWelcome}
        className="hosted-welcome-modal"
        width={620}
      >
        <div className="hosted-privacy-copy">
          <p className="hosted-privacy-lead">Your diagrams stay on your device.</p>
          <p>
            Studio opens, edits, renders, and saves diagrams in your browser or files you choose. We never upload,
            collect, store, or process your diagram contents on our servers. Studio has no analytics or diagram
            telemetry.
          </p>
          <p>Workspace recovery uses local browser storage. Saving and exporting create files on your device.</p>
          <p>
            Hosting requests deliver the application and bundled icons and expose ordinary request metadata and
            requested icon paths. They do not include your diagram source or imported file contents. Clearing browser
            storage can remove browser-saved work, so keep important diagrams in local <code>.dgm</code> files.
          </p>
          <p className="hosted-setup-note">
            For a project and agent workflow, install the CLI and run <code>dgm init</code>. You can still browse
            examples and open a local file here without setup.
          </p>
          {!isCurrentBrowserStrictGoogleChrome() && (
            <div className="hosted-setup-note browser-compatibility-inline" role="note">
              <strong>Google Chrome is recommended.</strong>
              <BrowserCompatibilityMessage />
            </div>
          )}
          <p className="hosted-links">
            <a href={DOCS_URL} target="_blank" rel="noreferrer">
              Read the setup guide
            </a>
            <span aria-hidden="true"> · </span>
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
              View the source code
            </a>
          </p>
          <label className="hosted-check">
            <input
              type="checkbox"
              checked={welcomeDontShow}
              onChange={(event) => setWelcomeDontShow(event.target.checked)}
            />{" "}
            Don’t show this welcome again
          </label>
          <div className="modal-actions modal-actions-spread">
            {!preferences.tourDismissed && (
              <button type="button" className="text-button" onClick={startTour}>
                Start quick tour
              </button>
            )}
            <button type="button" className="primary-button" onClick={closeWelcome}>
              Continue to Studio
            </button>
          </div>
        </div>
      </Modal>

      {welcomeResolved && !welcomeOpen && <BrowserCompatibilityNotice />}

      <Modal
        open={privacyOpen}
        title="Local-only Studio"
        subtitle="Your diagrams stay in your browser and files you choose."
        onClose={() => onPrivacyOpenChange(false)}
        width={620}
      >
        <div className="hosted-privacy-copy">
          <p className="hosted-privacy-lead">We do not upload your diagrams.</p>
          <p>
            Studio has no diagram API, account, analytics, or telemetry. The host delivers the application and bundled
            icons; it can see ordinary request metadata, but no diagram source or imported file contents are sent to our
            servers.
          </p>
          <p>
            Saving and exporting create files on your device. Keep important work in a local <code>.dgm</code> file
            because clearing browser storage removes browser-saved recovery data.
          </p>
          <p>
            Hosting requests deliver the application and bundled icons and expose ordinary request metadata and
            requested icon paths. They do not include your diagram source or imported file contents.
          </p>
          <p className="hosted-links">
            <a href={DOCS_URL} target="_blank" rel="noreferrer">
              Install the CLI and initialize a project
            </a>
            <span aria-hidden="true"> · </span>
            <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
              Review the repository
            </a>
          </p>
        </div>
      </Modal>

      <Modal
        open={settingsOpen}
        title="Hosted Studio settings"
        subtitle="These preferences are stored only in this browser."
        onClose={() => onSettingsOpenChange(false)}
        width={520}
      >
        <div className="hosted-settings">
          <label className="hosted-check">
            <input
              type="checkbox"
              checked={preferences.welcomeDismissed}
              onChange={(event) => updatePreferences({ welcomeDismissed: event.target.checked })}
            />{" "}
            Don’t show the welcome popup again
          </label>
          <label className="hosted-check">
            <input
              type="checkbox"
              checked={preferences.tourDismissed}
              onChange={(event) => updatePreferences({ tourDismissed: event.target.checked })}
            />{" "}
            Don’t offer the quick tour again
          </label>
          <section className="hosted-settings-docs" aria-labelledby="hosted-settings-docs-title">
            <h3 id="hosted-settings-docs-title">Studio documentation</h3>
            <p>Guides for getting started, opening diagrams, and working with .dgm files.</p>
            <a href={DOCS_HOME_URL} target="_blank" rel="noopener noreferrer">
              Browse documentation <span aria-hidden="true">↗</span>
            </a>
          </section>
          <section className="hosted-settings-credits" aria-labelledby="hosted-settings-credits-title">
            <h3 id="hosted-settings-credits-title">Credits and licenses</h3>
            <CreditsNotice />
          </section>
          <div className="modal-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => {
                updatePreferences({ welcomeDismissed: false });
                onWelcomeOpenChange(true);
                onSettingsOpenChange(false);
              }}
            >
              Show welcome
            </button>
            <button type="button" className="primary-button" onClick={startTour}>
              Start quick tour
            </button>
          </div>
        </div>
      </Modal>

      {tourStep !== null && currentTour && (
        <div
          className="hosted-tour-layer"
          ref={tourContainerRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Quick tour step ${tourStep + 1} of ${TOUR_STEPS.length}`}
          onKeyDownCapture={(event) => {
            const target = event.target as HTMLElement;
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              finishTour();
              return;
            }
            if (target.tagName === "INPUT") return;
            if (event.key === "ArrowRight") {
              event.preventDefault();
              event.stopPropagation();
              if (tourStep >= TOUR_STEPS.length - 1) finishTour();
              else setTourStep(tourStep + 1);
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              event.stopPropagation();
              setTourStep(Math.max(0, tourStep - 1));
            } else if (event.key === "Tab") {
              const focusable = [
                ...(tourContainerRef.current?.querySelectorAll<HTMLElement>(
                  "button:not(:disabled), input:not(:disabled)",
                ) ?? []),
              ];
              if (!focusable.length) return;
              const current = focusable.indexOf(document.activeElement as HTMLElement);
              const next = (current + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
              event.preventDefault();
              event.stopPropagation();
              focusable[next]?.focus();
            }
          }}
        >
          {targetRect && (
            <div
              className="hosted-tour-spotlight"
              style={{
                left: targetRect.left - 6,
                top: targetRect.top - 6,
                width: targetRect.width + 12,
                height: targetRect.height + 12,
              }}
            />
          )}
          <div
            ref={tooltipRef}
            className="hosted-tour-tooltip"
            style={{ ...tooltipStyle, width: "min(360px, calc(100vw - 32px))" }}
          >
            <div className="hosted-tour-progress">
              Step {tourStep + 1} of {TOUR_STEPS.length}
            </div>
            <h2>{currentTour.title}</h2>
            <p>{currentTour.body}</p>
            <label className="hosted-check">
              <input
                type="checkbox"
                checked={tourDontShow}
                onChange={(event) => setTourDontShow(event.target.checked)}
              />{" "}
              Don’t offer this tour again
            </label>
            <div className="modal-actions modal-actions-spread">
              <button type="button" className="text-button" onClick={finishTour}>
                Skip
              </button>
              <span>
                <button
                  type="button"
                  className="text-button"
                  disabled={tourStep === 0}
                  onClick={() => setTourStep((step) => (step === null ? null : Math.max(0, step - 1)))}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    if (tourStep >= TOUR_STEPS.length - 1) finishTour();
                    else setTourStep(tourStep + 1);
                  }}
                >
                  {tourStep >= TOUR_STEPS.length - 1 ? "Done" : "Next"}
                </button>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
