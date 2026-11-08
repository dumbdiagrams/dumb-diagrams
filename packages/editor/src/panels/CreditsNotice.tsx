const CREDITS_URLS = {
  license: "https://dumbdiagrams.com/LICENSE.txt",
  icons: "https://dumbdiagrams.com/ICON-NOTICES.txt",
  fonts: "https://dumbdiagrams.com/FONT-LICENSES.txt",
} as const;

export function CreditsNotice() {
  return (
    <div className="credits-notice">
      <p>
        Dumb Diagrams source code is licensed under AGPL-3.0-only, except where otherwise indicated. AWS, Microsoft
        Azure, and Google Cloud architecture artwork remains subject to the respective providers&apos; terms and
        trademark rights. Inclusion in this repository does not grant additional rights to those assets.
      </p>
      <nav aria-label="Credits and licenses">
        <a href={CREDITS_URLS.license} target="_blank" rel="noopener noreferrer">
          AGPL-3.0-only
        </a>
        <a href={CREDITS_URLS.icons} target="_blank" rel="noopener noreferrer">
          Icon credits
        </a>
        <a href={CREDITS_URLS.fonts} target="_blank" rel="noopener noreferrer">
          Font credits
        </a>
      </nav>
    </div>
  );
}
