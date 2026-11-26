/*
 * The sidebar's Pivot and Sort shelves: the columns the view pivots and
 * sorts by, in order, as chips. Drag a chip (or pick it up with Space and
 * move it with the arrow keys) to reorder; × removes it. A sort chip's
 * arrow flips its direction.
 */
import * as React from "react";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { StateRef } from "oneref";
import { Schema } from "reltab";
import * as actions from "../../actions";
import { AppState } from "../../AppState";
import { ViewParams } from "../../ViewParams";
import { ArrowDown, ArrowUp, X } from "./icons";

/** Sensors for dragging by mouse (after a few pixels, so clicks work) or keyboard. */
export const useDragSensors = () =>
  useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

/** The new order of `ids` after a drag, or null if it didn't change. */
export const reordered = (ids: string[], e: DragEndEvent): string[] | null => {
  const { active, over } = e;
  if (!over || active.id === over.id) {
    return null;
  }
  const from = ids.indexOf(String(active.id));
  const to = ids.indexOf(String(over.id));
  return from < 0 || to < 0 ? null : arrayMove(ids, from, to);
};

const ShelfChip: React.FC<{
  id: string;
  label: string;
  shelf: string;
  extra?: React.ReactNode;
  onRemove: () => void;
}> = ({ id, label, shelf, extra, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <div
      ref={setNodeRef}
      className={"tui-shelfchip" + (isDragging ? " tui-dragging" : "")}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-column={id}
    >
      <span
        className="tui-shelfchip-name"
        {...attributes}
        {...listeners}
        aria-label={`${label} (drag to reorder)`}
        aria-roledescription="sortable"
      >
        {label}
      </span>
      {extra}
      <button
        type="button"
        className="tui-iconbtn"
        aria-label={`Remove ${label} from ${shelf}`}
        onClick={onRemove}
      >
        <X size={11} strokeWidth={1.8} />
      </button>
    </div>
  );
};

const Shelf: React.FC<{
  title: string;
  ids: string[];
  empty: string;
  onReorder: (ids: string[]) => void;
  children: React.ReactNode;
}> = ({ title, ids, empty, onReorder, children }) => {
  const sensors = useDragSensors();
  return (
    <div className="tui-shelf" role="group" aria-label={title}>
      <span className="tui-shelf-title">{title}</span>
      <div className="tui-shelf-chips">
        {ids.length === 0 ? (
          <span className="tui-hint">{empty}</span>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => {
              const next = reordered(ids, e);
              if (next) {
                onReorder(next);
              }
            }}
          >
            <SortableContext items={ids} strategy={rectSortingStrategy}>
              {children}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
};

export const Shelves: React.FC<{
  schema: Schema;
  viewParams: ViewParams;
  stateRef: StateRef<AppState>;
}> = ({ schema, viewParams, stateRef }) => {
  const pivots = viewParams.vpivots;
  const sortKey = viewParams.sortKey;
  const sortIds = sortKey.map(([c]) => c);
  return (
    <div className="tui-shelves">
      <Shelf
        title="Pivot"
        ids={pivots}
        empty="Not pivoted"
        onReorder={(ids) => actions.setPivots(ids, stateRef)}
      >
        {pivots.map((c) => (
          <ShelfChip
            key={c}
            id={c}
            shelf="the pivot"
            label={schema.displayName(c)}
            onRemove={() => actions.togglePivot(c, stateRef)}
          />
        ))}
      </Shelf>
      <Shelf
        title="Sort"
        ids={sortIds}
        empty="Not sorted"
        onReorder={(ids) =>
          actions.setSortKey(
            ids.map((c) => sortKey.find(([k]) => k === c)!),
            stateRef
          )
        }
      >
        {sortKey.map(([c, asc]) => (
          <ShelfChip
            key={c}
            id={c}
            shelf="the sort"
            label={schema.displayName(c)}
            onRemove={() => actions.toggleSort(c, stateRef)}
            extra={
              <button
                type="button"
                className="tui-iconbtn tui-sortdir"
                aria-label={`Sort ${schema.displayName(c)} ${asc ? "descending" : "ascending"}`}
                title={asc ? "Ascending (click for descending)" : "Descending (click for ascending)"}
                onClick={() => actions.setSortDir(c, !asc, stateRef)}
              >
                {asc ? <ArrowUp size={11} strokeWidth={2} /> : <ArrowDown size={11} strokeWidth={2} />}
              </button>
            }
          />
        ))}
      </Shelf>
    </div>
  );
};
