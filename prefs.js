import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class Prefs extends ExtensionPreferences {

    fillPreferencesWindow(window) {
        let settings = this.getSettings();
        let rowsArr;

        // Create Preferences Page
        let preferencesPage = new Adw.PreferencesPage();

        // Appearance Settings
        let appearanceGroup = new Adw.PreferencesGroup({title: _('Appearance Settings'),});
        rowsArr = [
            this.get_int_spin_row(settings, 'wsb-button-spacing', 'Workspace Button Spacing', 'Set the spacing (right margin) between the workspace buttons', 0, 50),
            this.get_toggle_row(settings, 'wsb-show-workspace-number', 'Show Workspace Numbers', 'You can hide the numbers to save some space'),
            this.get_int_spin_row(settings, 'wsb-number-font-size', 'Workspace Number Font Size', 'Set the font size of the workspace numbers', 5, 100),
            this.get_int_spin_row(settings, 'wsb-icon-size', 'Icon Size', 'Set the size of the app icons', 5, 100),
            this.get_int_spin_row(settings, 'wsb-icon-spacing', 'Icon Spacing', 'Set the spacing (right margin) between the icons shown in each workspace', 0, 50),
            this.get_color_picker_row(settings, 'wsb-active-button-background-color', 'Active Workspace Button Background Color', 'Set the background color of the active workspace button'),
            this.get_color_picker_row(settings, 'wsb-inactive-button-background-color', 'Inactive Workspace Button Background Color', 'Set the background color of inactive workspace buttons'),
            this.get_color_picker_row(settings, 'wsb-active-workspace-number-background-color', 'Active Workspace Number Background Color', 'Set the background color of the number for the active workspace'),
            this.get_color_picker_row(settings, 'wsb-inactive-workspace-number-background-color', 'Active Workspace Number Background Color', 'Set the background color of inactive workspace/s number')
        ];
        for (let row of rowsArr) {
            appearanceGroup.add(row);
        }

        // Behavior Settings
        let behaviorGroup = new Adw.PreferencesGroup({title: _('Behavior Settings'),});
        rowsArr = [
            this.get_toggle_row(settings, 'wsb-container-scroll-to-switch-workspace', 'Scroll To Switch Workspace', 'Turn off to prevent conflicts with extensions that enable workspace scrolling on the whole panel.'),
            this.get_toggle_row(settings, 'wsb-middle-click-ignores-clicked-workspace', 'Middle Click Ignores Newly Selected Workspace', 'The overview will open for the current workspace, no matter where in the container you click.'),
            this.get_toggle_row(settings, 'wsb-right-click-ignores-clicked-workspace', 'Right Click Ignores Newly Selected Workspace', 'The window switcher will open for the current workspace, no matter where in the container you click.')
        ]
        for (let row of rowsArr) {
            behaviorGroup.add(row);
        }

        // Add Group to Page and Page to the Window
        preferencesPage.add(appearanceGroup);
        preferencesPage.add(behaviorGroup);
        window.add(preferencesPage);

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