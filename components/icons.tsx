import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function SearchIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16.5 20 20.5" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

export function SortIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M8 6v12M8 18l-2.5-2.5M8 18l2.5-2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 7h6M14 12h4.5M14 17h3" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M6 14.5 12 8.5l6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ReorderIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
      <circle cx="8" cy="7" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="10" cy="17" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function GripIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

export function DotsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 16 24" fill="currentColor" aria-hidden="true" {...props}>
      <circle cx="8" cy="5" r="1.7" />
      <circle cx="8" cy="12" r="1.7" />
      <circle cx="8" cy="19" r="1.7" />
    </svg>
  );
}

export function PenIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M4 20h4l10-10-4-4L4 16v4Z" strokeLinejoin="round" />
      <path d="m13 7 4 4" />
    </svg>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M3 8.2c0-1.2 1-2.2 2.2-2.2H9l1.7 1.9H18.8c1.2 0 2.2 1 2.2 2.2v8.1c0 1.2-1 2.2-2.2 2.2H5.2c-1.2 0-2.2-1-2.2-2.2V8.2Z"
      />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" {...props}>
      <path d="M5 7h14" strokeLinecap="round" />
      <path d="M9 7V5h6v2" strokeLinejoin="round" />
      <path d="m8 7 1 13h6l1-13" strokeLinejoin="round" />
      <path d="M10 11v5M14 11v5" strokeLinecap="round" />
    </svg>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...props}>
      <path d="M8 7.5 9.2 5.5h5.6L16 7.5" strokeLinejoin="round" />
      <rect x="4" y="7.5" width="16" height="11" rx="2" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="m6 12.5 4 4L18 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...props}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.4" />
      <path d="m7 16 3.2-3.2a1 1 0 0 1 1.4 0L16 17" />
    </svg>
  );
}

export function ProductsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...props}>
      <path d="M12 3 20 7.5 12 12 4 7.5 12 3Z" />
      <path d="M20 7.5V16.5L12 21 4 16.5V7.5" />
      <path d="M12 12v9" />
    </svg>
  );
}

export function GroceryIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...props}>
      <path d="M8 4h8v16H8z" />
      <path d="M10 8h4M10 12h4M10 16h2" strokeLinecap="round" />
    </svg>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M7 7l10 10M17 7 7 17" strokeLinecap="round" />
    </svg>
  );
}
