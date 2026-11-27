/*
 * The handle on the sidebar's right edge that sets its width: drag it (Escape
 * puts it back), or focus it and use the arrow keys, Home and End. A
 * double-click goes back to the default width. The Data sources and View
 * settings panels share the width, which is remembered (see prefs.ts).
 *
 * While dragging, the width is set straight on the sidebar's element, and
 * saved (re-rendering the sidebar) only at the end.
 */
import * as React from "react";
import { useRef, useState } from "react";
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH,
  sidebarWidth,
  usePref,
} from "./prefs";
import "./ui.css";

const WIDTH_VAR = "--tui-sidebar-w";
const STEP = 16;

/** The style that gives a sidebar its width (ui.css uses the variable). */
export const useSidebarWidthStyle = (): React.CSSProperties => {
  const width = usePref(sidebarWidth);
  return { [WIDTH_VAR]: `${width}px` } as React.CSSProperties;
};

/** No more than 60% of the window (as in ui.css), so that the grid still shows. */
const maxWidth = () =>
  Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.floor(window.innerWidth * 0.6)));

const clamp = (w: number) => Math.round(Math.min(maxWidth(), Math.max(SIDEBAR_MIN_WIDTH, w)));

interface Drag {
  aside: HTMLElement;
  startX: number;
  startWidth: number;
  width: number;
  onKey: (e: KeyboardEvent) => void;
}

export const SidebarSash: React.FC = () => {
  const width = usePref(sidebarWidth);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);

  const end = (keep: boolean) => {
    const d = drag.current;
    if (!d) {
      return;
    }
    drag.current = null;
    setDragging(false);
    window.removeEventListener("keydown", d.onKey, true);
    d.aside.classList.remove("tui-resizing");
    document.body.classList.remove("tui-col-resize");
    if (keep) {
      sidebarWidth.set(d.width);
    }
    d.aside.style.setProperty(WIDTH_VAR, `${sidebarWidth.get()}px`);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const aside = e.currentTarget.closest(".tui-sidebar") as HTMLElement | null;
    if (e.button !== 0 || aside === null) {
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const startWidth = aside.getBoundingClientRect().width;
    const onKey = (k: KeyboardEvent) => {
      if (k.key === "Escape") {
        k.preventDefault();
        k.stopPropagation();
        end(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    drag.current = { aside, startX: e.clientX, startWidth, width: startWidth, onKey };
    aside.classList.add("tui-resizing");
    document.body.classList.add("tui-col-resize");
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d) {
      d.width = clamp(d.startWidth + e.clientX - d.startX);
      d.aside.style.setProperty(WIDTH_VAR, `${d.width}px`);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const current = Math.min(width, maxWidth());
    const next =
      e.key === "ArrowLeft"
        ? current - STEP
        : e.key === "ArrowRight"
        ? current + STEP
        : e.key === "Home"
        ? SIDEBAR_MIN_WIDTH
        : e.key === "End"
        ? SIDEBAR_MAX_WIDTH
        : null;
    if (next !== null && drag.current === null) {
      e.preventDefault();
      sidebarWidth.set(clamp(next));
    }
  };

  return (
    <div
      className={"tui-sash" + (dragging ? " tui-active" : "")}
      role="separator"
      aria-orientation="vertical"
      aria-label="Sidebar width"
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => end(true)}
      onLostPointerCapture={() => end(true)}
      onDoubleClick={() => sidebarWidth.set(SIDEBAR_WIDTH)}
      onKeyDown={onKeyDown}
    />
  );
};
