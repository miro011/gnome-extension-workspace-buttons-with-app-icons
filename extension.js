import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as AltTab from "resource:///org/gnome/shell/ui/altTab.js";

import Renderer from "./renderer.js";

export default class WorkspaceIndicatorExtension extends Extension {
    enable() {
        Main.panel.statusArea['activities']?.hide();
        let dateMenu = Main.panel.statusArea.dateMenu;
        if (dateMenu) {
            Main.panel._centerBox.remove_child(dateMenu.container);
            Main.panel._rightBox.add_child(dateMenu.container);
        }
    
        // Override _getWindowList to only get windows from current monitor
        this.originalGetWindowListFunc = AltTab.WindowSwitcherPopup.prototype._getWindowList;
        //log(this.originalGetWindowListFunc);
        let originalGetWindowListFunc = this.originalGetWindowListFunc;
        AltTab.WindowSwitcherPopup.prototype._getWindowList = function() {
            const monitor = global.display.get_current_monitor();
            const windows = originalGetWindowListFunc.call(this).filter(w => w.get_monitor() === monitor);
            //log("Filtered windows:", windows.map(w => w.get_title()));
            return windows;
        };
        

        this.extSettingsRealTimeObj = this.getSettings();
        this.renderer = new Renderer(this.extSettingsRealTimeObj);
    }

    disable() {
        Main.panel.statusArea['activities']?.show();
        let dateMenu = Main.panel.statusArea.dateMenu;
        if (dateMenu) {
            Main.panel._rightBox.remove_child(dateMenu.container);
            Main.panel._centerBox.insert_child_at_index(dateMenu.container, -1);
        }

        // Restore the original _getWindowList method
        AltTab.WindowSwitcherPopup.prototype._getWindowList = this.originalGetWindowListFunc;
        this.originalGetWindowListFunc = null;

        this.renderer.destroy();
        this.renderer = null;
        this.extSettingsRealTimeObj = null;
    }
}