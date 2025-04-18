import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as AltTab from "resource:///org/gnome/shell/ui/altTab.js";
import Gio from "gi://Gio";

import * as constants from "./constants.js";
import Renderer from "./renderer.js";
import Settings from "./settings.js";

export default class WorkspaceIndicatorExtension extends Extension {
    enable() {
        Main.panel.statusArea['activities']?.hide();
    
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

        this.extSettings = new Settings(this.getSettings(), constants.extensionSettingsInfoObj, this);
        this.mutterSettings = new Settings(new Gio.Settings({ schema: 'org.gnome.mutter' }), constants.mutterSettingsInfoObj);

        this.toggle_date_menu_position(1);

        this.renderer = new Renderer(this);
    }

    disable() {
        Main.panel.statusArea['activities']?.show();

        // Restore the original _getWindowList method
        AltTab.WindowSwitcherPopup.prototype._getWindowList = this.originalGetWindowListFunc;
        this.originalGetWindowListFunc = null;

        this.renderer.destroy();
        this.renderer = null;
        this.toggle_date_menu_position(0);
        this.extSettings.destroy();
        this.extSettings = null;
        this.mutterSettings.destroy();
        this.mutterSettings = null;
    }

    toggle_date_menu_position(manualState) {
        let dateMenu = Main.panel.statusArea.dateMenu;
        let moveRight = this.extSettings.get("top-bar-move-date-right");

        if ((manualState === 1 && moveRight) || (manualState === null && moveRight)) {
            if (dateMenu) {
                try {
                    Main.panel._centerBox.remove_child(dateMenu.container);
                    Main.panel._rightBox.add_child(dateMenu.container);
                }
                catch(err) {}
            }
        }
        else {
            if (dateMenu) {
                try {
                    Main.panel._rightBox.remove_child(dateMenu.container);
                    Main.panel._centerBox.insert_child_at_index(dateMenu.container, -1);
                }
                catch(err) {}
            }
        }
    }
}
