// This class aims to standardize settings (both extension any anything else from dconf)

// realTimeObj holds the actual object of the settings in question
// infoObj holds the specification: {settingName: type, ...} (in this extension those are located in constants.js)
// staticObj holds a static representation of the key-value pairs in realTimeObj (more efficient gets)
    // it is updated any time a change to a setting in realTimeObj occurs
// eventIdsArr as the title suggests holds the event ids for all events mapped to the realTimeObj

import * as styler from "./styler.js";

export default class Settings {
    // Set instance variables to params provided
    constructor(realTimeObj, infoObj, extensionInst=null) {
        this.realTimeObj = realTimeObj;
        this.infoObj = infoObj;
        this.extensionInst = extensionInst;
        this.isExtensionSettings = (extensionInst===null) ? false : true;
        this._init();
    }

    // Set the non-param-dependant instance vars, populate staticObj, and add change events to all settings in infoObj (to update staticObj)
    _init() {
        this.staticObj = {};
        this.eventIdsArr = [];
        for (let settingName in this.infoObj) {
            this._update_static_setting(settingName);
            this._add_update_static_settings_event(settingName);
            if (this.isExtensionSettings) {
                this._add_style_update_event(settingName);
            }
        }
    }

    destroy() {
        this.eventIdsArr.forEach(eventId => {
            this.realTimeObj.disconnect(eventId);
        });
        this.eventIdsArr = null;

        this.realTimeObj = null;
        this.infoObj = null;
        this.extensionInst = null;
        this.isExtensionSettings = null;
        this.staticObj = null;
    }

    // Get the value of a setting using the staticObj
    get(settingName) {
        return this.staticObj[settingName];
    }

    // When another class adds an event (to realTimeObj), it can use this method to append the id to eventIdsArr
    // Those events are usually things more concrete and technical than the _add_update_static_settings_event we have on here
    // Such as updating icon size in workspace buttons when setting is changed, which requires the actual workspace buttons class to properly implement
    add_event_id(eventId) {
        this.eventIdsArr.push(eventId);
    }
    
    rm_all_events() {
        this.eventIdsArr.forEach(eventId => {
            this.realTimeObj.disconnect(eventId);
        });
        this.eventIdsArr = [];
    }

    _add_update_static_settings_event(settingName) {
        let eventId = this.realTimeObj.connect(`changed::${settingName}`, ()=>{
            this._update_static_setting(settingName);
        });
        this.eventIdsArr.push(eventId);
    }

    _add_style_update_event(settingName) {
        let eventId = this.realTimeObj.connect(`changed::${settingName}`, ()=>{
            styler.update_style(this.extensionInst);
        });
        this.eventIdsArr.push(eventId);
    }

    _update_static_setting(settingName) {
        let type = this.infoObj[settingName];
        if (type=="i") this.staticObj[settingName] = this.realTimeObj.get_int(settingName);
        else if (type=="s") this.staticObj[settingName] = this.realTimeObj.get_string(settingName);
        else if (type=="b") this.staticObj[settingName] = this.realTimeObj.get_boolean(settingName);
    }
}
