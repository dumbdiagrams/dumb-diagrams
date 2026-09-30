import { useEffect, useRef, type ReactNode } from "react";

import { IconClose } from "./icons";

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  className = "",
  width = 640,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  width?: number;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      const autofocus = dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]");
      (autofocus ?? dialogRef.current?.querySelector<HTMLElement>("button, input, [tabindex='0']"))?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href], [tabindex='0']",
      ) ?? [])].filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      // Explicitly advance focus: macOS browser preferences can otherwise
      // omit buttons from the native Tab sequence.
      event.preventDefault();
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      const next = index < 0 ? (event.shiftKey ? focusable.length - 1 : 0)
        : (index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      focusable[next]?.focus();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = bodyOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Backdrop dismissal supplements the dialog close button and Escape key.
    <div
      className="modal-backdrop"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`modal-dialog ${className}`}
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header className="modal-header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-button subtle" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  confirmDanger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel} width={420}>
      <div className="confirm-modal">
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" className="text-button" onClick={onCancel}>Cancel</button>
          <button type="button" className={confirmDanger ? "danger-button" : "primary-button"} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
