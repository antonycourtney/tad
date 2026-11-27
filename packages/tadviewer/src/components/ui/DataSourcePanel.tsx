/*
 * The new UI's data sources panel: a tree of the data sources (databases,
 * schemas, tables, folders and files), with a search box. Clicking a table
 * or file opens it; the open one is highlighted.
 *
 * Folders load their contents when first opened, so the search covers what
 * has been loaded: the sources, and the folders opened so far.
 */
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { mutableGet, StateRef } from "oneref";
import {
  DataSourceConnection,
  DataSourceId,
  DataSourceKind,
  DataSourceNode,
  DataSourcePath,
  DataSourceProviderName,
} from "reltab";
import { throttle } from "lodash";
import * as actions from "../../actions";
import { AppState } from "../../AppState";
import { Search } from "./icons";
import "./ui.css";

export interface DataSourcePanelProps {
  expanded: boolean;
  stateRef: StateRef<AppState>;
  /** The open table or file. */
  openPath: DataSourcePath | null;
}

interface TreeNode {
  key: string;
  dsc: DataSourceConnection;
  path: DataSourcePath;
  node: DataSourceNode;
  depth: number;
}

const sourceKey = (id: DataSourceId) => `${id.providerName}\u0000${id.resourceId}`;

export const pathKey = (p: DataSourcePath) => [sourceKey(p.sourceId), ...p.path].join("\u0000");

const PROVIDER_NAMES: Record<DataSourceProviderName, string> = {
  "aws-athena": "Athena",
  bigquery: "BigQuery",
  duckdb: "DuckDB",
  sqlite: "SQLite",
  snowflake: "Snowflake",
  localfs: "",
  motherduck: "MotherDuck",
};

/** A top-level source's note: the folder it's in, or its engine. */
const sourceNote = (id: DataSourceId): string => {
  if (id.providerName === "localfs") {
    const sep = id.resourceId.includes("\\") ? "\\" : "/";
    const parts = id.resourceId.split(sep);
    return parts.length > 1 ? parts.slice(0, -1).join(sep) : "";
  }
  return PROVIDER_NAMES[id.providerName] ?? id.providerName;
};

