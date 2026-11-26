/*
 * The new UI's dialogs (export, export progress, and opening a table over
 * a changed view) and the loading overlay.
 */
import * as React from "react";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { StateRef } from "oneref";
import * as actions from "../../actions";
import {
  AppState,
  defaultParquetExportOptions,
  ExportFormat,
  ParquetExportOptions,
} from "../../AppState";
import { FolderOpen, X } from "./icons";
import "./ui.css";

const TadDialog: React.FC<{
  open: boolean;
  title: string;
  onClose?: () => void;
  /** The element to focus when it opens (by default, the first that can be). */
  initialFocus?: React.RefObject<HTMLElement>;
  children: React.ReactNode;
  footer: React.ReactNode;
}> = ({ open, title, onClose, initialFocus, children, footer }) => (
  <Dialog.Root open={open} onOpenChange={(o) => !o && onClose?.()}>
    <Dialog.Portal>
      <Dialog.Overlay className="tui-overlay" />
      <Dialog.Content
        className="tad-ui tui-dialog"
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => {
          if (initialFocus?.current) {
            e.preventDefault();
            initialFocus.current.focus();
          }
        }}
        onEscapeKeyDown={(e) => !onClose && e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <div className="tui-dialog-head">
          <Dialog.Title className="tui-dialog-title">{title}</Dialog.Title>
          {onClose ? (
            <Dialog.Close asChild>
              <button type="button" className="tui-iconbtn" aria-label="Close">
                <X size={14} strokeWidth={1.8} />
              </button>
            </Dialog.Close>
          ) : null}
        </div>
        <div className="tui-dialog-body">{children}</div>
        <div className="tui-dialog-foot">{footer}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

/** The number of rows the view's filter keeps, as text. */
const filteredRows = (appState: AppState): string => {
  const n = appState.viewState?.queryView?.filterRowCount;
  return n == null ? "" : n.toLocaleString(undefined, { useGrouping: true });
};

const FORMATS: [ExportFormat, string][] = [
  ["parquet", "Parquet"],
  ["csv", "CSV"],
];

const COMPRESSIONS = ["uncompressed", "snappy", "gzip", "zstd"];

export const ExportDialog: React.FC<{
  appState: AppState;
  stateRef: StateRef<AppState>;
  onBrowseExportPath?: (exportFormat: ExportFormat) => void;
  onExportFile?: (
    exportFormat: ExportFormat,
    exportPath: string,
    parquetExportOptions: ParquetExportOptions
  ) => void;
}> = ({ appState, stateRef, onBrowseExportPath, onExportFile }) => {
  const { exportBeginDialogOpen, exportPath, exportFormat } = appState;
  const [parquetOptions, setParquetOptions] = useState(defaultParquetExportOptions);
  const browseRef = React.useRef<HTMLButtonElement>(null);
  const exportRef = React.useRef<HTMLButtonElement>(null);
  const hasPath = exportPath != null && exportPath.length > 0;
  // After Choose… sets the path, Export is the next step:
  const choosing = React.useRef(false);
  React.useEffect(() => {
    if (choosing.current && hasPath) {
      choosing.current = false;
      exportRef.current?.focus();
    }
  }, [exportPath, hasPath]);
  const close = () => actions.setExportBeginDialogOpen(false, stateRef);
  const doExport = () => {
    if (hasPath) {
      close();
      onExportFile?.(exportFormat, exportPath, parquetOptions);
    }
  };
  return (
    <TadDialog
      open={exportBeginDialogOpen}
      title={`Export ${filteredRows(appState)} rows`}
      onClose={close}
      initialFocus={hasPath ? exportRef : browseRef}
      footer={
        <>
          <button type="button" className="tui-btn" onClick={close}>
            Cancel
          </button>
          <button
            ref={exportRef}
            type="button"
            className="tui-btn tui-primary"
            disabled={!hasPath}
            onClick={doExport}
          >
            Export
          </button>
        </>
      }
    >
      <div className="tui-field">
        <span className="tui-field-label" id="tui-export-format">
          File format
        </span>
        <div className="tui-seg" role="group" aria-labelledby="tui-export-format">
          {FORMATS.map(([f, label]) => (
            <button
              key={f}
              type="button"
              className="tui-segb"
              aria-pressed={exportFormat === f}
              onClick={() => actions.setExportFormat(f, stateRef)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <label className="tui-field">
        <span className="tui-field-label">Export to file</span>
        <span className="tui-row tui-flush">
          <input
            className="tui-input"
            type="text"
            value={exportPath ?? ""}
            spellCheck={false}
            onChange={(e) => actions.setExportPath(e.target.value, stateRef)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                doExport();
              }
            }}
          />
          <button
            ref={browseRef}
            type="button"
            className={"tui-btn" + (hasPath ? "" : " tui-primary")}
            onClick={() => {
              choosing.current = true;
              onBrowseExportPath?.(exportFormat);
            }}
          >
            <FolderOpen size={13} strokeWidth={1.8} /> Choose…
          </button>
        </span>
      </label>
      {exportFormat === "parquet" ? (
        <label className="tui-field">
          <span className="tui-field-label">Compression</span>
          <select
            className="tui-select"
            value={parquetOptions.compression}
            onChange={(e) => setParquetOptions({ compression: e.target.value as any })}
          >
            {COMPRESSIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </TadDialog>
  );
};

export const ExportProgressDialog: React.FC<{
  appState: AppState;
  stateRef: StateRef<AppState>;
}> = ({ appState, stateRef }) => {
  const { exportPercent, exportPathBaseName } = appState;
  const busy = exportPercent < 1;
  const okRef = React.useRef<HTMLButtonElement>(null);
  const close = () => actions.setExportProgressDialogOpen(false, "", stateRef);
  React.useEffect(() => {
    if (!busy) {
      okRef.current?.focus();
    }
  }, [busy]);
  return (
    <TadDialog
      open={appState.exportProgressDialogOpen}
      title="Export"
      onClose={busy ? undefined : close}
      footer={
        <button
          ref={okRef}
          type="button"
          className="tui-btn tui-primary"
          disabled={busy}
          onClick={close}
        >
          OK
        </button>
      }
    >
      <p className="tui-dialog-text" role="status">
        {busy ? "Exporting" : "Exported"} {filteredRows(appState)} rows to{" "}
        <b>{exportPathBaseName}</b>
        {busy ? "…" : "."}
      </p>
      <div
        className={"tui-progress" + (busy ? " tui-busy" : "")}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(exportPercent * 100)}
      >
        <span style={{ width: `${Math.max(4, exportPercent * 100)}%` }} />
      </div>
    </TadDialog>
  );
};

/** Asked when opening a table would replace a view that has changed. */
export const OpenTableDialog: React.FC<{
  open: boolean;
  onReplace: () => void;
  onNewWindow: () => void;
  onCancel: () => void;
}> = ({ open, onReplace, onNewWindow, onCancel }) => {
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  return (
    <TadDialog
      open={open}
      title="Open table"
      onClose={onCancel}
      initialFocus={cancelRef}
      footer={
        <>
          <button type="button" className="tui-btn" onClick={onReplace}>
            Replace this view
          </button>
          <button type="button" className="tui-btn" onClick={onNewWindow}>
            Open in a new window
          </button>
          <button
            ref={cancelRef}
            type="button"
            className="tui-btn tui-primary"
            onClick={onCancel}
          >
            Cancel
          </button>
        </>
      }
    >
      <p className="tui-dialog-text">
        This view has changes that aren't saved. Replacing it loses them.
      </p>
    </TadDialog>
  );
};

/** Covers the grid while a query takes a while. */
export const LoadingOverlay: React.FC<{ embedded: boolean }> = ({ embedded }) => (
  <div className="tad-ui tui-loading" role="status" aria-label="Loading">
    {embedded ? null : <span className="tui-spinner" />}
  </div>
);
