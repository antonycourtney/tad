/*
 * The sidebar's Pivot and Sort shelves: the columns the view pivots and
 * sorts by, in order, as chips (as in the mock-up). Drag a chip to reorder
 * it, or drag a column from the list onto a shelf to add it there. × removes
 * a chip, and a sort chip's asc/desc button flips its direction.
 *
 * The drag and drop itself (one DndContext for the shelves and the column
 * list) is ViewSidebar's; the helpers it uses are here.
 */
import * as React from "react";
import {
  closestCenter,
  CollisionDetection,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  UniqueIdentifier,
  useDndContext,
  useDroppable,
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

export type ShelfName = "pivot" | "sort";

/*
 * Drag ids: "col:<column>" for the column list's rows, "pivot:<column>" and
 * "sort:<column>" for the chips, and "shelf:pivot" and "shelf:sort" for the
 * shelves themselves.
 */
export const dragId = (kind: string, column: string) => `${kind}:${column}`;

export const parseDragId = (id: UniqueIdentifier): [string, string] => {
  const s = String(id);
  const i = s.indexOf(":");
  return [s.slice(0, i), s.slice(i + 1)];
};

const kindOf = (id: UniqueIdentifier) => parseDragId(id)[0];

/**
 * Where a drag would drop: a chip or the end of a shelf when the pointer is
 * over a shelf, otherwise the nearest item of the kind being dragged. (By
 * keyboard, items only move within their own list.)
 */
export const collisions: CollisionDetection = (args) => {
  const kind = kindOf(args.active.id);
  const shelfHits = pointerWithin({
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => kindOf(c.id) === "shelf"),
  });
  if (shelfHits.length > 0) {
    const shelf = parseDragId(shelfHits[0].id)[1];
    const chips = args.droppableContainers.filter((c) => kindOf(c.id) === shelf);
    return chips.length > 0 ? closestCenter({ ...args, droppableContainers: chips }) : shelfHits;
  }
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => kindOf(c.id) === kind),
  });
};

/** `list` with `item` moved (or added) to just before `before`, or to the end. */
export const placed = (list: string[], item: string, before: string | null): string[] => {
  if (before === item) {
    return list;
  }
  const rest = list.filter((x) => x !== item);
  const at = before === null ? -1 : rest.indexOf(before);
  return at < 0 ? [...rest, item] : [...rest.slice(0, at), item, ...rest.slice(at)];
};

/** The six dots of a drag handle, as in the mock-up. */
export const Grip: React.FC = () => (
  <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
    <circle cx="3" cy="3" r="1.1" />
    <circle cx="7" cy="3" r="1.1" />
    <circle cx="3" cy="7" r="1.1" />
    <circle cx="7" cy="7" r="1.1" />
    <circle cx="3" cy="11" r="1.1" />
    <circle cx="7" cy="11" r="1.1" />
  </svg>
);

/** Whether something from elsewhere (not this shelf's own chips) is being dragged over it. */
const useDropping = (shelf: ShelfName, target?: string): boolean => {
  const { active, over } = useDndContext();
  if (!active || !over || kindOf(active.id) === shelf) {
    return false;
  }
  const overId = String(over.id);
  return target !== undefined
    ? overId === dragId(shelf, target)
    : overId === dragId("shelf", shelf) || kindOf(overId) === shelf;
};

const ShelfChip: React.FC<{
  shelf: ShelfName;
  column: string;
  label: string;
  extra?: React.ReactNode;
  onRemove: () => void;
}> = ({ shelf, column, label, extra, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dragId(shelf, column),
  });
  const dropBefore = useDropping(shelf, column);
  return (
    <div
      ref={setNodeRef}
      className={
        "tui-shelfchip" + (isDragging ? " tui-dragging" : "") + (dropBefore ? " tui-drop" : "")
      }
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-column={column}
    >
      <span
        className="tui-shelfchip-name"
        {...attributes}
        {...listeners}
        aria-label={`${label} (drag to reorder)`}
        aria-roledescription="sortable"
      >
        <span className="tui-grip">
          <Grip />
        </span>
        <span className="tui-shelfchip-label">{label}</span>
      </span>
      {extra}
      <button
        type="button"
        className="tui-chipx"
        aria-label={`Remove ${label} from the ${shelf}`}
        onClick={onRemove}
      >
        <X size={12} strokeWidth={1.8} />
      </button>
    </div>
  );
};

const Shelf: React.FC<{
  shelf: ShelfName;
  title: string;
  columns: string[];
  empty: string;
  separator: string;
  chip: (column: string) => React.ReactNode;
}> = ({ shelf, title, columns, empty, separator, chip }) => {
  const { setNodeRef } = useDroppable({ id: dragId("shelf", shelf) });
  const dropping = useDropping(shelf);
  return (
    <section className="tui-vs-shelfsec">
      <div className="tui-lbl" aria-hidden="true">
        {title}
      </div>
      <div
        ref={setNodeRef}
        className={
          "tui-shelf" + (columns.length === 0 ? " tui-empty" : "") + (dropping ? " tui-drop" : "")
        }
        role="group"
        aria-label={title}
      >
        {columns.length === 0 ? <span className="tui-hint">{empty}</span> : null}
        <SortableContext items={columns.map((c) => dragId(shelf, c))} strategy={rectSortingStrategy}>
          {columns.map((c, i) => (
            <React.Fragment key={c}>
              {i > 0 ? (
                <span className="tui-shelfsep" aria-hidden="true">
                  {separator}
                </span>
              ) : null}
              {chip(c)}
            </React.Fragment>
          ))}
        </SortableContext>
      </div>
    </section>
  );
};

export const Shelves: React.FC<{
  schema: Schema;
  viewParams: ViewParams;
  stateRef: StateRef<AppState>;
}> = ({ schema, viewParams, stateRef }) => {
  const sortKey = viewParams.sortKey;
  return (
    <div className="tui-vs-shelves">
      <Shelf
        shelf="pivot"
        title="Pivot"
        columns={viewParams.vpivots}
        empty="Drag a column here, or tick Pivot below"
        separator="›"
        chip={(c) => (
          <ShelfChip
            key={c}
            shelf="pivot"
            column={c}
            label={schema.displayName(c)}
            onRemove={() => actions.togglePivot(c, stateRef)}
          />
        )}
      />
      <Shelf
        shelf="sort"
        title="Sort"
        columns={sortKey.map(([c]) => c)}
        empty="Drag a column here, or click Sort below"
        separator="then"
        chip={(c) => {
          const asc = sortKey.find(([k]) => k === c)![1];
          const name = schema.displayName(c);
          return (
            <ShelfChip
              key={c}
              shelf="sort"
              column={c}
              label={name}
              onRemove={() => actions.toggleSort(c, stateRef)}
              extra={
                <button
                  type="button"
                  className="tui-dirb"
                  aria-label={`Sort ${name} ${asc ? "descending" : "ascending"}`}
                  title={asc ? "Ascending: click for descending" : "Descending: click for ascending"}
                  onClick={() => actions.setSortDir(c, !asc, stateRef)}
                >
                  {asc ? (
                    <ArrowUp size={11} strokeWidth={2} />
                  ) : (
                    <ArrowDown size={11} strokeWidth={2} />
                  )}
                  {asc ? "asc" : "desc"}
                </button>
              }
            />
          );
        }}
      />
    </div>
  );
};
