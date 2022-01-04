import * as updater from "./updater";
import * as appWindow from "./appWindow";
import * as quickStart from "./quickStart";
import electron, { MenuItem, BrowserWindow } from "electron";

const Menu = electron.Menu;
const isDarwin = process.platform === "darwin";
let appMenu: electron.Menu | null = null;
const separatorMenuItem = {
  type: "separator",
};

const aboutTadMenuItem = () => {
  return {
    label: "About Tad",
    role: "about",
  };
};

const checkForUpdateMenuItem = () => {
  return {
    label: "Check for Updates",
    click: updater.checkForUpdates,
  };
};

export const createMenu = () => {
  const fileSubmenu = [
    {
      label: "New Tad Window",
      accelerator: "CmdOrCtrl+N",
      click: (item: any, focusedWindow: BrowserWindow) => {
        appWindow.newWindow(focusedWindow);
      },
    },

    {
      label: "Open...",
      accelerator: "CmdOrCtrl+O",
      click: (item: any, focusedWindow: BrowserWindow) => {
        appWindow.openDialog(focusedWindow);
      },
    },
    separatorMenuItem,
    {
      label: "Save As...",
      accelerator: "Shift+CmdOrCtrl+S",
      click: (
        item: MenuItem,
        focusedWindow: BrowserWindow,
        event: KeyboardEvent
      ) => {
        appWindow.saveAsDialog();
      },
    },
    {
      label: "Export Filtered CSV...",
      click: (
        item: MenuItem,
        focusedWindow: BrowserWindow,
        event: KeyboardEvent
      ) => {
        appWindow.exportFiltered(focusedWindow);
      },
    },
  ];

  if (!isDarwin) {
    fileSubmenu.push(separatorMenuItem);
    fileSubmenu.push({
      type: "quit",
    });
  }

  const editSubmenu = [
    {
      role: "copy",
    },
  ];
  const debugSubmenu = [
    {
      role: "toggledevtools",
    },
    {
      label: "Show Hidden Columns",
      type: "checkbox",
      click: (
        item: MenuItem,
        focusedWindow: BrowserWindow,
        event: KeyboardEvent
      ) => {
        console.log("show hidden...: ", item);
        focusedWindow.webContents.send("set-show-hidden-cols", item.checked);
      },
    },
  ];
  let helpSubmenu = [
    {
      label: "Quick Start Guide",
      click: (
        item: MenuItem,
        focusedWindow: BrowserWindow,
        event: KeyboardEvent
      ) => {
        quickStart.showQuickStart();
      },
    },
    {
      label: "Send Feedback / Bug Reports",
      click: (
        item: MenuItem,
        focusedWindow: BrowserWindow,
        event: KeyboardEvent
      ) => {
        electron.shell.openExternal("mailto:tad-feedback@tadviewer.com");
      },
    },
  ];
  const template = [
    {
      label: "File",
      submenu: fileSubmenu,
    },
    {
      label: "Edit",
      submenu: editSubmenu,
    },
  ];

  if (process.env.NODE_ENV === "development") {
    template.push({
      label: "Debug",
      submenu: debugSubmenu as any,
    });
  }

  template.push({
    label: "Help",
    submenu: helpSubmenu,
  });

  if (isDarwin) {
    template.unshift({
      label: "Tad",
      // ignored on Mac OS; comes from plist
      submenu: [
        aboutTadMenuItem(),
        separatorMenuItem,
        checkForUpdateMenuItem(),
        separatorMenuItem,
        {
          role: "quit",
        },
      ] as any,
    });
  }

  let oldMenu = appMenu;
  appMenu = Menu.buildFromTemplate(template as any);
  Menu.setApplicationMenu(appMenu);
};
