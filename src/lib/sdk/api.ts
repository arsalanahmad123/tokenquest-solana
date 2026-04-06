import type { SolanaApiOptions, SolanaConnectPayload, SolanaConnectResponse, SolanaDepositPayload, SolanaDepositResponse } from "./types";

export interface ISolanaApi {
    connect(payload: SolanaConnectPayload): Promise<SolanaConnectResponse>;
    deposit(payload: SolanaDepositPayload): Promise<SolanaDepositResponse>;
}

export class SonlanaApi implements ISolanaApi {
    private baseUrl: string;
    private connectPath: string;
    private depositPath: string;
    private token?: string;

    constructor({ baseUrl, connectPath, depositPath }: SolanaApiOptions, token?: string) {
        this.token = token;
        if (!baseUrl.endsWith('/')) {
            baseUrl += '/';
        }
        this.baseUrl = baseUrl;

        if (connectPath.startsWith('/')) {
            connectPath = connectPath.slice(1);
        }
        this.connectPath = connectPath;

        if (depositPath.startsWith('/')) {
            depositPath = depositPath.slice(1);
        }
        this.depositPath = depositPath;
    }

    async connect(payload: SolanaConnectPayload): Promise<SolanaConnectResponse> {
        try {
            const response = await fetch(this.baseUrl + this.connectPath, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...payload,
                    token: this.token,
                }),
            });

            const data = await response.json();
            if (!data?.success) {
                return { success: false, data: undefined, error: data?.error || "Error connecting" };
            }

            return {
                success: true,
                data: {
                    discordId: data?.data?.discordId || data?.discordId,
                    walletAddress: data?.data?.walletAddress || data?.walletAddress,
                    message: data?.message
                },
                error: undefined
            };
        } catch (err: any) {
            console.log("Error Connecting: ", err);
            let error = err?.message || JSON.stringify(err);
            if (error?.response?.data?.error) {
                error = error?.response?.data?.error;
            }
            return { success: false, data: undefined, error };
        }
    }

    async deposit(payload: SolanaDepositPayload): Promise<SolanaDepositResponse> {
        try {
            const response = await fetch(this.baseUrl + this.depositPath, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...payload,
                    token: this.token,
                }),
            });

            const data = await response.json();

            return { success: true, data: data, error: undefined };
        } catch (err: any) {
            console.log("Error Depositing: ", err);

            let error = err?.message || JSON.stringify(err);
            if (error?.response?.data?.error) {
                error = error?.response?.data?.error;
            }

            return { success: false, data: undefined, error };
        }
    }
}
