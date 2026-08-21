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
      <path
        d="M4 2.5L4.35 15.25L7.8 11.8L10.35 16L11.9 15.1L9.35 10.9H14.5L4 2.5Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={0.8}
        strokeLinejoin="round"
      />
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

export function IconGrid(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 3H15V15H3Z" />
      <path d="M7 3V15M11 3V15M3 7H15M3 11H15" />
    </IconBase>
  );
}

export function IconFolderOpen(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2.5 5.5H6.75L8.25 7.25H15.5V14.5H2.5V5.5Z" />
      <path d="M9 8.25V11.75" />
      <path d="M7.5 10.25L9 11.75L10.5 10.25" />
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

export function IconMenu(props: IconProps) {
  return (
    <IconBase strokeWidth={2.6} {...props}>
      <path d="M3 4.5H15" />
      <path d="M3 9H15" />
      <path d="M3 13.5H15" />
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

export function IconEdit(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 13.75L4.5 10.5L12.25 2.75L15.25 5.75L7.5 13.5L4 13.75Z" />
      <path d="M10.75 4.25L13.75 7.25" />
      <path d="M4 13.75L7.5 13.5" />
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

export function IconEye(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2.5 9S4.8 5 9 5s6.5 4 6.5 4S13.2 13 9 13 2.5 9 2.5 9Z" />
      <circle cx="9" cy="9" r="1.8" />
    </IconBase>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2.5 9S4.8 5 9 5c1.1 0 2.1.25 2.95.62" />
      <path d="M15.5 9S13.2 13 9 13c-1.1 0-2.1-.25-2.95-.62" />
      <path d="M2.5 2.5l13 13" />
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

export function IconMagicWand(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 14L11.5 6.5" strokeWidth={2} />
      <path
        d="M13.25 2.5L14 4.75L16.25 5.5L14 6.25L13.25 8.5L12.5 6.25L10.25 5.5L12.5 4.75L13.25 2.5Z"
        fill="currentColor"
        stroke="none"
      />
      <path d="M6 3.5V5M5.25 4.25H6.75" />
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

export function IconPlus(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 3V15" />
      <path d="M3 9H15" />
    </IconBase>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="7.75" cy="7.75" r="4.25" />
      <path d="M11 11L15 15" />
    </IconBase>
  );
}

export function IconHelp(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="9" cy="9" r="6.5" />
      <path d="M7.25 7.1A1.9 1.9 0 0 1 9.1 5.75A1.8 1.8 0 0 1 11 7.55C11 9 9 9.25 9 10.5" />
      <path d="M9 13.15V13.2" />
    </IconBase>
  );
}

export function IconLock(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="4" y="8" width="10" height="7" rx="1.5" />
      <path d="M6.25 8V6.25a2.75 2.75 0 0 1 5.5 0V8" />
      <circle cx="9" cy="11.5" r="0.8" fill="currentColor" stroke="none" />
      <path d="M9 12.25V13.25" />
    </IconBase>
  );
}

export function IconFile(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 2.5H10.5L14 6V15.5H5Z" />
      <path d="M10.5 2.5V6H14" />
      <path d="M7.25 9H11.75M7.25 12H11.75" />
    </IconBase>
  );
}
