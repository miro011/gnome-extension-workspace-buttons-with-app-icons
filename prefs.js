import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class Prefs extends ExtensionPreferences {

    fillPreferencesWindow(window) {
        let group;
        let rowsArr;

        let settings = this.getSettings();


        let workspaceButtonsPage = new Adw.PreferencesPage({title: 'STYLE: Workspace Buttons'});

        group = new Adw.PreferencesGroup({title: _('Workspace Buttons'),});
        rowsArr = [
            this.get_int_spin_row(settings, 'wsb-ws-btn-spacing', 'Distance Between Buttons', '', 0, 50),
            this.get_int_spin_row(settings, 'wsb-ws-btn-vert-spacing', 'Space On Top and Bottom', '', 0, 50),
            this.get_int_spin_row(settings, 'wsb-ws-btn-roundness', 'Roundness', '', 0, 50)
        ];
        for (let row of rowsArr) group.add(row);
        workspaceButtonsPage.add(group);

        group = new Adw.PreferencesGroup({title: _('Numbers Section'),});
        rowsArr = [
            this.get_toggle_row(settings, 'wsb-ws-num-show', 'Show?', ''),
            this.get_int_spin_row(settings, 'wsb-ws-num-font-size', 'Font Size', '', 5, 100),
            this.get_int_spin_row(settings, 'wsb-ws-num-spacing', 'Spacing (Horizontal)', 'The space to the left and right of the number', 0, 100),
            this.get_color_picker_row(settings, 'wsb-ws-num-active-color', 'Active Background Color', 'Set the background color of the number for the active workspace'),
            this.get_color_picker_row(settings, 'wsb-ws-num-inactive-color', 'Inactive Background Color', 'Set the background color of inactive workspace/s number')
        ];
        for (let row of rowsArr) group.add(row);
        workspaceButtonsPage.add(group);

        group = new Adw.PreferencesGroup({title: _('Icons Section'),});
        rowsArr = [
            this.get_int_spin_row(settings, 'wsb-ws-app-icon-size', 'Icon Size', '', 5, 100),
            this.get_int_spin_row(settings, 'wsb-ws-app-icon-spacing', 'Distance Between Icons', '', 0, 50),
            this.get_int_spin_row(settings, 'wsb-ws-app-icons-wrapper-spacing', 'Space Left/Right Of Icons Wrapper', 'The space left and right of all icons as a whole', 0, 50),
            this.get_toggle_row(settings, 'wsb-ws-app-icons-desaturate', 'Desaturate?', ''),
            this.get_color_picker_row(settings, 'wsb-ws-app-icons-wrapper-active-color', 'Active Background Color', ''),
            this.get_color_picker_row(settings, 'wsb-ws-app-icons-wrapper-inactive-color', 'Inactive Background Color', '')
        ];
        for (let row of rowsArr) group.add(row);
        workspaceButtonsPage.add(group);


        group = new Adw.PreferencesGroup({title: _('BEHAVIOR'),});
        rowsArr = [
            this.get_toggle_row(settings, 'wsb-container-scroll-to-switch-workspace', 'Scroll To Switch Workspace', 'Turn off to prevent conflicts with extensions that enable workspace scrolling on the whole panel.'),
            this.get_toggle_row(settings, 'wsb-middle-click-ignores-clicked-workspace', 'Middle Click Ignores Newly Selected Workspace', 'The overview will open for the current workspace, no matter where in the container you click.'),
            this.get_toggle_row(settings, 'wsb-right-click-ignores-clicked-workspace', 'Right Click Ignores Newly Selected Workspace', 'The window switcher will open for the current workspace, no matter where in the container you click.'),
            this.get_int_spin_row(settings, 'wsb-generate-window-icon-timeout', 'Generate Window Icon Timeout', 'Extension uses the window-created event to detect newly opened windows, which fires instantly. On Wayland, with apps running under the xwayland layer, the icon is not available right away due to lag. To make up for this, we wait a bit. 200ms works great for me. If icons are still not properly generated for you, increase it. You can also try lowering this if you want.', 0, 1000),
        ]
        for (let row of rowsArr) group.add(row);
        workspaceButtonsPage.add(group);


        // Add Group to Page and Page to the Window
        window.add(workspaceButtonsPage);

        //window.set_default_size(750, 580);
        // comment above and uncomment below to make window adaptable
        window.set_resizable(true);

        // Explicitly release settings reference just in case
        window.connect('close-request', () => {
            settings = null;
        });
    }

    get_int_spin_row(settings, dconfKey, title, subtitle, min, max, increment = 1) {
        let row = new Adw.ActionRow({
            title: _(title),
            subtitle: _(subtitle),
        });
    
        let spinBtn = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: min,
                upper: max,
                step_increment: increment,
            }),
            valign: Gtk.Align.CENTER, // Center vertically within the row
            value: settings.get_int(dconfKey),
        });
    
        spinBtn.connect('value-changed', sb => {
            settings.set_int(dconfKey, sb.get_value_as_int());
        });
    
        // Add reset button
        let resetButton = new Gtk.Button({
            icon_name: 'view-refresh-symbolic', // Refresh icon
            tooltip_text: _('Reset to default'),
            valign: Gtk.Align.CENTER,
        });
        resetButton.connect('clicked', () => {
            const defaultValue = settings.get_default_value(dconfKey).deep_unpack();
            settings.set_int(dconfKey, defaultValue);
            spinBtn.set_value(defaultValue);
        });
    
        row.add_suffix(spinBtn);
        row.add_suffix(resetButton);
        row.activatable_widget = spinBtn;
    
        return row;
    }    

    get_color_picker_row(settings, dconfKey, title, subtitle) {
        let row = new Adw.ActionRow({
            title: _(title),
            subtitle: _(subtitle),
        });
    
        let colorButton = new Gtk.ColorButton({
            rgba: this.get_rgba_color_from_hex(settings.get_string(dconfKey)),
            valign: Gtk.Align.CENTER, // Center vertically within the row
        });
    
        colorButton.connect('color-set', cb => {
            const rgba = cb.get_rgba();
            settings.set_string(dconfKey, this.get_hex_color_from_rgba(rgba));
        });
    
        // Add reset button
        let resetButton = new Gtk.Button({
            icon_name: 'view-refresh-symbolic', // Refresh icon
            tooltip_text: _('Reset to default'),
            valign: Gtk.Align.CENTER,
        });
        resetButton.connect('clicked', () => {
            const defaultValue = settings.get_default_value(dconfKey).deep_unpack();
            settings.set_string(dconfKey, defaultValue);
            colorButton.set_rgba(this.get_rgba_color_from_hex(defaultValue));
        });
    
        row.add_suffix(colorButton);
        row.add_suffix(resetButton);
        row.activatable_widget = colorButton;
    
        return row;
    }
    
    // Helper: Parse a hex color string to a Gdk.RGBA object
    get_rgba_color_from_hex(hex) {
        const rgba = new Gdk.RGBA();
        rgba.parse(hex);
        return rgba;
    }
    // Helper: Convert a Gdk.RGBA object to a hex string
    get_hex_color_from_rgba(rgba) {
        const r = Math.round(rgba.red * 255).toString(16).padStart(2, '0');
        const g = Math.round(rgba.green * 255).toString(16).padStart(2, '0');
        const b = Math.round(rgba.blue * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }

    get_toggle_row(settings, dconfKey, title, subtitle) {
        let row = new Adw.ActionRow({
            title: _(title),
            subtitle: _(subtitle),
        });
    
        let toggle = new Gtk.Switch({
            active: settings.get_boolean(dconfKey),
            valign: Gtk.Align.CENTER, // Center vertically within the row
        });
    
        toggle.connect('state-set', (tg, state) => {
            settings.set_boolean(dconfKey, state);
        });
    
        // Add reset button
        let resetButton = new Gtk.Button({
            icon_name: 'view-refresh-symbolic', // Refresh icon
            tooltip_text: _('Reset to default'),
            valign: Gtk.Align.CENTER,
        });
        resetButton.connect('clicked', () => {
            const defaultValue = settings.get_default_value(dconfKey).deep_unpack();
            settings.set_boolean(dconfKey, defaultValue);
            toggle.set_active(defaultValue);
        });
    
        row.add_suffix(toggle);
        row.add_suffix(resetButton);
        row.activatable_widget = toggle;
    
        return row;
    }    
}