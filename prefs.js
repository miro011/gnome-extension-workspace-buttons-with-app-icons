import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class Prefs extends ExtensionPreferences {

    fillPreferencesWindow(window) {
        let settings = this.getSettings();

        // Create Preferences Page
        const preferencesPage = new Adw.PreferencesPage();

        // Create Preferences Group
        const preferencesGroup = new Adw.PreferencesGroup({
            title: _('Workspace Buttons Settings'),
        });

        // Icon Size Setting
        const iconSizeRow = new Adw.ActionRow({
            title: _('Icon Size'),
            subtitle: _('Set the size of the app icons (10px to 96px)'),
        });

        const iconSizeSpinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 96,
                step_increment: 1,
            }),
            value: settings.get_int('app-icon-size'),
        });

        iconSizeSpinButton.connect('value-changed', w => {
            settings.set_int('app-icon-size', w.get_value_as_int());
        });

        iconSizeRow.add_suffix(iconSizeSpinButton);
        iconSizeRow.activatable_widget = iconSizeSpinButton;

        // Workspace Number Font Size Setting
        const fontSizeRow = new Adw.ActionRow({
            title: _('Workspace Number Font Size'),
            subtitle: _('Set the font size of the workspace numbers (10px to 96px)'),
        });

        const fontSizeSpinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 96,
                step_increment: 1,
            }),
            value: settings.get_int('workspace-number-font-size'),
        });

        fontSizeSpinButton.connect('value-changed', w => {
            settings.set_int('workspace-number-font-size', w.get_value_as_int());
        });

        fontSizeRow.add_suffix(fontSizeSpinButton);
        fontSizeRow.activatable_widget = fontSizeSpinButton;

        // Active Workspace Color Setting
        const colorRow = new Adw.ActionRow({
            title: _('Active Workspace Color'),
            subtitle: _('Set the color of the active workspace'),
        });

        const colorButton = new Gtk.ColorButton({
            rgba: this._parseColor(settings.get_string('active-workspace-color')),
        });

        colorButton.connect('color-set', w => {
            const rgba = w.get_rgba();
            settings.set_string('active-workspace-color', this._colorToHex(rgba));
        });

        colorRow.add_suffix(colorButton);
        colorRow.activatable_widget = colorButton;

        // Add Rows to Group and Group to Page
        preferencesGroup.add(iconSizeRow);
        preferencesGroup.add(fontSizeRow);
        preferencesGroup.add(colorRow);
        preferencesPage.add(preferencesGroup);

        // Add Page to the Window
        window.add(preferencesPage);

        // Set Window Default Size
        window.set_default_size(750, 580);
    }

    // Helper: Parse a hex color string to a Gdk.RGBA object
    _parseColor(hex) {
        const rgba = new Gdk.RGBA();
        rgba.parse(hex);
        return rgba;
    }

    // Helper: Convert a Gdk.RGBA object to a hex string
    _colorToHex(rgba) {
        const r = Math.round(rgba.red * 255).toString(16).padStart(2, '0');
        const g = Math.round(rgba.green * 255).toString(16).padStart(2, '0');
        const b = Math.round(rgba.blue * 255).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }
}
