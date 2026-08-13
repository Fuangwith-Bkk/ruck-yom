"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = exports.decryptByGCM = exports.decryptByECB = exports.decrypt = exports.buildPassword = exports.buildQuery = exports.getTopicUrl = void 0;
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
var crypto_js_1 = require("crypto-js");
var crypto = require('crypto');
function getTopicUrl(websocketUrl, accessId, env, query) {
    return "".concat(websocketUrl, "ws/v2/consumer/persistent/").concat(accessId, "/out/").concat(env, "/").concat(accessId, "-sub").concat(query);
}
exports.getTopicUrl = getTopicUrl;
function buildQuery(query) {
    return Object.keys(query)
        .map(function (key) { return "".concat(key, "=").concat(encodeURIComponent(query[key])); })
        .join('&');
}
exports.buildQuery = buildQuery;
function buildPassword(accessId, accessKey) {
    var key = (0, crypto_js_1.MD5)(accessKey).toString();
    return (0, crypto_js_1.MD5)("".concat(accessId).concat(key)).toString().substr(8, 16);
}
exports.buildPassword = buildPassword;
function decrypt(data, accessKey, encryptyModel) {
    if (encryptyModel === "aes_gcm") {
        return decryptByGCM(data, accessKey);
    }
    else {
        return decryptByECB(data, accessKey);
    }
}
exports.decrypt = decrypt;
function decryptByECB(data, accessKey) {
    try {
        var realKey = crypto_js_1.enc.Utf8.parse(accessKey.substring(8, 24));
        var json = crypto_js_1.AES.decrypt(data, realKey, {
            mode: crypto_js_1.mode.ECB,
            padding: crypto_js_1.pad.Pkcs7,
        });
        var dataStr = crypto_js_1.enc.Utf8.stringify(json).toString();
        return JSON.parse(dataStr);
    }
    catch (e) {
        return '';
    }
}
exports.decryptByECB = decryptByECB;
function decryptByGCM(data, accessKey) {
    try {
        var bData = Buffer.from(data, 'base64');
        var iv = bData.slice(0, 12);
        var tag = bData.slice(-16);
        var cdata = bData.slice(12, bData.length - 16);
        var decipher = crypto.createDecipheriv('aes-128-gcm', accessKey.substring(8, 24), iv);
        decipher.setAuthTag(tag);
        var dataStr = decipher.update(cdata);
        dataStr += decipher.final('utf8');
        return JSON.parse(dataStr);
    }
    catch (e) {
        return '';
    }
}
exports.decryptByGCM = decryptByGCM;
function encrypt(data, accessKey) {
    try {
        var realKey = crypto_js_1.enc.Utf8.parse(accessKey.substring(8, 24));
        var realData = JSON.stringify(data);
        var retData = crypto_js_1.AES.encrypt(realData, realKey, {
            mode: crypto_js_1.mode.ECB,
            padding: crypto_js_1.pad.Pkcs7,
        }).toString();
        return retData;
    }
    catch (e) {
        return '';
    }
}
exports.encrypt = encrypt;
