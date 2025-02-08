import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import St from 'gi://St';

export default class Topbars {
    constructor() {
        this._init();
    }

    _init() {
        this.containersArr = [];
        this.mainMonitorIndex = Main.layoutManager.primaryMonitor.index;
    }

    destroy() {
        for (let i=0; i<this.containersArr.length; i++) {
            if (i === this.mainMonitorIndex) continue;

            // Eject shared actors before destroying the container (otherwise destroy() is recursive and would wipe out the date and quick settings applets completely)
            this.containersArr[i].get_children().forEach(child => {
                this.containersArr[i].remove_child(child); // Detaches the actor without destroying it
            });

            this.containersArr[i].destroy();
        }
        this.containersArr = null;
        this.mainMonitorIndex = null;
    }

    //////////////////////////////////////

    add_topbar(monitorIndex) {
        log(`Adding topbar for index ${monitorIndex}`);
        if (monitorIndex === this.mainMonitorIndex) {
            this.containersArr.push(Main.panel);
        }
        else {
            let monitorObj = Main.layoutManager.monitors[monitorIndex];
            let panel = new SidePanel(monitorObj);
            this.containersArr.push(panel);
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