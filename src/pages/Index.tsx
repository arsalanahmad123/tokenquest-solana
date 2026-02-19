import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowDown, Wallet, CheckCircle2 } from 'lucide-react';

declare global {
    interface Window {
        TokenQuestSDK: any;
    }
}

type StatusType = 'info' | 'success' | 'error' | null;

// ── Brand Header ──────────────────────────────────────────────────────────────

function BrandHeader({
    logoUrl,
    brandName,
    platform,
}: {
    logoUrl: string | null;
    brandName: string;
    platform: string;
}) {
    return (
        <header
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '20px 24px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
        >
            {logoUrl ? (
                <img
                    src={decodeURIComponent(logoUrl)}
                    alt={brandName}
                    style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '1.5px solid rgba(255,255,255,0.12)',
                    }}
                />
            ) : (
                <div
                    style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background:
                            'linear-gradient(135deg, hsl(264,100%,64%) 0%, hsl(157,90%,51%) 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                    }}
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ width: '14px', height: '14px' }}
                    >
                        <path d="m12 19 7-7 3 3-7 7-3-3z" />
                        <path d="m18 13-7-7-3 3 7 7 3-3z" />
                        <path d="m12 7-7-7-3 3 7 7 3-3z" />
                    </svg>
                </div>
            )}
            <span
                style={{
                    fontFamily: '"Space Grotesk", "DM Sans", sans-serif',
                    fontWeight: 700,
                    fontSize: '15px',
                    letterSpacing: '0.04em',
                    color: 'rgba(255,255,255,0.95)',
                    textTransform: 'uppercase',
                }}
            >
                {brandName}
            </span>
            {platform && (
                <span
                    style={{
                        marginLeft: 'auto',
                        fontSize: '10px',
                        fontWeight: 600,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'rgba(255,255,255,0.4)',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '6px',
                        padding: '4px 8px',
                    }}
                >
                    via {platform}
                </span>
            )}
        </header>
    );
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ label, active }: { label: string; active: boolean }) {
    return (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: active ? 'hsl(157,90%,51%)' : 'rgba(255,255,255,0.35)',
                marginBottom: '20px',
            }}
        >
            <span
                style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: active
                        ? 'hsl(157,90%,51%)'
                        : 'rgba(255,255,255,0.2)',
                    boxShadow: active ? '0 0 8px hsl(157,90%,51%)' : 'none',
                    display: 'inline-block',
                    flexShrink: 0,
                }}
            />
            {label}
        </div>
    );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

const Spinner = () => (
    <div
        style={{
            width: '16px',
            height: '16px',
            border: '2px solid currentColor',
            borderRightColor: 'transparent',
            borderRadius: '50%',
            animation: 'tq-spin 0.7s linear infinite',
            flexShrink: 0,
        }}
    />
);

// ── Main Component ────────────────────────────────────────────────────────────

