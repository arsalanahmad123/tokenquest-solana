import { SonlanaApi, type ISolanaApi } from './api';
import {
    BN,
    type Idl,
    type Provider,
    Program,
    AnchorProvider,
    Program as AnchorProgram,
    web3,
} from '@coral-xyz/anchor';
import {
    Connection,
    PublicKey,
    clusterApiUrl,
    Transaction,
} from '@solana/web3.js';
import { Buffer } from 'buffer';
import { decodeJwt, SolanaUtils } from './utils';
import type {
    SolanaInstanceOptions,
    TConnectResponse,
    TGetBalanceResponse,
    TGetOrCreateAtaResponse,
    TLoadProgramResponse,
    Cluster,
} from './types';
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountInstruction,
    TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

export class SolanaInstance {
    private type: 'Discord' | 'Telegram';
    id: string;
    programId: string;
    private api: ISolanaApi;
    private cluster: Cluster;
    private mint: PublicKey;

    connection!: Connection;
    provider!: AnchorProvider;
    program!: AnchorProgram;
    idl!: Idl;

    utils!: SolanaUtils;

    constructor({ token, config }: SolanaInstanceOptions) {
        if (!token && !config) {
            throw new Error('Token or config is required');
        }

        const { api, chain, cluster, discordId, telegramId, mint, programId } =
            token ? decodeJwt(token) : config!;

        if (chain !== 'solana') {
            throw new Error('Invalid chain');
        }
        if (!discordId && !telegramId) {
            throw new Error('Discord ID or Telegram ID is required');
        }

        this.api = new SonlanaApi(api, token || config?.jwt);
        this.id = (discordId || telegramId) as string;
        this.type = discordId ? 'Discord' : 'Telegram';
        this.programId = programId;
        this.cluster = cluster;
        this.mint = new PublicKey(mint);

        this.utils = new SolanaUtils(new PublicKey(programId));
    }

    loadProgram = async (): Promise<TLoadProgramResponse> => {
        const wallet = (window as any).solana;
        if (!wallet) {
            return { success: false, error: 'Solana wallet not found' };
        }

        await wallet.connect();

        this.connection = new Connection(
            clusterApiUrl(this.cluster),
            'confirmed'
        );

        this.provider = new AnchorProvider(this.connection, wallet, {
            commitment: 'confirmed',
        });

        const programId = new PublicKey(this.programId);

        const idl = await Program.fetchIdl(programId, this.provider);
        if (!idl) {
            return { success: false, error: 'IDL not found' };
        }

        // Verify instruction exists
        const hasFundSpl = idl.instructions.some(
            (ix) => ix.name === 'fundSpl' || ix.name === 'fund_spl'
        );

        if (!hasFundSpl) {
            return {
                success: false,
                error: 'Program does not implement fund_spl',
            };
        }

        this.idl = idl;
        this.program = new Program(idl, this.provider);

        return { success: true, error: undefined };
    };

    connect = async (): Promise<TConnectResponse> => {
        if (!this.program) {
            const loadProgram = await this.loadProgram();
            if (!loadProgram.success) {
                return {
                    success: false,
                    error: loadProgram.error,
                    data: undefined,
                };
            }
        }
        const wallet = (window as any).solana;

        const ataRes = await this.getOrCreateAta();
        if (!ataRes.success) {
            return { success: false, error: ataRes.error, data: undefined };
        }

        const message = `Link this Solana wallet to my ${this.type} ID: ${this.id}`;
        const encodedMessage = new TextEncoder().encode(message);
        const signedMessage = await wallet.signMessage(encodedMessage, 'utf8');

        const signature = Buffer.from(signedMessage.signature).toString(
            'base64'
        );

        const apiResponse = await this.api.connect({
            walletAddress: this.program.provider.wallet!.publicKey!.toBase58(),
            signature: signature,
            message,
        });

        if (!apiResponse.success) {
            return {
                success: false,
                error: apiResponse.error,
                data: undefined,
            };
        }

        return { success: true, error: undefined, data: apiResponse.data };
    };

