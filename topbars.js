import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

export default class Topbars {
    constructor() {
        this.containersArr = [];
        this.mainMonitorIndex = Main.layoutManager.primaryMonitor.index;
    }

    _rm_top_bars() {
        for (let i=0; i<this.containersArr.length; i++) {
            if (i === this.mainMonitorIndex) continue;

            // Eject shared actors before destroying the container (otherwise destroy() is recursive and would wipe out the date and quick settings applets completely)
            this.containersArr[i].get_children().forEach(child => {
                this.containersArr[i].remove_child(child); // Detaches the actor without destroying it
            });

            this.containersArr[i].destroy();
        }
    }

    destroy() {
        this._rm_top_bars();
        this.containersArr = null;
        this.mainMonitorIndex = null;
    }

    reset() {
        this._rm_top_bars();
        this.containersArr = [];
        this.mainMonitorIndex = Main.layoutManager.primaryMonitor.index;
    }

    //////////////////////////////////////

    add_topbar(monitorIndex) {
        if (monitorIndex === this.mainMonitorIndex) {
            this._add_orig_topbar();
        }
        else {
            let monitorObj = Main.layoutManager.monitors[monitorIndex];
            this._add_and_position_extra_topbar(monitorObj);
        }
    }

    // monitorObj needed for positioning purposes
    _add_and_position_extra_topbar(monitorObj) {
        // Create a new container for the top bar on this monitor
        let container = new St.BoxLayout({style_class: 'top-bar'});

        // Create layout sections for the top bar
        let leftBox = new St.BoxLayout({ style_class: 'left-box' });
        let rightBox = new St.BoxLayout({ style_class: 'right-box' });

        // Add the original quick settings to the right box
        let quickSettings = Main.panel.statusArea.quickSettings;
        if (quickSettings) {
            rightBox.add_child(quickSettings.container);
        }

        // Add the original date menu to the right box (after quick settings)
        let dateMenu = Main.panel.statusArea.dateMenu;
        if (dateMenu) {
            rightBox.add_child(dateMenu.container);
        }

        // Add the layout sections to the top bar
        container.add_child(leftBox);
        container.add_child(rightBox);

        // Position the top bar on the new monitor
        Main.layoutManager.addTopChrome(container);
        container.set_position(monitorObj.x, monitorObj.y);

        // Append to containersArr to keep track
        this.containersArr.push(container);
    }

    _add_orig_topbar() {
        this.containersArr.push(Main.panel);
    }

    //////////////////////////////////////

    append_workspace_buttons(monitorIndex, wsBtnsContainer) {
        if (monitorIndex === this.mainMonitorIndex) {
            this.containersArr[monitorIndex]._leftBox.insert_child_at_index(wsBtnsContainer, 0);
        }
        else {
            this.containersArr[monitorIndex].get_children()[0].add_child(wsBtnsContainer); // left box
        }
    }
}