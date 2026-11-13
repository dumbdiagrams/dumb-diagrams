import { useState } from "react";

import { Modal } from "../ui/Modal";

export const BROWSER_COMPATIBILITY_NOTICE_DISMISSED_KEY = "dumb-diagrams:browser-compatibility-notice-dismissed";

type UserAgentBrand = { brand: string; version?: string };

export type BrowserIdentity = {
  userAgent?: string;
  userAgentData?: { brands?: readonly UserAgentBrand[] };
  brave?: boolean;
};

const ALTERNATE_CHROMIUM_BRANDS = [
  "brave",
  "microsoft edge",
  "opera",
  "vivaldi",
  "samsung internet",
  "yandex",
  "arc",
  "whale",
  "duckduckgo",
];

/** Returns true only when browser identity can reasonably be identified as Google Chrome. */
export function isStrictGoogleChrome(identity: BrowserIdentity): boolean {
  if (identity.brave) return false;

  if (identity.userAgentData) {
    const brands = identity.userAgentData.brands?.map(({ brand }) => brand.trim().toLowerCase()) ?? [];
    if (brands.some((brand) => ALTERNATE_CHROMIUM_BRANDS.includes(brand))) return false;
    return brands.includes("google chrome");
  }

  // A Chrome token also appears in Chromium-based browsers, so legacy UA
  // strings alone cannot prove this is Google's browser.
  return false;
}

function browserIsStrictChrome(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaNavigator = navigator as Navigator & {
    userAgentData?: { brands?: readonly UserAgentBrand[] };
    brave?: { isBrave?: () => Promise<boolean> };
  };
  // navigator.brave is exposed by Brave. Its isBrave() method is async, so the
  // presence of the API itself is the synchronous signal used for startup UI.
  return isStrictGoogleChrome({
    userAgent: navigator.userAgent,
    userAgentData: uaNavigator.userAgentData,
    brave: Boolean(uaNavigator.brave),
  });
}

export function isCurrentBrowserStrictGoogleChrome(): boolean {
  return browserIsStrictChrome();
}

function hasDismissed(): boolean {
  try {
    return (
      typeof window !== "undefined" && window.localStorage.getItem(BROWSER_COMPATIBILITY_NOTICE_DISMISSED_KEY) === "1"
    );
  } catch {
    return false;
  }
}

function rememberDismissal(): void {
  try {
    window.localStorage.setItem(BROWSER_COMPATIBILITY_NOTICE_DISMISSED_KEY, "1");
  } catch {
    // The notice remains dismissible for this render even when storage is blocked.
  }
}

export function dismissBrowserCompatibilityNotice(): void {
  rememberDismissal();
}

export function BrowserCompatibilityMessage() {
  return (
    <>
      <p>
        Studio works best in Google Chrome. Other browsers may lack features, and Brave disables the File System Access
        API by default. Without it, local <code>.dgm</code> live sync with a Git-versioned project may not work.
      </p>
      <p>
        In Brave, enable <code>brave://flags/#file-system-access-api</code> to try it. This is a browser-wide setting.
      </p>
    </>
  );
}

export function BrowserCompatibilityNotice() {
  const [open, setOpen] = useState(() => !browserIsStrictChrome() && !hasDismissed());

  if (!open) return null;

  const dismiss = () => {
    rememberDismissal();
    setOpen(false);
  };

  return (
    <Modal
      open={open}
      title="Google Chrome is recommended"
      subtitle="Some Studio features may be unavailable in other browsers."
      onClose={dismiss}
      className="browser-compatibility-notice"
      width={520}
    >
      <div className="browser-compatibility-content">
        <BrowserCompatibilityMessage />
        <div className="modal-actions">
          <button type="button" className="primary-button" onClick={dismiss} data-autofocus>
            Continue
          </button>
        </div>
      </div>
    </Modal>
  );
}
