/*
 * The mock-up's own line icons (drawn on a 16-unit grid), where it doesn't
 * use a stock one: sort arrows, pivot, filter, format, hide, and a tick.
 */
import * as React from "react";

export const Glyph: React.FC<{
  size?: number;
  stroke?: number;
  children: React.ReactNode;
}> = ({ size = 14, stroke = 1.5, children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const SortUpGlyph = ({ size = 14, stroke = 1.6 }) => (
  <Glyph size={size} stroke={stroke}>
    <path d="M8 13V3.5M4 7.5l4-4 4 4" />
  </Glyph>
);

export const SortDownGlyph = ({ size = 14, stroke = 1.6 }) => (
  <Glyph size={size} stroke={stroke}>
    <path d="M8 3v9.5M4 8.5l4 4 4-4" />
  </Glyph>
);

export const PivotGlyph = ({ size = 14, stroke = 1.5 }) => (
  <Glyph size={size} stroke={stroke}>
    <path d="M3 3h4M5 3v9.5h3.5M5 8h3.5" />
    <circle cx="11" cy="8" r="1.4" />
    <circle cx="11" cy="12.5" r="1.4" />
  </Glyph>
);

export const FilterGlyph = ({ size = 14, stroke = 1.5 }) => (
  <Glyph size={size} stroke={stroke}>
    <path d="M2.5 3.5h11l-4.25 5.25v3.75l-2.5 1.25v-5z" />
  </Glyph>
);

/** A filtered column's mark in the grid header: a solid funnel. */
export const FilledFilterGlyph = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M2 3h12l-4.5 5.5v4.25L6.5 14V8.5z" />
  </svg>
);

export const ChevronDownGlyph = ({ size = 14, stroke = 1.7 }) => (
  <Glyph size={size} stroke={stroke}>
    <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
  </Glyph>
);

export const ChevronRightGlyph = ({ size = 14, stroke = 1.7 }) => (
  <Glyph size={size} stroke={stroke}>
    <path d="m6.5 4.5 3.5 3.5-3.5 3.5" />
  </Glyph>
);

export const FormatGlyph = ({ size = 14, stroke = 1.5 }) => (
  <Glyph size={size} stroke={stroke}>
    <path d="M3 12.5h10M5 10l3-7 3 7M6.2 7.5h3.6" />
  </Glyph>
);

export const HideGlyph = ({ size = 14, stroke = 1.5 }) => (
  <Glyph size={size} stroke={stroke}>
    <path d="M2.5 8s2-4 5.5-4c1.1 0 2.1.4 2.9.9M13.5 8s-2 4-5.5 4c-1.1 0-2.1-.4-2.9-.9" />
    <path d="M3 3l10 10" />
  </Glyph>
);

export const TickGlyph = ({ size = 13, stroke = 2 }) => (
  <Glyph size={size} stroke={stroke}>
    <path d="m3.5 8.5 3 3 6-7" />
  </Glyph>
);
