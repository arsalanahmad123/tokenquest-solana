import { PublicKey } from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Buffer } from 'buffer';
import type { TjwtPayload } from './types';

export class SolanaUtils {
    private programID: PublicKey;
    constructor(programID: PublicKey) {
        this.programID = programID;
    }

    getSolPda(seeds: (string | PublicKey)[]) {
        return PublicKey.findProgramAddressSync(
            seeds.map((seed) =>
                typeof seed === "string" ? Buffer.from(seed) : seed.toBuffer()
            ),
            this.programID
        );
    }

    getStatePda() {
        return this.getSolPda(["state"])[0]
    }

    getAta = async (user: PublicKey, mint: PublicKey): Promise<PublicKey> => {
        return getAssociatedTokenAddressSync(
            mint,
            user,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
    }
}

export const decodeJwt = (jwt: string): TjwtPayload => {
    const parsed = JSON.parse(atob(jwt.split('.')[1]));
    if (!parsed.discordId || !parsed.cluster || !parsed.programId || !parsed.mint || !parsed.api) {
        throw new Error("Invalid JWT");
    }
    return parsed;
}
