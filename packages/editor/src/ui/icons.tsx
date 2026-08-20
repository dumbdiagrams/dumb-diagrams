import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconSelect(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4.5 3.5L4.5 14.5" />
      <path d="M4.5 3.5L8.5 7.5L4.5 11.5" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function IconLayers(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 3L2.5 6.5L9 10L15.5 6.5L9 3Z" />
      <path d="M2.5 9.5L9 13L15.5 9.5" />
      <path d="M2.5 12.5L9 16L15.5 12.5" />
    </IconBase>
  );
}

export function IconOpen(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 5.5H11.5" />
      <path d="M7.5 5.5V3.5H14.5V14.5H3V8" />
      <path d="M3 11.5H6.5V14.5H3V11.5Z" />
    </IconBase>
  );
}

export function IconCaret(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 7.5L9 10.5L12 7.5" />
    </IconBase>
  );
}

export function IconFit(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3.5 6.5V3.5H6.5" />
      <path d="M11.5 6.5V3.5H8.5" />
      <path d="M3.5 11.5V14.5H6.5" />
      <path d="M11.5 11.5V14.5H8.5" />
    </IconBase>
  );
}

export function IconResources(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="3" width="5" height="5" rx="1" />
      <rect x="10" y="3" width="5" height="5" rx="1" />
      <rect x="3" y="10" width="5" height="5" rx="1" />
      <rect x="10" y="10" width="5" height="5" rx="1" />
    </IconBase>
  );
}

export function IconGroups(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="2.5" y="4" width="13" height="10" rx="1.5" />
      <path d="M2.5 7H15.5" />
    </IconBase>
  );
}

export function IconConnector(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 9H7" />
      <path d="M11 9H15" />
      <circle cx="9" cy="9" r="2" />
    </IconBase>
  );
}

export function IconCode(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5.5 5L3 9L5.5 13" />
      <path d="M12.5 5L15 9L12.5 13" />
    </IconBase>
  );
}

export function IconNote(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 3.5h10l2 2v9H4z" />
      <path d="M14 3.5v3h3M7 9h6M7 12h4" />
    </IconBase>
  );
}

export function IconExport(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 3V11" />
      <path d="M6 8L9 11L12 8" />
      <path d="M4 14H14" />
    </IconBase>
  );
}

export function IconSun(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="9" r="3" />
      <path d="M9 2V3.5" />
      <path d="M9 14.5V16" />
      <path d="M2 9H3.5" />
      <path d="M14.5 9H16" />
      <path d="M4.2 4.2L5.3 5.3" />
      <path d="M12.7 12.7L13.8 13.8" />
      <path d="M4.2 13.8L5.3 12.7" />
      <path d="M12.7 5.3L13.8 4.2" />
    </IconBase>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M13.5 10.5A5.5 5.5 0 1 1 7.5 4.5A6 6 0 0 0 13.5 10.5Z" />
    </IconBase>
  );
}

export function IconMonitor(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="2.5" y="3.5" width="13" height="9" rx="1.5" />
      <path d="M6.5 14.5H11.5" />
      <path d="M9 12.5V14.5" />
    </IconBase>
  );
}

export function IconUndo(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 6.5H10.5C12.4 6.5 14 8.1 14 10C14 11.9 12.4 13.5 10.5 13.5H9" />
      <path d="M6.5 4.5L4 6.5L6.5 8.5" />
    </IconBase>
  );
}

export function IconRedo(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M14 6.5H7.5C5.6 6.5 4 8.1 4 10C4 11.9 5.6 13.5 7.5 13.5H9" />
      <path d="M11.5 4.5L14 6.5L11.5 8.5" />
    </IconBase>
  );
}

export function IconAuto(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 3V5" />
      <path d="M9 13V15" />
      <path d="M3 9H5" />
      <path d="M13 9H15" />
      <circle cx="9" cy="9" r="3" />
    </IconBase>
  );
}

export function IconClose(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 5L13 13" />
      <path d="M13 5L5 13" />
    </IconBase>
  );
}
