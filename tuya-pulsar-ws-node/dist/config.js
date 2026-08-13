"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTuyaEnvConfig = exports.TuyaEnvConfig = exports.TUYA_PASULAR_ENV = exports.TuyaRegionConfigEnum = void 0;
var TuyaRegionConfigEnum;
(function (TuyaRegionConfigEnum) {
    TuyaRegionConfigEnum["CN"] = "wss://mqe.tuyacn.com:8285/";
    TuyaRegionConfigEnum["US"] = "wss://mqe.tuyaus.com:8285/";
    TuyaRegionConfigEnum["EU"] = "wss://mqe.tuyaeu.com:8285/";
    TuyaRegionConfigEnum["IN"] = "wss://mqe.tuyain.com:8285/";
})(TuyaRegionConfigEnum = exports.TuyaRegionConfigEnum || (exports.TuyaRegionConfigEnum = {}));
var TUYA_PASULAR_ENV;
(function (TUYA_PASULAR_ENV) {
    TUYA_PASULAR_ENV["PROD"] = "prod";
    TUYA_PASULAR_ENV["TEST"] = "test";
})(TUYA_PASULAR_ENV = exports.TUYA_PASULAR_ENV || (exports.TUYA_PASULAR_ENV = {}));
exports.TuyaEnvConfig = Object.freeze((_a = {},
    _a[TUYA_PASULAR_ENV.PROD] = {
        name: TUYA_PASULAR_ENV.PROD,
        value: 'event',
        desc: 'online environment',
    },
    _a[TUYA_PASULAR_ENV.TEST] = {
        name: TUYA_PASULAR_ENV.TEST,
        value: 'event-test',
        desc: 'test environment',
    },
    _a));
function getTuyaEnvConfig(env) {
    return exports.TuyaEnvConfig[env];
}
exports.getTuyaEnvConfig = getTuyaEnvConfig;