const Index = () => {
    const [searchParams] = useSearchParams();
    const [connected, setConnected] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [depositing, setDepositing] = useState(false);
    const [depositComplete, setDepositComplete] = useState(false);
    const [statusMsg, setStatusMsg] = useState<string | null>(null);
    const [statusType, setStatusType] = useState<StatusType>(null);

    const discordId = searchParams.get('discordId');
    const telegramId = searchParams.get('telegramId');
    const type = searchParams.get('type');
    const token = searchParams.get('token');
    const amountParam = searchParams.get('amount');
    const brandName = searchParams.get('brand') || 'TokenQuest';
    const logoUrl = searchParams.get('logo');
    const customHeading = searchParams.get('heading');

    const amount = amountParam ? parseFloat(amountParam) : null;
    const hasAmount = amount !== null && !isNaN(amount) && amount > 0;
    const userId = type === 'discord' ? discordId : telegramId;
    const isDeposit = !!amountParam;
    const platform =
        type === 'discord'
            ? 'Discord'
            : type === 'telegram'
              ? 'Telegram'
              : 'App';

    const solana = useMemo(() => {
        if (!token || !type || !userId || !window.TokenQuestSDK) return null;
        const baseUrl =
            type === 'discord'
                ? 'http://localhost:3000/api'
                : 'https://telegram-api.tokenquest.ca/api/v1';
        try {
            return new window.TokenQuestSDK.SolanaInstance({
                config: {
                    discordId: type === 'discord' ? userId : undefined,
                    telegramId: type === 'telegram' ? userId : undefined,
                    chain: 'solana',
                    cluster: 'testnet',
                    programId: '5fL6L5TN3WWo4st411Bw12pVZjLX5a7eQ4PzbiGPd6kA',
                    mint: 'BaoQjS6ySAPV4MZtA9rpdidq1ufJ5kwb7G6UqYoBE1rb',
                    api: {
                        baseUrl,
                        connectPath: 'solana/link-wallet',
                        depositPath: 'solana/complete-deposit',
                    },
                    jwt: token,
                },
            });
        } catch (err) {
            console.error('SDK Initialization failed:', err);
            return null;
        }
    }, [token, type, userId]);

    const getHeading = () => {
        if (customHeading) return customHeading;
        if (depositComplete) return 'Deposit confirmed';
        if (connected && hasAmount) return 'Confirm deposit';
        if (connected) return 'Wallet linked';
        if (isDeposit) return `Deposit via ${platform}`;
        return `Connect via ${platform}`;
    };

    const getDescription = () => {
        if (depositComplete)
            return `Your ${amountParam} SOL deposit is confirmed. Return to ${platform} now.`;
        if (connected && hasAmount)
            return `Review the amount below and confirm. Funds will be linked to your ${platform} account.`;
        if (connected)
            return `Your wallet is linked to your ${platform} account. You may close this window.`;
        if (isDeposit)
            return `Connect your Solana wallet to deposit ${amountParam} SOL.`;
        return `Link your Solana wallet to your ${platform} account for secure asset management.`;
    };

    const getStepLabel = () => {
        if (depositComplete) return 'Transaction Complete';
        if (depositing) return 'Confirming Deposit';
        if (connected && hasAmount) return 'Step 2 · Review & Deposit';
        if (connected) return 'Wallet Connected';
        if (isDeposit) return 'Step 1 · Connect to Deposit';
        return 'Step 1 · Connect Wallet';
    };

    const showStatus = useCallback((msg: string, t: StatusType) => {
        setStatusMsg(msg);
        setStatusType(t);
    }, []);

    const isInvalid =
        !token || !type || !userId || (amountParam !== null && !hasAmount);
    const invalidReason =
        !token || !type
            ? 'Invalid session. Please return to the source app.'
            : !userId
              ? `Please provide a valid ${type} ID.`
              : amountParam !== null && !hasAmount
                ? 'Invalid deposit amount.'
                : !solana
                  ? 'SDK failed to initialize.'
                  : null;

    useEffect(() => {
        if (invalidReason) showStatus(invalidReason, 'error');
    }, [invalidReason, showStatus]);

    const handleConnect = async () => {
        if (!solana) return;
        setConnecting(true);
        showStatus('Awaiting wallet approval…', 'info');
        try {
            const res = await solana.connect();
            if (!res?.success)
                throw new Error(res?.error || 'Connection failed');
            setConnected(true);
            showStatus('Wallet successfully linked!', 'success');
        } catch (err: any) {
            showStatus(err?.message || 'Connection failed', 'error');
        } finally {
            setConnecting(false);
        }
    };

    const handleDeposit = async () => {
        if (!solana || !amountParam) return;
        setDepositing(true);
        showStatus('Processing transaction…', 'info');
        try {
            const res = await solana.deposit(amountParam);
            if (!res?.success) throw new Error(res?.error || 'Deposit failed');
            setDepositComplete(true);
            showStatus(
                'Deposit successful! You may close this tab.',
                'success'
            );
        } catch (err: any) {
            showStatus(err?.message || 'Deposit failed', 'error');
        } finally {
            setDepositing(false);
        }
    };

    const statusColors = {
        info: {
            bg: 'rgba(255,255,255,0.04)',
            border: 'rgba(255,255,255,0.08)',
            text: 'rgba(255,255,255,0.7)',
        },
        success: {
            bg: 'rgba(52,211,153,0.08)',
            border: 'rgba(52,211,153,0.2)',
            text: 'hsl(157,90%,51%)',
        },
        error: {
            bg: 'rgba(239,68,68,0.08)',
            border: 'rgba(239,68,68,0.2)',
            text: 'hsl(0,72%,65%)',
        },
    };

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
                @keyframes tq-spin { to { transform: rotate(360deg); } }
                @keyframes tq-fade-up {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .tq-btn-primary {
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    border-radius: 14px;
                    background: rgba(255,255,255,0.95);
                    color: #050505;
                    padding: 14px 20px;
                    font-size: 14px;
                    font-weight: 700;
                    font-family: 'DM Sans', sans-serif;
                    letter-spacing: 0.01em;
                    border: none;
                    cursor: pointer;
                    transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
                }
                .tq-btn-primary:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 12px 28px -8px rgba(255,255,255,0.25);
                }
                .tq-btn-primary:active:not(:disabled) { transform: translateY(0); }
                .tq-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
                .tq-btn-accent {
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    border-radius: 14px;
                    background: linear-gradient(135deg, hsl(157,90%,40%) 0%, hsl(157,90%,51%) 100%);
                    color: #050505;
                    padding: 14px 20px;
                    font-size: 14px;
                    font-weight: 700;
                    font-family: 'DM Sans', sans-serif;
                    letter-spacing: 0.01em;
                    border: none;
                    cursor: pointer;
                    transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
                }
                .tq-btn-accent:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 12px 28px -8px hsl(157,90%,51%,0.5);
                }
                .tq-btn-accent:disabled { opacity: 0.4; cursor: not-allowed; }
                .tq-animate { animation: tq-fade-up 0.35s ease both; }
            `}</style>

            <div
                style={{
                    fontFamily: '"DM Sans", sans-serif',
                    background: 'hsl(0,0%,3%)',
                    color: 'rgba(255,255,255,0.9)',
                    borderRadius: '20px',
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.07)',
                    boxShadow:
                        '0 0 0 1px rgba(255,255,255,0.04), 0 32px 64px -16px rgba(0,0,0,0.8)',
                    position: 'relative',
                }}
            >
                {/* Ambient glow */}
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        pointerEvents: 'none',
                        background:
                            'radial-gradient(circle at 85% 10%, hsla(264,100%,64%,0.07) 0%, transparent 50%), radial-gradient(circle at 15% 90%, hsla(157,90%,51%,0.06) 0%, transparent 50%)',
                    }}
                />

                {/* Brand header */}
                <BrandHeader
                    logoUrl={logoUrl}
                    brandName={brandName}
                    platform={platform}
                />

                {/* Card body */}
                <div
                    style={{
                        position: 'relative',
                        padding: '28px 24px 24px',
                    }}
                >
                    <StatusBadge
                        label={getStepLabel()}
                        active={connected || depositComplete}
                    />

                    {/* Heading */}
                    <h1
                        style={{
                            fontSize: 'clamp(22px, 5vw, 30px)',
                            fontWeight: 700,
                            lineHeight: 1.15,
                            letterSpacing: '-0.02em',
                            color: 'rgba(255,255,255,0.97)',
                            margin: '0 0 10px',
                            fontFamily: '"DM Sans", sans-serif',
                        }}
                    >
                        {getHeading()}
                    </h1>

                    <p
                        style={{
                            fontSize: '14px',
                            lineHeight: 1.65,
                            color: 'rgba(255,255,255,0.45)',
                            margin: '0 0 28px',
                        }}
                    >
                        {getDescription()}
                    </p>

                    {/* Deposit amount card */}
                    {isDeposit && (
                        <div
                            className="tq-animate"
                            style={{
                                borderRadius: '14px',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.07)',
                                padding: '16px 20px',
                                marginBottom: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                            }}
                        >
                            <div>
                                <div
                                    style={{
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        letterSpacing: '0.08em',
                                        textTransform: 'uppercase',
                                        color: 'rgba(255,255,255,0.3)',
                                        marginBottom: '6px',
                                    }}
                                >
                                    Amount to Deposit
                                </div>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'baseline',
                                        gap: '6px',
                                    }}
                                >
                                    <span
                                        style={{
                                            fontFamily: '"DM Mono", monospace',
                                            fontSize: '28px',
                                            fontWeight: 500,
                                            color: 'rgba(255,255,255,0.95)',
                                            letterSpacing: '-0.02em',
                                        }}
                                    >
                                        {amountParam || '0.00'}
                                    </span>
                                    <span
                                        style={{
                                            fontSize: '14px',
                                            fontWeight: 600,
                                            color: 'hsl(157,90%,51%)',
                                            letterSpacing: '0.05em',
                                        }}
                                    >
                                        SOL
                                    </span>
                                </div>
                            </div>
                            <div
                                style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '12px',
                                    background:
                                        'linear-gradient(135deg, hsl(264,100%,64%,0.15) 0%, hsl(157,90%,51%,0.15) 100%)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="hsl(157,90%,51%)"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    style={{ width: '18px', height: '18px' }}
                                >
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M12 6v6l4 2" />
                                </svg>
                            </div>
                        </div>
                    )}

                    {/* Action button */}
                    {!isDeposit ? (
                        <button
                            className="tq-btn-primary"
                            onClick={handleConnect}
                            disabled={isInvalid || connecting || connected}
                        >
                            {connected ? (
                                <>
                                    <CheckCircle2
                                        size={16}
                                        color="hsl(157,90%,51%)"
                                    />
                                    Connected
                                </>
                            ) : connecting ? (
                                <>
                                    <Spinner />
                                    Connecting…
                                </>
                            ) : (
                                <>
                                    <Wallet size={16} />
                                    Connect Wallet
                                    <ArrowRight
                                        size={16}
                                        style={{ marginLeft: 'auto' }}
                                    />
                                </>
                            )}
                        </button>
                    ) : (
                        <button
                            className="tq-btn-accent"
                            onClick={handleDeposit}
                            disabled={depositing || depositComplete}
                        >
                            {depositComplete ? (
                                <>
                                    <CheckCircle2 size={16} />
                                    Complete
                                </>
                            ) : depositing ? (
                                <>
                                    <Spinner />
                                    Processing…
                                </>
                            ) : (
                                <>
                                    <ArrowDown size={16} />
                                    Confirm Deposit
                                </>
                            )}
                        </button>
                    )}

                    {/* Status message */}
                    {statusMsg && statusType && (
                        <div
                            className="tq-animate"
                            style={{
                                marginTop: '14px',
                                borderRadius: '12px',
                                padding: '12px 16px',
                                fontSize: '13px',
                                textAlign: 'center',
                                background: statusColors[statusType].bg,
                                border: `1px solid ${statusColors[statusType].border}`,
                                color: statusColors[statusType].text,
                            }}
                        >
                            {statusMsg}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '12px 24px 16px',
                        borderTop: '1px solid rgba(255,255,255,0.04)',
                        fontSize: '11px',
                        color: 'rgba(255,255,255,0.2)',
                        letterSpacing: '0.03em',
                    }}
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ width: '12px', height: '12px' }}
                    >
                        <rect
                            x="3"
                            y="11"
                            width="18"
                            height="11"
                            rx="2"
                            ry="2"
                        />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Secured by TokenQuest
                </div>
            </div>
        </>
    );
};

export default Index;