/** One of the mock-up's 16-unit line icons. */
const Glyph: React.FC<{ size: number; stroke: number; children: React.ReactNode }> = ({
  size,
  stroke,
  children,
}) => (
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

/** The kind of node, as the mock-up draws it. */
const KindIcon: React.FC<{ kind: DataSourceKind }> = ({ kind }) => {
  switch (kind) {
    case "DataSource":
    case "Database":
      return (
        <Glyph size={14} stroke={1.3}>
          <ellipse cx="8" cy="3.75" rx="5" ry="1.75" />
          <path d="M3 3.75v8.5c0 .97 2.24 1.75 5 1.75s5-.78 5-1.75v-8.5" />
          <path d="M3 8c0 .97 2.24 1.75 5 1.75S13 8.97 13 8" />
        </Glyph>
      );
    case "Dataset":
      return (
        <Glyph size={14} stroke={1.3}>
          <path d="M8 2.5 14 5.5 8 8.5 2 5.5z" />
          <path d="m2 8.5 6 3 6-3M2 11.25l6 3 6-3" />
        </Glyph>
      );
    case "Table":
      return (
        <Glyph size={14} stroke={1.3}>
          <rect x="2.5" y="3" width="11" height="10" rx="1.25" />
          <path d="M2.5 6.5h11M2.5 9.75h11M6.5 6.5V13" />
        </Glyph>
      );
    case "Directory":
      return (
        <Glyph size={14} stroke={1.3}>
          <path d="M2 4.5c0-.55.45-1 1-1h3.2l1.5 1.5H13c.55 0 1 .45 1 1v6c0 .55-.45 1-1 1H3c-.55 0-1-.45-1-1z" />
        </Glyph>
      );
    default:
      return (
        <Glyph size={14} stroke={1.3}>
          <path d="M4 2.5h5l3 3v8H4z" />
          <path d="M9 2.5v3h3" />
        </Glyph>
      );
  }
};

const isOpenable = (node: DataSourceNode) => node.kind === "Table" || node.kind === "File";

export const DataSourcePanel: React.FC<DataSourcePanelProps> = ({
  expanded,
  stateRef,
  openPath,
}) => {
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [children, setChildren] = useState<Map<string, TreeNode[]>>(new Map());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const known = useRef<Map<string, TreeNode>>(new Map());
  const childrenRef = useRef(children);
  childrenRef.current = children;

  const load = async (t: TreeNode): Promise<TreeNode[]> => {
    const cached = childrenRef.current.get(t.key);
    if (cached) {
      return cached;
    }
    setLoading((s) => new Set(s).add(t.key));
    try {
      const nodes = await t.dsc.getChildren(t.path);
      const kids = nodes.map((node) => {
        const path = { ...t.path, path: t.path.path.concat([node.id]) };
        return { key: pathKey(path), dsc: t.dsc, path, node, depth: t.depth + 1 };
      });
      setChildren((m) => new Map(m).set(t.key, kids));
      return kids;
    } catch (err) {
      console.error("error loading data source children: ", err);
      return [];
    } finally {
      setLoading((s) => {
        const next = new Set(s);
        next.delete(t.key);
        return next;
      });
    }
  };

  const setExpanded = (t: TreeNode, expand: boolean) => {
    if (expand) {
      load(t);
    }
    setOpen((s) => {
      const next = new Set(s);
      if (expand) {
        next.add(t.key);
      } else {
        next.delete(t.key);
      }
      return next;
    });
  };

  // Look for new sources (such as a file opened since) as the app changes:
  const refresh = useRef(
    throttle(async () => {
      const rtc = mutableGet(stateRef).rtc;
      try {
        const ids = await rtc.getDataSources();
        let added = false;
        const next = await Promise.all(
          ids.map(async (sourceId) => {
            const k = sourceKey(sourceId);
            let t = known.current.get(k);
            if (!t) {
              const dsc = await rtc.connect(sourceId);
              const node = await dsc.getRootNode();
              const path: DataSourcePath = { sourceId, path: ["."] };
              t = { key: pathKey(path), dsc, path, node, depth: 0 };
              known.current.set(k, t);
              added = true;
              if (node.isContainer) {
                setExpanded(t, true);
              }
            }
            return t;
          })
        );
        if (added) {
          setRoots(next);
        }
      } catch (err) {
        console.error("error refreshing data sources: ", err);
      }
    }, 500)
  );
  useEffect(() => {
    refresh.current();
  });

  // The rows to show: the open folders' contents or, when searching, the
  // matches and the folders they're in.
  const q = search.trim().toLowerCase();
  const rows: TreeNode[] = [];
  const matches = (t: TreeNode): boolean =>
    t.node.displayName.toLowerCase().includes(q) ||
    (children.get(t.key) ?? []).some(matches);
  const walk = (ts: TreeNode[]) => {
    for (const t of ts) {
      if (q !== "" && !matches(t)) {
        continue;
      }
      rows.push(t);
      const kids = children.get(t.key);
      if (kids && (q !== "" || open.has(t.key))) {
        walk(kids);
      }
    }
  };
  walk(roots);

  const openKey = openPath ? pathKey(openPath) : null;
  const current = rows.find((t) => t.key === focusKey) ?? rows.find((t) => t.key === openKey) ?? rows[0];

  const activate = (t: TreeNode) => {
    setFocusKey(t.key);
    if (isOpenable(t.node)) {
      actions.openDataSourcePath(t.path, stateRef);
    } else if (t.node.isContainer) {
      setExpanded(t, !open.has(t.key));
    }
  };

  const focusRow = (t: TreeNode | undefined) => {
    if (t) {
      setFocusKey(t.key);
      // (by position: the keys contain NULs, which selectors can't match)
      treeRef.current?.querySelectorAll<HTMLElement>(".tui-dsrow")[rows.indexOf(t)]?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!current || !(e.target as HTMLElement).matches(".tui-dsrow")) {
      return;
    }
    const i = rows.indexOf(current);
    const isOpen = q !== "" || open.has(current.key);
    switch (e.key) {
      case "ArrowDown":
        focusRow(rows[i + 1]);
        break;
      case "ArrowUp":
        focusRow(rows[i - 1]);
        break;
      case "Home":
        focusRow(rows[0]);
        break;
      case "End":
        focusRow(rows[rows.length - 1]);
        break;
      case "ArrowRight":
        if (current.node.isContainer && !isOpen) {
          setExpanded(current, true);
        } else if (current.node.isContainer) {
          focusRow(rows[i + 1]?.depth > current.depth ? rows[i + 1] : undefined);
        }
        break;
      case "ArrowLeft":
        if (current.node.isContainer && isOpen && q === "") {
          setExpanded(current, false);
        } else {
          const parent = rows
            .slice(0, i)
            .reverse()
            .find((t) => t.depth < current.depth);
          focusRow(parent);
        }
        break;
      case "Enter":
      case " ":
        activate(current);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <aside
      className={
        "sidebar tad-ui tui-sidebar " + (expanded ? "sidebar-expanded" : "sidebar-collapsed")
      }
      aria-label="Data sources"
    >
      <div className="sidebar-content">
        <div className="tui-dspanel">
          <div className="tui-lbl">Data sources</div>
          <label className="tui-search">
            <Search size={13} strokeWidth={1.6} />
            <input
              type="text"
              value={search}
              placeholder="Find a table or file"
              aria-label="Find a table or file"
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div
            ref={treeRef}
            className="tui-dstree"
            role="tree"
            aria-label="Data sources"
            onKeyDown={handleKeyDown}
          >
            {rows.map((t) => {
              const isOpen = q !== "" ? children.has(t.key) : open.has(t.key);
              const isCurrent = t.key === openKey;
              const note = t.depth === 0 ? sourceNote(t.path.sourceId) : "";
              return (
                <div
                  key={t.key}
                  role="treeitem"
                  aria-level={t.depth + 1}
                  aria-expanded={t.node.isContainer ? isOpen : undefined}
                  aria-selected={isCurrent}
                  aria-busy={loading.has(t.key) || undefined}
                  tabIndex={t === current ? 0 : -1}
                  className={"tui-dsrow" + (isCurrent ? " tui-current" : "")}
                  style={{ paddingLeft: 4 + t.depth * 14 }}
                  title={note ? `${t.node.displayName} (${note})` : undefined}
                  onClick={() => activate(t)}
                  onFocus={() => setFocusKey(t.key)}
                >
                  <span
                    className={"tui-dschev" + (isOpen ? " tui-open" : "")}
                    aria-hidden="true"
                    onClick={(e) => {
                      if (t.node.isContainer && q === "") {
                        e.stopPropagation();
                        setFocusKey(t.key);
                        setExpanded(t, !isOpen);
                      }
                    }}
                  >
                    {t.node.isContainer ? (
                      <Glyph size={13} stroke={1.7}>
                        <path d="m6.5 4.5 3.5 3.5-3.5 3.5" />
                      </Glyph>
                    ) : null}
                  </span>
                  <span className="tui-dsicon" aria-hidden="true">
                    <KindIcon kind={t.node.kind} />
                  </span>
                  <span className="tui-dsname">{t.node.displayName}</span>
                  {note ? (
                    // (rtl puts the ellipsis at the start; the mark keeps a leading "/" there)
                    <span className="tui-dsnote">{"\u200E" + note}</span>
                  ) : null}
                  {t.node.description ? <Description text={t.node.description} /> : null}
                </div>
              );
            })}
            {roots.length > 0 && rows.length === 0 ? (
              <div className="tui-hint" style={{ padding: "8px 4px" }}>
                Nothing loaded matches. Folders are searched once opened.
              </div>
            ) : null}
          </div>
          <div className="tui-hint">Click a table or file to open it.</div>
        </div>
      </div>
    </aside>
  );
};

/** The info icon, showing a node's description. */
const Description: React.FC<{ text: string }> = ({ text }) => (
  <Popover.Root>
    <Popover.Trigger asChild>
      <button
        type="button"
        className="tui-iconbtn tui-dsinfo"
        aria-label="Description"
        title={text}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Glyph size={13} stroke={1.4}>
          <circle cx="8" cy="8" r="5.75" />
          <path d="M8 7.25v3.75M8 5h.01" />
        </Glyph>
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        className="tad-ui tui-pop tui-narrow tui-dsdesc"
        side="right"
        align="start"
        sideOffset={6}
        collisionPadding={8}
        // Portal events bubble through React's tree, so keep this click from the row:
        onClick={(e) => e.stopPropagation()}
      >
        {text}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
);
