import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as AltTab from "resource:///org/gnome/shell/ui/altTab.js";
import Gio from "gi://Gio";

import Renderer from "./renderer.js";
import Settings from "./settings.js";

const extensionSettingsInfoObj = {
    "top-bar-override-height": "b",
    "top-bar-height": "i",
    "top-bar-override-color": "b",
    "top-bar-color": "s",
    "top-bar-move-date-right": "b",
    "top-bar-indicator-spacing": "i",
    "top-bar-status-spacing": "i",
    "wsb-ws-btn-spacing": "i",
    "wsb-ws-btn-vert-spacing": "i",
    "wsb-ws-btn-roundness": "i",
    "wsb-ws-btn-border-width": "i",
    "wsb-ws-btn-border-active-color": "s",
    "wsb-ws-btn-border-inactive-color": "s",
    "wsb-ws-num-show": "b",
    "wsb-ws-num-font-size": "i",
    "wsb-ws-num-spacing": "i",
    "wsb-ws-num-active-color": "s",
    "wsb-ws-num-inactive-color": "s",
    "wsb-ws-app-icon-size": "i",
    "wsb-ws-app-icon-size-half": "i",
    "wsb-ws-app-icon-spacing": "i",
    "wsb-ws-app-icons-wrapper-spacing": "i",
    "wsb-ws-app-icons-desaturate": "b",
    "wsb-ws-app-icons-wrapper-active-color": "s",
    "wsb-ws-app-icons-wrapper-inactive-color": "s",
    "wsb-container-scroll-to-switch-workspace": "b",
    "wsb-middle-click-ignores-clicked-workspace": "b",
    "wsb-right-click-ignores-clicked-workspace": "b",
    "wsb-generate-window-icon-timeout": "i",
    "window-switcher-popup-show-windows-from-all-monitors": "b"
};
const mutterSettingsInfoObj = {
    "workspaces-only-on-primary": "b",
    "dynamic-workspaces": "b"
};

export default class WorkspaceIndicatorExtension extends Extension {
    enable() {
        Main.panel.statusArea['activities']?.hide();

        this.originalGetWindowListFunc = AltTab.WindowSwitcherPopup.prototype._getWindowList; // Override _getWindowList to only get windows from current monitor

        this.extSettings = new Settings(this.getSettings(), extensionSettingsInfoObj, this);
        this.mutterSettings = new Settings(new Gio.Settings({ schema: 'org.gnome.mutter' }), mutterSettingsInfoObj);

        

        this.renderer = new Renderer(this);
    }

    disable() {
        this.renderer.destroy();
        this.renderer = null;
        this.extSettings.destroy();
        this.extSettings = null;
        this.mutterSettings.destroy();
        this.mutterSettings = null;

        Main.panel.statusArea['activities']?.show();

        this.originalGetWindowListFunc = null;
    }
}
