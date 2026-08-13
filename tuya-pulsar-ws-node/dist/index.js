"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
var events_1 = __importDefault(require("events"));
var ws_1 = __importDefault(require("ws"));
var config_1 = require("./config");
var utils_1 = require("./utils");
var TuyaMessageSubscribeWebsocket = /** @class */ (function () {
    function TuyaMessageSubscribeWebsocket(config) {
        this.config = Object.assign({
            ackTimeoutMillis: 3000,
            subscriptionType: 'Failover',
            retryTimeout: 1000,
            maxRetryTimes: 100,
            timeout: 30000,
            logger: console.log,
        }, config);
        this.event = new events_1.default();
        this.retryTimes = 0;
    }
    TuyaMessageSubscribeWebsocket.prototype.start = function () {
        this.server = this._connect();
    };
    TuyaMessageSubscribeWebsocket.prototype.open = function (cb) {
        this.event.on(TuyaMessageSubscribeWebsocket.open, cb);
    };
    TuyaMessageSubscribeWebsocket.prototype.message = function (cb) {
        this.event.on(TuyaMessageSubscribeWebsocket.data, cb);
    };
    TuyaMessageSubscribeWebsocket.prototype.ping = function (cb) {
        this.event.on(TuyaMessageSubscribeWebsocket.ping, cb);
    };
    TuyaMessageSubscribeWebsocket.prototype.pong = function (cb) {
        this.event.on(TuyaMessageSubscribeWebsocket.pong, cb);
    };
    TuyaMessageSubscribeWebsocket.prototype.reconnect = function (cb) {
        this.event.on(TuyaMessageSubscribeWebsocket.reconnect, cb);
    };
    TuyaMessageSubscribeWebsocket.prototype.ackMessage = function (messageId) {
        this.server && this.server.send(JSON.stringify({ messageId: messageId }));
    };
    TuyaMessageSubscribeWebsocket.prototype.error = function (cb) {
        this.event.on(TuyaMessageSubscribeWebsocket.error, cb);
    };
    TuyaMessageSubscribeWebsocket.prototype.close = function (cb) {
        this.event.on(TuyaMessageSubscribeWebsocket.close, cb);
    };
    TuyaMessageSubscribeWebsocket.prototype._reconnect = function () {
        var _this = this;
        if (this.config.maxRetryTimes && this.retryTimes < this.config.maxRetryTimes) {
            var timer_1 = setTimeout(function () {
                clearTimeout(timer_1);
                _this.retryTimes++;
                _this._connect(false);
            }, this.config.retryTimeout);
        }
    };
    TuyaMessageSubscribeWebsocket.prototype._connect = function (isInit) {
        if (isInit === void 0) { isInit = true; }
        var _a = this.config, accessId = _a.accessId, accessKey = _a.accessKey, env = _a.env, url = _a.url;
        var topicUrl = (0, utils_1.getTopicUrl)(url, accessId, (0, config_1.getTuyaEnvConfig)(env).value, "?".concat((0, utils_1.buildQuery)({ subscriptionType: 'Failover', ackTimeoutMillis: 30000 })));
        var password = (0, utils_1.buildPassword)(accessId, accessKey);
        this.server = new ws_1.default(topicUrl, {
            rejectUnauthorized: false,
            headers: { username: accessId, password: password },
        });
        this.subOpen(this.server, isInit);
        this.subMessage(this.server);
        this.subPing(this.server);
        this.subPong(this.server);
        this.subError(this.server);
        this.subClose(this.server);
        return this.server;
    };
    TuyaMessageSubscribeWebsocket.prototype.subOpen = function (server, isInit) {
        var _this = this;
        if (isInit === void 0) { isInit = true; }
        server.on('open', function () {
            if (server.readyState === server.OPEN) {
                _this.retryTimes = 0;
            }
            _this.keepAlive(server);
            _this.event.emit(isInit ? TuyaMessageSubscribeWebsocket.open : TuyaMessageSubscribeWebsocket.reconnect, _this.server);
        });
    };
    TuyaMessageSubscribeWebsocket.prototype.subPing = function (server) {
        var _this = this;
        server.on('ping', function () {
            _this.event.emit(TuyaMessageSubscribeWebsocket.ping, _this.server);
            _this.keepAlive(server);
            server.pong(_this.config.accessId);
        });
    };
    TuyaMessageSubscribeWebsocket.prototype.subPong = function (server) {
        var _this = this;
        server.on('pong', function () {
            _this.keepAlive(server);
            _this.event.emit(TuyaMessageSubscribeWebsocket.pong, _this.server);
        });
    };
    TuyaMessageSubscribeWebsocket.prototype.subMessage = function (server) {
        var _this = this;
        server.on('message', function (data) {
            try {
                _this.keepAlive(server);
                var start = Date.now();
                _this.logger('INFO', "receive msg, jsonMessage=".concat(data));
                var obj = _this.handleMessage(data);
                _this.logger('INFO', 'the real message data:', obj);
                _this.event.emit(TuyaMessageSubscribeWebsocket.data, _this.server, obj);
                var end = Date.now();
                _this.logger('INFO', "business processing cost=".concat(end - start));
            }
            catch (e) {
                _this.logger('ERROR', e);
                _this.event.emit(TuyaMessageSubscribeWebsocket.error, e);
            }
        });
    };
    TuyaMessageSubscribeWebsocket.prototype.subClose = function (server) {
        var _this = this;
        server.on('close', function () {
            var _a;
            var data = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                data[_i] = arguments[_i];
            }
            _this._reconnect();
            _this.clearKeepAlive();
            (_a = _this.event).emit.apply(_a, __spreadArray([TuyaMessageSubscribeWebsocket.close], data, false));
        });
    };
    TuyaMessageSubscribeWebsocket.prototype.subError = function (server) {
        var _this = this;
        server.on('error', function (e) {
            _this.event.emit(TuyaMessageSubscribeWebsocket.error, _this.server, e);
        });
    };
    TuyaMessageSubscribeWebsocket.prototype.clearKeepAlive = function () {
        clearTimeout(this.timer);
    };
    TuyaMessageSubscribeWebsocket.prototype.keepAlive = function (server) {
        var _this = this;
        this.clearKeepAlive();
        this.timer = setTimeout(function () {
            server.ping(_this.config.accessId);
        }, this.config.timeout);
    };
    TuyaMessageSubscribeWebsocket.prototype.handleMessage = function (data) {
        var _a = JSON.parse(data), payload = _a.payload, properties = _a.properties, others = __rest(_a, ["payload", "properties"]);
        var encryptyModel = properties.em;
        var pStr = Buffer.from(payload, 'base64').toString('utf-8');
        var pJson = JSON.parse(pStr);
        pJson.data = (0, utils_1.decrypt)(pJson.data, this.config.accessKey, encryptyModel);
        return __assign({ payload: pJson }, others);
    };
    TuyaMessageSubscribeWebsocket.prototype.logger = function (level) {
        var _a;
        var info = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            info[_i - 1] = arguments[_i];
        }
        var realInfo = "".concat(Date.now(), " ");
        this.config.logger && (_a = this.config).logger.apply(_a, __spreadArray([level, realInfo], info, false));
    };
    TuyaMessageSubscribeWebsocket.URL = config_1.TuyaRegionConfigEnum;
    TuyaMessageSubscribeWebsocket.env = config_1.TUYA_PASULAR_ENV;
    TuyaMessageSubscribeWebsocket.data = 'TUTA_DATA';
    TuyaMessageSubscribeWebsocket.error = 'TUYA_ERROR';
    TuyaMessageSubscribeWebsocket.open = 'TUYA_OPEN';
    TuyaMessageSubscribeWebsocket.close = 'TUYA_CLOSE';
    TuyaMessageSubscribeWebsocket.reconnect = 'TUYA_RECONNECT';
    TuyaMessageSubscribeWebsocket.ping = 'TUYA_PING';
    TuyaMessageSubscribeWebsocket.pong = 'TUYA_PONG';
    return TuyaMessageSubscribeWebsocket;
}());
exports.default = TuyaMessageSubscribeWebsocket;
