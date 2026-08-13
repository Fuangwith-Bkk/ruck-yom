export declare enum TuyaRegionConfigEnum {
    CN = "wss://mqe.tuyacn.com:8285/",
    US = "wss://mqe.tuyaus.com:8285/",
    EU = "wss://mqe.tuyaeu.com:8285/",
    IN = "wss://mqe.tuyain.com:8285/"
}
export declare enum TUYA_PASULAR_ENV {
    PROD = "prod",
    TEST = "test"
}
export declare const TuyaEnvConfig: Readonly<{
    prod: {
        name: TUYA_PASULAR_ENV;
        value: string;
        desc: string;
    };
    test: {
        name: TUYA_PASULAR_ENV;
        value: string;
        desc: string;
    };
}>;
type IEnvConfig = typeof TuyaEnvConfig;
export declare function getTuyaEnvConfig<K extends keyof IEnvConfig>(env: TUYA_PASULAR_ENV): IEnvConfig[K];
export {};
