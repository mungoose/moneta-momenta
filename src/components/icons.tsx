import type { Status } from "@/lib/plan/affordability";

/** Shared props of the design's 20×20 stroke icons. Decorative: the text next to them carries the meaning. */
const stroke = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/** The brand mark: four bars in a rounded square. */
export function BrandMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="8" />
      <path d="M7 19v-6M11.67 19v-9M16.33 19v-6M21 19v-9" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Arrow for buttons that move forward. */
export function ArrowRightIcon() {
  return (
    <svg className="mm-ico" {...stroke}>
      <path d="M4 10h12M11 5l5 5-5 5" />
    </svg>
  );
}

/** Arrow into a tray, for upload buttons. */
export function UploadIcon() {
  return (
    <svg className="mm-ico" {...stroke}>
      <path d="M10 13V3.5M6 7.5l4-4 4 4" />
      <path d="M3.5 13v2.5a1 1 0 001 1h11a1 1 0 001-1V13" />
    </svg>
  );
}

/** A page with a folded corner, next to a file name. */
export function FileIcon() {
  return (
    <svg className="mm-ico mm-ico--sm" {...stroke}>
      <path d="M11.5 2.5H5.5a1 1 0 00-1 1v13a1 1 0 001 1h9a1 1 0 001-1V6.5z" />
      <path d="M11.5 2.5v4h4" />
    </svg>
  );
}

/** Circled "i" for info callouts. */
export function InfoIcon({ className = "mm-ico" }: { className?: string }) {
  return (
    <svg className={className} {...stroke}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9v4.5" />
      <path d="M10 6.5h.01" />
    </svg>
  );
}

/** A cross, for closing a drawer. */
export function CloseIcon() {
  return (
    <svg className="mm-ico" {...stroke}>
      <path d="M5 5l10 10M15 5L5 15" />
    </svg>
  );
}

/**
 * The icon for a status. Each has its own shape (circle + check, triangle +
 * mark, octagon + cross), so status never relies on colour alone.
 */
export function StatusIcon({ status, className = "mm-ico" }: { status: Status; className?: string }) {
  switch (status) {
    case "fits":
      return (
        <svg className={className} {...stroke}>
          <circle cx="10" cy="10" r="7.5" />
          <path d="M6.8 10.2l2.2 2.2 4.2-4.6" />
        </svg>
      );
    case "tight":
      return (
        <svg className={className} {...stroke}>
          <path d="M10 3.2l7.3 12.6H2.7z" />
          <path d="M10 8.2v3.4" />
          <path d="M10 14h.01" />
        </svg>
      );
    case "no-fit":
      return (
        <svg className={className} {...stroke}>
          <path d="M7 2.8h6l4.2 4.2v6L13 17.2H7L2.8 13V7z" />
          <path d="M7.6 7.6l4.8 4.8M12.4 7.6l-4.8 4.8" />
        </svg>
      );
  }
}

const STATUS_CLASS: Record<Status, string> = {
  fits: "mm-status--fits",
  tight: "mm-status--tight",
  "no-fit": "mm-status--nofit",
};

/**
 * A status chip: icon plus written label.
 * @param status  The status to show.
 * @param label   Its label in the UI language.
 * @param small   The 16 px icon used in tables and lists.
 */
export function StatusChip({ status, label, small = false }: { status: Status; label: string; small?: boolean }) {
  return (
    <span className={`mm-status ${STATUS_CLASS[status]}`}>
      <StatusIcon status={status} className={small ? "mm-ico mm-ico--sm" : "mm-ico"} />
      {label}
    </span>
  );
}
