export default class Settings {
    constructor(realTimeObj, infoObj) {
        this.realTimeObj = realTimeObj;
        this.infoObj = infoObj;
        this._init();
    }

    _init() {
        this.staticObj = {};
        this.eventIdsArr = [];
        for (let settingName in this.infoObj) {
            this._update_static_setting(settingName);
            this._add_update_static_settings_event(settingName);
        }
    }

    destroy() {
        this.eventIdsArr.forEach(eventId => {
            this.realTimeObj.disconnect(eventId);
        });
        this.eventIdsArr = null;

        this.realTimeObj = null;
        this.infoObj = null;
        this.staticObj = null;
    }

    get(settingName) {
        return this.staticObj[settingName];
    }

    add_event_id(eventId) {
        this.eventIdsArr.push(eventId);
    }

    // the change event updates static settings so we don't have to use the real time settings object (get_int() etc. is less efficient)
    _add_update_static_settings_event(settingName) {
        let eventId = this.realTimeObj.connect(`changed::${settingName}`, ()=>{
            this._update_static_setting(settingName);
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