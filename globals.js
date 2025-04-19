import Gio from 'gi://Gio';
import * as Main from "resource:///org/gnome/shell/ui/main.js";

export function update_stylesheet_and_reload_style(extensionInst) {
    let baseFile = extensionInst.dir.get_child('stylesheet-base.css');
    let [success, rawContents] = baseFile.load_contents(null);

    if (!success) {
        log('globals.js => update_stylesheet_and_reload_style => Failed to read base stylesheet');
        return;
    }

    let text = new TextDecoder().decode(rawContents);
    let moddedText = text.replace(/\{\{(.+?)\}\}/g, (match, innerText) => {
        let settingName = match.replace(/[\{\}]/g, "");
        return extensionInst.extSettings.get(settingName);
    });

    //log(moddedText);

    let stylesheetFile = extensionInst.dir.get_child('stylesheet.css');
    stylesheetFile.replace_contents(
        new TextEncoder().encode(moddedText),
        null, // etag
        false, // atomic
        Gio.FileCreateFlags.REPLACE_EXISTING, // Overwrite if exists, create if not
        null // cancellable
    );
    //log('globals.js => update_stylesheet_and_reload_style => Successfully wrote modified CSS to stylesheet.css');

    // Reload the stylesheet
    Main.loadTheme();
    //log('globals.js => update_stylesheet_and_reload_style => Triggered stylesheet reload');
}
