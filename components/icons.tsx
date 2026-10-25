/** Shared SVG icons for navigation, headers, and editors. */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function MenuIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

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

export function ArrowIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M5 12h14" strokeLinecap="round" />
      <path d="M13 6.5 18.5 12 13 17.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MoveAcrossIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M19 12H5" strokeLinecap="round" />
      <path d="M11 6.5 5.5 12 11 17.5" strokeLinecap="round" strokeLinejoin="round" />
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

export function ClearMarksIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="2.2" stroke="currentColor" strokeWidth="2.6" />
      <path d="M8 8.2 16 16M16 8.2 8 16" stroke="#d7000d" strokeWidth="2.4" strokeLinecap="round" />
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
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M12 2.2 15.7 4.2 12 6.2 8.3 4.2Z" />
      <path d="M8.3 4.2v3.3L12 9.5V6.2" />
      <path d="M15.7 4.2v3.3L12 9.5" />
      <path d="M7.5 11.2 11.2 13.2 7.5 15.2 3.8 13.2Z" />
      <path d="M3.8 13.2v3.3L7.5 18.5v-3.3" />
      <path d="M11.2 13.2v3.3L7.5 18.5" />
      <path d="M16.5 11.2 20.2 13.2 16.5 15.2 12.8 13.2Z" />
      <path d="M12.8 13.2v3.3L16.5 18.5v-3.3" />
      <path d="M20.2 13.2v3.3L16.5 18.5" />
    </svg>
  );
}

export function GroceryIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M4 5.5h1.7l1.6 9.1a1.4 1.4 0 0 0 1.4 1.1h8.6a1.4 1.4 0 0 0 1.4-1.2L20.2 8H7.2" />
      <circle cx="9.3" cy="19" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="16.8" cy="19" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function RecipesIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M3.55 2.05h.95v5.15h-.95zm1.45 0h.95v5.15h-.95zm1.45 0h.95v5.15H6.45zm1.45 0h.95v5.15H7.9zM3.4 6.35h6.15v.9c0 .9-.7 1.55-1.65 1.75v7.4c.55.25.85.7.85 1.2v.5c0 .6-.5 1.1-1.1 1.1H6.5c-.6 0-1.1-.5-1.1-1.1v-.5c0-.5.3-.95.85-1.2v-7.4c-.95-.2-1.65-.85-1.65-1.75v-.9zm2.55 12.2a.55.72 0 1 0 0 1.44.55.72 0 1 0 0-1.44z"
      />
      <path
        fillRule="evenodd"
        d="M14.05 2.1h2.55c.4 0 .7.28.7.65v8.7c0 .45-.32.8-.78.9l-.22.06v5.35c.52.24.85.68.85 1.2v.45c0 .6-.5 1.1-1.12 1.1h-.62c-.62 0-1.12-.5-1.12-1.1v-.45c0-.52.33-.96.85-1.2v-5.35l-.22-.06c-.46-.1-.78-.45-.78-.9V2.75c0-.37.3-.65.7-.65zm1.15 16.4a.58.75 0 1 0 0 1.5.58.75 0 1 0 0-1.5z"
      />
    </svg>
  );
}

export function ExportIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M12 16V5" strokeLinecap="round" />
      <path d="M8.5 8.5 12 5l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 14.5V18a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18v-3.5" strokeLinecap="round" />
    </svg>
  );
}

export function ListsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="6" y="4.2" width="12" height="16" rx="1.6" />
      <path d="M9.2 4.2v-.5A1.4 1.4 0 0 1 10.6 2.3h2.8a1.4 1.4 0 0 1 1.4 1.4v.5" />
      <path d="M8.8 10h6.4M8.8 13.4h6.4M8.8 16.8h4" />
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

export function ReloadIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.1-5.2" strokeLinecap="round" />
      <path d="M19.5 4.5V8h-3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M12 15V5" strokeLinecap="round" />
      <path d="M8.5 8.5 12 5l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" strokeLinecap="round" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <path d="M12 4v10" strokeLinecap="round" />
      <path d="M8.5 11.5 12 15l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" strokeLinecap="round" />
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

export function UserIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <circle cx="12" cy="8" r="3.2" fill="currentColor" />
      <path fill="currentColor" d="M6.2 19.4c.7-3.3 2.8-4.9 5.8-4.9s5.1 1.6 5.8 4.9c.1.4-.2.8-.6.8H6.8c-.4 0-.7-.4-.6-.8Z" />
    </svg>
  );
}
