export type Cluster = 'devnet' | 'testnet' | 'mainnet-beta';

export type SolanaApiOptions = {
    baseUrl: string;
    connectPath: string;
    depositPath: string;
}

export type TjwtPayload = {
    discordId: string
    telegramId?: undefined
    chain: "solana" | "evm"
    cluster: Cluster
    programId: string
    mint: string
    api: SolanaApiOptions
} | {
    discordId?: undefined
    telegramId: string
    chain: "solana" | "evm"
    cluster: Cluster
    programId: string
    mint: string
    api: SolanaApiOptions
}

export type SolanaInstanceOptions = {
    token: string;
    config?: undefined
} | {
    token?: undefined;
    config: {
        discordId: string
        telegramId?: undefined
        chain: "solana" | "evm"
        cluster: Cluster
        programId: string
        mint: string
        api: SolanaApiOptions
        jwt?: string
    } | {
        discordId?: undefined
        telegramId: string
        chain: "solana" | "evm"
        cluster: Cluster
        programId: string
        mint: string
        api: SolanaApiOptions
        jwt?: string
    }
}

export type SolanaApiResponse<T> = {
    success: true;
    data: T;
    error: undefined;
} | {
    success: false;
    data: undefined;
    error: string;
}


export type SolanaDepositResponse = SolanaApiResponse<{
    signature: string,
    message: string,
}>

export type SolanaConnectResponse = SolanaApiResponse<{
    discordId: string,
    walletAddress: string,
    message: string,
}>

export type SolanaDepositPayload = {
    mint: string,
    amount: number,
    sender: string,
    tx: string,
}

export type SolanaConnectPayload = {
    walletAddress: string,
    signature: string,
    message: string,
}

export type TConnectResponse = {
    success: true,
    data: {
        discordId: string,
        walletAddress: string,
        message: string,
    },
    error: undefined,
} | {
    success: false,
    data: undefined,
    error: string,
}

export type TDepositResponse = {
    success: true,
    data: {
        signature: string,
        message: string,
    },
    error: undefined,
} | {
    success: false,
    data: undefined,
    error: string,
}

export type TLoadProgramResponse = { success: true, error: undefined } | { success: false, error: string }

export type TGetBalanceResponse = {
    success: true,
    error: undefined,
    balance: number,
} | {
    success: false,
    error: string,
    balance: 0,
}

export type TGetOrCreateAtaResponse = {
    success: true,
    data: {
        ata: string,
        sig?: string,
    },
    error: undefined,
} | {
    success: false,
    data: undefined,
    error: string,
}
