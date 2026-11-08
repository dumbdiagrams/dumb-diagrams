const hostedStudioUrl = "https://studio.dumbdiagrams.com";
const localStudioPort = 49323;
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function localStudioUrl(): string {
  return `http://127.0.0.1:${localStudioPort}/`;
}

const target = localHosts.has(window.location.hostname) ? localStudioUrl() : hostedStudioUrl;
for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-studio-link]")) link.href = target;
