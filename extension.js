import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import Renderer from "./renderer.js";

export default class WorkspaceIndicatorExtension extends Extension {
    enable() {
        Main.panel.statusArea['activities']?.hide();
        let dateMenu = Main.panel.statusArea.dateMenu;
        if (dateMenu) {
            Main.panel._centerBox.remove_child(dateMenu.container);
            Main.panel._rightBox.add_child(dateMenu.container);
        }

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

        this.renderer.destroy();
        this.renderer = null;
        this.extSettingsRealTimeObj = null;
    }
}