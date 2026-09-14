import { IconClose } from "./icons";

export function FloatingPanel({
  title,
  subtitle,
  onClose,
  onCloseAnimationEnd,
  children,
  className = "",
  width = 300,
  closing = false,
}: {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  onCloseAnimationEnd?: () => void;
  children: React.ReactNode;
  className?: string;
  width?: number;
  closing?: boolean;
}) {
  const isLeftDrawer =
    className.includes("drawer-sheet") &&
    !className.includes("edge-sheet") &&
    !className.includes("inspector-sheet");

  return (
    <aside
      className={`floating-panel ${className}${closing ? " is-closing" : ""}`}
      style={{ width }}
      role="dialog"
      aria-label={title}
      onAnimationEnd={(event) => {
        if (
          !closing ||
          event.currentTarget !== event.target ||
          event.animationName !== (isLeftDrawer ? "drawer-out-left" : "drawer-out-right")
        ) {
          return;
        }
        onCloseAnimationEnd?.();
      }}
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
