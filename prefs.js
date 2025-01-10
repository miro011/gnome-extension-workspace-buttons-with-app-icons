import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class Prefs extends ExtensionPreferences {

    fillPreferencesWindow(window) {
        this.settings = this.getSettings();
        let rowsArr;

        // Create Preferences Page
        let preferencesPage = new Adw.PreferencesPage();

        // Appearance Settings
        let appearanceGroup = new Adw.PreferencesGroup({title: _('Appearance Settings'),});
        rowsArr = [
            this.get_int_spin_row('workspace-button-spacing', 'Workspace Button Spacing', 'Set the spacing (right margin) between the workspace buttons (0px to 50px)', 0, 50),
            this.get_int_spin_row('workspace-number-font-size', 'Workspace Number Font Size', 'Set the font size of the workspace numbers (10px to 96px)', 10, 96),
            this.get_int_spin_row('app-icon-size', 'Icon Size', 'Set the size of the app icons (10px to 96px)', 10, 96),
            this.get_color_picker_row('active-workspace-color', 'Active Workspace Color', 'Set the color of the active workspace')
        ];
        for (let row of rowsArr) {
            appearanceGroup.add(row);
        }

        // Behavior Settings
        let behaviorGroup = new Adw.PreferencesGroup({title: _('Behavior Settings'),});
        rowsArr = [
            this.get_toggle_row('container-scroll-to-switch-workspace', 'Scroll To Switch Workspace', 'Turn off to prevent conflicts with extensions that enable workspace scrolling on the whole panel.')
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
    }

    get_int_spin_row(dconfKey, title, subtitle, min, max, increment=1) {
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
            value: this.settings.get_int(dconfKey),
        });

        // spinBtn.set_tooltip_text(_('blah.'));

        spinBtn.connect('value-changed', sb => {
            this.settings.set_int(dconfKey, sb.get_value_as_int());
        });

        row.add_suffix(spinBtn);
        row.activatable_widget = spinBtn;

        return row;
    }

    get_color_picker_row(dconfKey, title, subtitle) {
        let row = new Adw.ActionRow({
            title: _(title),
            subtitle: _(subtitle),
        });

        let colorButton = new Gtk.ColorButton({
            rgba: this.get_rgba_color_from_hex(this.settings.get_string(dconfKey)),
        });

        // colorButton.set_tooltip_text(_('blah.'));

        colorButton.connect('color-set', cb => {
            const rgba = cb.get_rgba();
            this.settings.set_string(dconfKey, this.get_hex_color_from_rgba(rgba));
        });

        row.add_suffix(colorButton);
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

    get_toggle_row(dconfKey, title, subtitle) {
        let row = new Adw.ActionRow({
            title: _(title),
            subtitle: _(subtitle),
        });
    
        // Create the toggle switch
        let toggle = new Gtk.Switch({
            active: this.settings.get_boolean(dconfKey),
            valign: Gtk.Align.CENTER, // Center vertically within the row
        });

        // toggle.set_tooltip_text(_('blah.'));
    
        // Connect the 'state-set' signal to update the setting
        toggle.connect('state-set', (tg, state) => {
            this.settings.set_boolean(dconfKey, state); // Save the new state to settings
        });
    
        row.add_suffix(toggle);
        row.activatable_widget = toggle;
    
        return row;
    }
    
}