import Gio from 'gi://Gio';
import * as Main from "resource:///org/gnome/shell/ui/main.js";

export function update_style(rendererInst) {
    let baseFile = rendererInst.extensionInst.dir.get_child('stylesheet-base.css');
    let [success, rawContents] = baseFile.load_contents(null);

    if (!success) {
        log('styler.js => Failed to read base stylesheet');
        return;
    }

    let text = new TextDecoder().decode(rawContents);
    let moddedText = text.replace(/\{\{(.+?)\}\}/g, (match, innerText) => {
        let settingName = match.replace(/[\{\}]/g, "");
        return rendererInst.extSettings.get(settingName);
    });

    //log(moddedText);

    let stylesheetFile = rendererInst.extensionInst.dir.get_child('stylesheet.css');
    stylesheetFile.replace_contents(
        new TextEncoder().encode(moddedText),
        null, // etag
        false, // atomic
        Gio.FileCreateFlags.REPLACE_EXISTING, // Overwrite if exists, create if not
        null // cancellable
    );
    //log('styler.js => Successfully wrote modified CSS to stylesheet.css');

    // Reload the stylesheet
    Main.loadTheme();
    //log('styler.js => Triggered stylesheet reload');
}