const consentKey = "dumb-diagrams:analytics-consent:v1";
const maxAge = 180 * 24 * 60 * 60 * 1000;
type Choice = "granted" | "denied";

function readChoice(): Choice | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(consentKey) || "null");
    const age = Date.now() - saved?.at;
    if (age >= 0 && age < maxAge && ["granted", "denied"].includes(saved?.choice)) return saved.choice;
  } catch {
    /* Storage can be unavailable; never assume consent. */
  }
}

export function initAnalytics() {
  const banner = document.querySelector<HTMLElement>("[data-analytics-id]");
  const settings = document.querySelectorAll<HTMLElement>("[data-analytics-settings]");
  const revoke = document.querySelectorAll<HTMLButtonElement>("[data-analytics-revoke]");
  const statuses = document.querySelectorAll<HTMLElement>("[data-analytics-status]");
  const close = banner?.querySelector<HTMLButtonElement>("[data-analytics-close]");
  if (!banner) return;
  const id = banner.dataset.analyticsId!;
  const enabled = banner.dataset.analyticsEnabled === "true";
  let started = false;
  let choice = readChoice();
  let returnFocus: HTMLElement | undefined;

  function syncControls() {
    revoke.forEach((button) => {
      button.hidden = choice !== "granted";
    });
    if (close) close.hidden = choice === undefined;
    const prefix = enabled ? "" : "Local preview · ";
    statuses.forEach((status) => {
      status.textContent =
        choice === "granted"
          ? `${prefix}analytics allowed.`
          : choice === "denied"
            ? `${prefix}necessary cookies only.`
            : `${prefix}no cookie preference saved yet.`;
    });
  }

  function start() {
    if (started || !enabled) return;
    started = true;
    const config = document.createElement("script");
    config.type = "text/partytown";
    config.textContent = `
      window.dataLayer = window.dataLayer || [];
      function gtag() { window.dataLayer.push(arguments); }
      gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
      gtag('js', new Date());
      gtag('config', ${JSON.stringify(id)}, { allow_google_signals: false, allow_ad_personalization_signals: false, cookie_domain: 'none', cookie_path: '/', cookie_expires: 15552000, cookie_update: false });
    `;
    const tag = document.createElement("script");
    tag.type = "text/partytown";
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.append(config, tag);
    window.dispatchEvent(new CustomEvent("ptupdate"));
  }

  function choose(next: Choice) {
    choice = next;
    try {
      localStorage.setItem(consentKey, JSON.stringify({ choice, at: Date.now() }));
    } catch {
      /* This visit still works. */
    }
    banner!.hidden = true;
    returnFocus?.focus({ preventScroll: true });
    syncControls();
    if (choice === "granted") start();
    else {
      // Remove our host-only GA cookies, then unload the worker and tracker.
      for (const cookie of document.cookie.split(";")) {
        const name = cookie.trim().split("=")[0];
        if (name === "_ga" || (id && name === `_ga_${id.slice(2)}`))
          document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
      }
      // If storage is blocked, the next page asks again and still loads no tag.
      if (started) window.location.reload();
    }
  }

  banner.querySelectorAll<HTMLButtonElement>("[data-analytics-choice]").forEach((button) => {
    button.addEventListener("click", () => choose(button.dataset.analyticsChoice as Choice));
  });
  settings.forEach((control) =>
    control.addEventListener("click", (event) => {
      event.preventDefault();
      returnFocus = control;
      banner.hidden = false;
      syncControls();
      banner.querySelector<HTMLButtonElement>("[data-analytics-choice]")?.focus({ preventScroll: true });
    }),
  );
  close?.addEventListener("click", () => {
    banner.hidden = true;
    syncControls();
    returnFocus?.focus({ preventScroll: true });
  });
  banner.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && choice !== undefined) close?.click();
  });
  revoke.forEach((button) => button.addEventListener("click", () => choose("denied")));
  // Keep restored pages and other tabs in sync when consent changes elsewhere.
  window.addEventListener("storage", (event) => {
    if ((event.key === consentKey || event.key === null) && readChoice() !== choice) window.location.reload();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && readChoice() !== choice) window.location.reload();
  });
  banner.hidden = choice !== undefined;
  syncControls();
  if (choice === "granted") start();
}
