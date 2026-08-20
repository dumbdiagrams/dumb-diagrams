import { IconClose } from "./icons";

export function FloatingPanel({
  title,
  subtitle,
  onClose,
  children,
  className = "",
  width = 300,
}: {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
  width?: number;
}) {
  return (
    <aside
      className={`floating-panel ${className}`}
      style={{ width }}
      role="dialog"
      aria-label={title}
    >
      <header className="floating-panel-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {onClose && (
          <button
            type="button"
            className="icon-button subtle"
            onClick={onClose}
            aria-label="Close"
          >
            <IconClose />
          </button>
        )}
      </header>
      <div className="floating-panel-body">{children}</div>
    </aside>
  );
}
