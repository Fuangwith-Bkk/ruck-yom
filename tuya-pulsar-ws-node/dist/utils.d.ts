export declare function getTopicUrl(websocketUrl: string, accessId: string, env: string, query: string): string;
export declare function buildQuery(query: {
    [key: string]: number | string;
}): string;
export declare function buildPassword(accessId: string, accessKey: string): string;
export declare function decrypt(data: string, accessKey: string, encryptyModel: string): any;
export declare function decryptByECB(data: string, accessKey: string): any;
export declare function decryptByGCM(data: string, accessKey: string): any;
export declare function encrypt(data: any, accessKey: string): string;
