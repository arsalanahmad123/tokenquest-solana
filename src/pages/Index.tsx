import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowDown } from 'lucide-react';

type StatusType = 'info' | 'success' | 'error' | null;

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

    // Client branding customization via URL params
    const brandName = searchParams.get('brand') || 'LEGEND';
    const logoUrl = searchParams.get('logo'); // URL to client's logo image
    const customHeading = searchParams.get('heading'); // Override default heading

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

    // Dynamic content based on type + deposit/connect mode
    const getHeading = () => {
        if (customHeading) return customHeading;
        if (depositComplete) return 'Deposit complete!';
        if (connected && hasAmount) return 'Confirm your deposit.';
        if (connected) return 'Wallet linked!';
        if (isDeposit) return `Deposit SOL via ${platform}.`;
        return `Connect via ${platform}.`;
    };

    const getDescription = () => {
        if (depositComplete)
            return `Your ${amountParam} SOL deposit is confirmed. You can return to ${platform} now.`;
        if (connected && hasAmount)
            return `Review the amount below and confirm your deposit. Funds will be linked to your ${platform} account.`;
        if (connected)
            return `Your Solana wallet is now linked to your ${platform} account. You may close this window.`;
        if (isDeposit)
            return `Connect your Solana wallet to deposit ${amountParam} SOL to your ${platform} account.`;
        return `Link your Solana wallet to your ${platform} account for secure, self-custody asset management.`;
    };

    const getStepLabel = () => {
        if (depositComplete) return '✓ Transaction Complete';
        if (depositing) return 'Step 2 · Confirming Deposit';
        if (connected && hasAmount) return 'Step 2 · Review & Deposit';
        if (connected) return '✓ Wallet Connected';
        if (isDeposit) return 'Step 1 · Connect Wallet to Deposit';
        return 'Step 1 · Connect Wallet';
    };

    const showStatus = useCallback((msg: string, t: StatusType) => {
        setStatusMsg(msg);
        setStatusType(t);
    }, []);

    // Validation
    const isInvalid =
        !token || !type || !userId || (amountParam !== null && !hasAmount);
    const invalidReason =
        !token || !type
            ? 'Invalid session. Please return to the source app.'
            : !userId
              ? `Please provide a valid ${type} ID.`
              : amountParam !== null && !hasAmount
                ? 'Invalid deposit amount.'
                : null;

    useEffect(() => {
        if (invalidReason) showStatus(invalidReason, 'error');
    }, [invalidReason, showStatus]);

    const showDepositUI =
        hasAmount && (connected || (!connected && amountParam));

    const handleConnect = async () => {
        setConnecting(true);
        showStatus('Awaiting wallet approval...', 'info');

        try {
            // SDK connect call would go here
            // Simulating for UI demonstration
            await new Promise((r) => setTimeout(r, 1500));
            setConnected(true);
            showStatus('Wallet successfully linked!', 'success');
        } catch (err: any) {
            showStatus(err?.message || 'Connection failed', 'error');
        } finally {
            setConnecting(false);
        }
    };

    const handleDeposit = async () => {
        setDepositing(true);
        showStatus('Processing transaction...', 'info');

        try {
            // SDK deposit call would go here
            await new Promise((r) => setTimeout(r, 2000));
            setDepositComplete(true);
            showStatus(
                'Deposit successful! You may now close this tab.',
                'success'
            );
        } catch (err: any) {
            showStatus(err?.message || 'Deposit failed', 'error');
        } finally {
            setDepositing(false);
        }
    };

    return (
        <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background">
            {/* Background glow */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background:
                        'radial-gradient(circle at 20% 20%, hsla(264, 100%, 64%, 0.08) 0%, transparent 40%), radial-gradient(circle at 80% 80%, hsla(157, 90%, 51%, 0.08) 0%, transparent 40%)',
                }}
            />

            <main className="relative z-10 w-full max-w-[500px] px-6 py-8 flex flex-col gap-8">
                {/* Brand */}
                <header className="flex items-center gap-3">
                    {logoUrl ? (
                        <img
                            src={decodeURIComponent(logoUrl)}
                            alt={brandName}
                            className="w-8 h-8 rounded-full object-cover"
                        />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center">
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="hsl(var(--background))"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="w-4 h-4"
                            >
                                <path d="m12 19 7-7 3 3-7 7-3-3z" />
                                <path d="m18 13-7-7-3 3 7 7 3-3z" />
                                <path d="m12 7-7-7-3 3 7 7 3-3z" />
                            </svg>
                        </div>
                    )}
                    <span className="font-bold tracking-[0.1em] text-lg text-foreground">
                        {brandName}
                    </span>
                    {type && (
                        <span className="ml-auto text-xs uppercase tracking-wider text-muted-foreground font-semibold px-2 py-1 rounded-md border border-border">
                            via {platform}
                        </span>
                    )}
                </header>

                {/* Card */}
                <section className="rounded-2xl border border-border bg-card backdrop-blur-xl p-8 sm:p-10 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_25px_50px_-12px_rgba(0,0,0,0.5)] transition-colors hover:border-[hsl(0_0%_100%/0.15)]">
                    {/* Step indicator */}
                    <div className="flex items-center gap-2 mb-6">
                        <div
                            className={`w-2 h-2 rounded-full ${connected ? 'bg-success' : 'bg-accent'}`}
                        />
                        <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                            {getStepLabel()}
                        </span>
                    </div>

                    <div className="mb-8">
                        <h1 className="text-[2rem] sm:text-[2.75rem] leading-[1.1] font-semibold tracking-[-0.02em] text-foreground">
                            {getHeading()}
                        </h1>
                        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                            {getDescription()}
                        </p>
                    </div>

                    <div className="space-y-4">
                        {/* Connect button */}
                        {!showDepositUI && (
                            <button
                                onClick={handleConnect}
                                disabled={isInvalid || connecting || connected}
                                className="w-full flex items-center justify-center gap-3 rounded-xl bg-foreground text-background px-6 py-4 font-semibold text-base transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5 hover:glow-white active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                            >
                                <span>
                                    {connecting
                                        ? 'Connecting...'
                                        : connected
                                          ? 'Connected'
                                          : 'Connect Wallet'}
                                </span>
                                {connecting ? (
                                    <Spinner />
                                ) : !connected ? (
                                    <ArrowRight className="w-5 h-5" />
                                ) : null}
                            </button>
                        )}

                        {/* Deposit UI */}
                        {showDepositUI && (
                            <div className="animate-fade-in">
                                <div className="rounded-2xl border border-border bg-secondary p-5 mb-4">
                                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                                        Amount to deposit
                                    </span>
                                    <div className="flex items-baseline gap-2 mt-1">
                                        <span className="text-3xl font-bold text-foreground">
                                            {amountParam || '0.00'}
                                        </span>
                                        <span className="text-base font-medium text-accent">
                                            SOL
                                        </span>
                                    </div>
                                </div>

                                <button
                                    onClick={handleDeposit}
                                    disabled={
                                        depositing ||
                                        depositComplete ||
                                        !connected
                                    }
                                    className="w-full flex items-center justify-center gap-3 rounded-xl bg-foreground text-background px-6 py-4 font-semibold text-base transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-0.5 hover:glow-white active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                                >
                                    <span>
                                        {depositing
                                            ? 'Processing...'
                                            : depositComplete
                                              ? 'Complete'
                                              : !connected
                                                ? 'Connect Wallet First'
                                                : 'Confirm Deposit'}
                                    </span>
                                    {depositing ? (
                                        <Spinner />
                                    ) : !depositComplete ? (
                                        <ArrowDown className="w-5 h-5" />
                                    ) : null}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Status */}
                    {statusMsg && statusType && (
                        <div
                            className={`mt-6 rounded-xl p-4 text-sm text-center animate-fade-in ${
                                statusType === 'info'
                                    ? 'bg-secondary text-foreground'
                                    : statusType === 'success'
                                      ? 'bg-[hsl(150_100%_50%/0.1)] text-success border border-[hsl(150_100%_50%/0.2)]'
                                      : 'bg-[hsl(0_72%_60%/0.1)] text-destructive border border-[hsl(0_72%_60%/0.2)]'
                            }`}
                        >
                            {statusMsg}
                        </div>
                    )}
                </section>

                {/* Footer */}
                <footer className="text-center text-[0.8125rem] text-muted-foreground">
                    Built on Solana. Self-custody platform.
                </footer>
            </main>
        </div>
    );
};

const Spinner = () => (
    <div className="w-[18px] h-[18px] border-2 border-current border-r-transparent rounded-full animate-spin" />
);

export default Index;