    deposit = async (amount: number) => {
        if (!this.program) {
            const loadProgram = await this.loadProgram();
            if (!loadProgram.success) {
                return {
                    success: false,
                    error: loadProgram.error,
                    data: undefined,
                };
            }
        }
        if (!this.program.provider?.wallet?.publicKey) {
            return {
                success: false,
                error: 'Wallet not connected',
                data: undefined,
            };
        }
        const wallet = this.program.provider.wallet;

        const spl = amount * 1e9;

        const tx = await this.program.methods
            .fundSpl(new BN(spl))
            .accounts({
                user: wallet.publicKey,
                mint: this.mint,
            })
            .transaction();

        tx.feePayer = wallet.publicKey;
        tx.recentBlockhash = (
            await this.program.provider.connection.getLatestBlockhash()
        ).blockhash;
        // @ts-ignore
        const { signature } = await (
            window as any
        )?.solana?.signAndSendTransaction(tx);
        const latestBlockhash =
            await this.program.provider.connection.getLatestBlockhash();
        await this.program.provider.connection.confirmTransaction({
            signature,
            ...latestBlockhash,
        });

        const res = await this.api.deposit({
            amount: amount,
            mint: this.mint.toBase58(),
            sender: wallet.publicKey!.toBase58(),
            tx: signature,
        });

        return res;
    };

    getBalance = async (): Promise<TGetBalanceResponse> => {
        if (!this.program) {
            const loadProgram = await this.loadProgram();
            if (!loadProgram.success) {
                return { success: false, error: loadProgram.error, balance: 0 };
            }
        }
        try {
            const ata = await this.utils.getAta(
                this.program.provider.wallet?.publicKey!,
                this.mint
            );

            const balance =
                await this.program.provider.connection.getTokenAccountBalance(
                    ata
                );

            return {
                balance: balance?.value?.uiAmount || 0,
                success: true,
                error: undefined,
            };
        } catch (err: any) {
            return {
                success: false,
                error: err?.message || JSON.stringify(err),
                balance: 0,
            };
        }
    };

    getOrCreateAta = async (
        program?: AnchorProgram
    ): Promise<TGetOrCreateAtaResponse> => {
        try {
            let publicKey: PublicKey;
            let wallet: Provider['wallet'];
            let connection: Provider['connection'];
            if (program) {
                publicKey = program.provider.wallet?.publicKey!;
                wallet = program.provider.wallet!;
                connection = program.provider.connection!;
            } else {
                if (!this.program) {
                    return {
                        success: false,
                        error: 'Program not loaded',
                        data: undefined,
                    };
                }
                publicKey = this.program.provider.wallet?.publicKey!;
                wallet = this.program.provider.wallet!;
                connection = this.program.provider.connection!;
            }

            const ata = await this.utils.getAta(publicKey, this.mint);

            const accountInfo = await connection.getAccountInfo(ata);
            if (accountInfo) {
                return {
                    success: true,
                    data: { ata: ata.toBase58() },
                    error: undefined,
                };
            }

            const ix = createAssociatedTokenAccountInstruction(
                wallet.publicKey,
                ata,
                wallet.publicKey,
                this.mint,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            );

            const tx = new Transaction().add(ix);
            tx.feePayer = wallet.publicKey;
            tx.recentBlockhash = (
                await connection.getLatestBlockhash()
            ).blockhash;
            const signedTx = await wallet.signTransaction(tx);

            if (!signedTx.signature) {
                return {
                    success: false,
                    error: 'Transaction not signed',
                    data: undefined,
                };
            }

            const sig = await web3.sendAndConfirmRawTransaction(
                connection,
                signedTx.serialize(),
                {
                    commitment: 'confirmed',
                }
            );

            return {
                success: true,
                data: { ata: ata.toBase58(), sig },
                error: undefined,
            };
        } catch (e: any) {
            return {
                success: false,
                error: e?.message || JSON.stringify(e),
                data: undefined,
            };
        }
    };
}
