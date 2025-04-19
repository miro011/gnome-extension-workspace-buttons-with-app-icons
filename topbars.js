import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

export default class Topbars {
    constructor(rendererInst) {
        this.rendererInst = rendererInst;
        this._init();
    }

    _init() {
        this.containersArr = [];
        // contains the style overrides that are achieved with just CSS
        this.styleOverrideKeyToCssClassObj = {
            "top-bar-override-height": "wsb-panel-class-override-height",
            "top-bar-override-color": "wsb-panel-class-override-color",
        };
        // this contains the schema keys for things that need manual handling
        this.styleOverrideKeysForManualArr = ["top-bar-move-date-right"];
        // an array of the keys from styleOverrideKeyToCssClassObj and items from otherStyleOverrideKeysArr for easielly adding the change event later on
        this.allStyleOverrideKeysArr = [...Object.keys(this.styleOverrideKeyToCssClassObj), ...this.styleOverrideKeysForManualArr];

    }

    destroy() {
        for (let i=0; i<this.containersArr.length; i++) {
            this.toggle_panel_style_overrides(0, this.containersArr[i]);

            if (i === this.rendererInst.mainMonitorIndex) {
                continue;
            }

            // Eject actors before destroying the container (otherwise destroy() is recursive and would wipe out the date and quick settings applets completely)
            this.containersArr[i].get_children().forEach(child => {
                this.containersArr[i].remove_child(child);
            });

            this.containersArr[i].destroy();
        }
        this.containersArr = null;
        this.rendererInst = null;
        this.styleOverrideKeyToCssClassObj = null;
        this.styleOverrideKeysForManualArr = null;
        this.allStyleOverrideKeysArr = null;
    }

    //////////////////////////////////////

    add_topbar(monitorIndex) {
        //log(`Adding topbar for index ${monitorIndex}`);
        if (monitorIndex === this.rendererInst.mainMonitorIndex) {
            this.toggle_panel_style_overrides(1, Main.panel);
            this.containersArr.push(Main.panel);
        }
        else {
            let monitorObj = Main.layoutManager.monitors[monitorIndex];
            let panel = new SidePanel(monitorObj);
            this.toggle_panel_style_overrides(1, panel);
            this.containersArr.push(panel);
        }

        for (let settingName of this.allStyleOverrideKeysArr) {
            let id;
            id = this.rendererInst.extensionInst.extSettings.realTimeObj.connect(`changed::${settingName}`, () => {
                for (let panel of this.containersArr) {
                    this.toggle_panel_style_overrides(1, panel);
                }
            });
            this.rendererInst.extensionInst.extSettings.add_event_id(id);
        }
    }

    toggle_panel_style_overrides(state, panel) {
        for (let settingName in this.styleOverrideKeyToCssClassObj) {
            let custClass = this.styleOverrideKeyToCssClassObj[settingName];
            panel.remove_style_class_name(custClass); // have to remove the style 
            if (state === 1 && this.rendererInst.extensionInst.extSettings.get(settingName) === true) {
                panel.add_style_class_name(custClass);
            }
        }

        for (let settingName of this.styleOverrideKeysForManualArr) {
            if (settingName === "top-bar-move-date-right" && panel === Main.panel) {
                let dateMenu = panel.statusArea.dateMenu;
                if (state === 1 && this.rendererInst.extensionInst.extSettings.get("top-bar-move-date-right") === true) {
                    try {
                        panel._centerBox.remove_child(dateMenu.container);
                        panel._rightBox.add_child(dateMenu.container);
                    }
                    catch(err) {}
                }
                else {
                    try {
                        panel._rightBox.remove_child(dateMenu.container);
                        panel._centerBox.insert_child_at_index(dateMenu.container, -1);
                    }
                    catch(err) {}
                }
            }
        }
    }

    //////////////////////////////////////

    append_workspace_buttons(monitorIndex, wsBtnsContainer) {
        this.containersArr[monitorIndex]._leftBox.insert_child_at_index(wsBtnsContainer, 0);
    }
}


const SidePanel = GObject.registerClass(
class SidePanel extends St.Widget {
    _init(monitor) {
        super._init({
            name: 'panel',
            reactive: true,
        });

        this._monitor = monitor;

        this._leftBox = new St.BoxLayout({name: 'panelLeft'});
        this.add_child(this._leftBox);
        this._centerBox = new St.BoxLayout({name: 'panelCenter'});
        this.add_child(this._centerBox);
        this._rightBox = new St.BoxLayout({name: 'panelRight'});
        this.add_child(this._rightBox);

        Main.uiGroup.add_child(this);
        Main.layoutManager.addChrome(this, {
            affectsInputRegion: true,
            affectsStruts: true, // **Important: This makes Mutter respect it**
        });
        this.set_position(this._monitor.x, this._monitor.y);
    }

    vfunc_get_preferred_width(_forHeight) {
        return [0, this._monitor.width];
    }

    vfunc_allocate(box) {
        this.set_allocation(box);

        let allocWidth = box.x2 - box.x1;
        let allocHeight = box.y2 - box.y1;

        let [, leftNaturalWidth] = this._leftBox.get_preferred_width(-1);
        let [, centerNaturalWidth] = this._centerBox.get_preferred_width(-1);
        let [, rightNaturalWidth] = this._rightBox.get_preferred_width(-1);

        let sideWidth, centerWidth;
        centerWidth = centerNaturalWidth;

        // get workspace area and center date entry relative to it
        let centerOffset = 0;

        let workArea = Main.layoutManager.getWorkAreaForMonitor(this._monitor.index);
        centerOffset = 2 * (workArea.x - this._monitor.x) + workArea.width - this._monitor.width;

        sideWidth = Math.max(0, (allocWidth - centerWidth + centerOffset) / 2);

        let childBox = new Clutter.ActorBox();

        childBox.y1 = 0;
        childBox.y2 = allocHeight;
        if (this.get_text_direction() === Clutter.TextDirection.RTL) {
            childBox.x1 = Math.max(
                allocWidth - Math.min(Math.floor(sideWidth), leftNaturalWidth),
                0);
            childBox.x2 = allocWidth;
        } else {
            childBox.x1 = 0;
            childBox.x2 = Math.min(Math.floor(sideWidth), leftNaturalWidth);
        }
        this._leftBox.allocate(childBox);

        childBox.x1 = Math.ceil(sideWidth);
        childBox.y1 = 0;
        childBox.x2 = childBox.x1 + centerWidth;
        childBox.y2 = allocHeight;
        this._centerBox.allocate(childBox);

        childBox.y1 = 0;
        childBox.y2 = allocHeight;
        if (this.get_text_direction() === Clutter.TextDirection.RTL) {
            childBox.x1 = 0;
            childBox.x2 = Math.min(Math.floor(sideWidth), rightNaturalWidth);
        } else {
            childBox.x1 = Math.max(
                allocWidth - Math.min(Math.floor(sideWidth), rightNaturalWidth),
                0);
            childBox.x2 = allocWidth;
        }
        this._rightBox.allocate(childBox);
    }
});