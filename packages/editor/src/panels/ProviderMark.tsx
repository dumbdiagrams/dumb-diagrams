import type { UserCloudProvider } from "@dumb-diagrams/runtime/catalog";

export function ProviderMark({ provider }: { provider: "all" | UserCloudProvider }) {
  if (provider === "all") {
    return (
      <span className="provider-mark provider-mark--all" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M12 3.5 14.2 9l5.3 2.2-5.3 2.2L12 19l-2.2-5.6-5.3-2.2L9.8 9 12 3.5Z" /></svg>
      </span>
    );
  }
  if (provider === "aws") {
    return (
      <span className="provider-mark provider-mark--aws" aria-hidden="true">
        <svg viewBox="0 0 28 24">
          <text x="14" y="12.3" textAnchor="middle">aws</text>
          <path d="M5.5 15.2c4.6 3.2 10.8 3.5 16.8.5" />
          <path d="m19.7 14.8 2.9.6-1.3 2.5" />
        </svg>
      </span>
    );
  }
  if (provider === "azure") {
    return (
      <span className="provider-mark provider-mark--azure" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M9.2 3.5h5.5L9 20.5H3.5L9.2 3.5Z" />
          <path d="M15.2 8.1 21 20.5h-8.9l2-4.5h3.4l-4.1-7.9h1.8Z" opacity=".7" />
        </svg>
      </span>
    );
  }
  if (provider === "gcp") {
    return (
      <span className="provider-mark provider-mark--gcp" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path className="gcp-blue" d="M8.1 17.8A5.8 5.8 0 0 1 9 6.6l2.1 3.5a2 2 0 0 0-1.2 3.7l-1.8 4Z" />
          <path className="gcp-red" d="M9 6.6a6.9 6.9 0 0 1 10.2 3l-3.8 1.1a3 3 0 0 0-4.3-.6L9 6.6Z" />
          <path className="gcp-yellow" d="M19.2 9.6a5 5 0 0 1 .6 2.4 5.8 5.8 0 0 1-.7 2.8l-3.5-1.9a2 2 0 0 0-.2-2.2l3.8-1.1Z" />
          <path className="gcp-green" d="M19.1 14.8a5.7 5.7 0 0 1-5.1 3H8.1l1.8-4H14c.7 0 1.2-.3 1.6-.9l3.5 1.9Z" />
        </svg>
      </span>
    );
  }
  return (
    <span className="provider-mark provider-mark--neutral" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M7.4 18h9.5a4.1 4.1 0 0 0 .5-8.2A5.6 5.6 0 0 0 6.9 8.4 4.8 4.8 0 0 0 7.4 18Z" />
      </svg>
    </span>
  );
}
