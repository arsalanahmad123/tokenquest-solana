import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    CheckCircle,
    XCircle,
    Plus,
    Minus,
    Loader2,
    ShieldCheck,
    ArrowLeftRight,
    Clock,
    Package,
    Coins,
    Gem,
    ChevronRight,
    AlertCircle,
    RefreshCw,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusType = 'info' | 'success' | 'error' | null;
type TradeStatus =
    | 'accepted'
    | 'in_progress'
    | 'completed'
    | 'cancelled'
    | null;
type Role = 'initiator' | 'recipient' | null;

interface TradableItem {
    itemId: string;
    name: string;
    type: number;
    typeLabel: string;
    emoji: string;
    quantity: number;
    level: number;
}

interface OfferItem {
    itemId: string;
    name: string;
    emoji: string;
    quantity: number;
}

interface Offer {
    gold: number;
    diamonds: number;
    items: OfferItem[];
}

interface TradeState {
    id: string;
    status: TradeStatus;
    role: Role;
    me: {
        nickname: string;
        gold: number;
        diamond: number;
        tradableInventory: TradableItem[];
    };
    partner: { nickname: string; discordId: string };
    myOffer: Offer;
    theirOffer: Offer;
    myConfirmed: boolean;
    theirConfirmed: boolean;
    expiresAt: string;
}

interface Receipt {
    youGave: { gold: number; diamonds: number; items: OfferItem[] };
    youReceived: { gold: number; diamonds: number; items: OfferItem[] };
}

// ─── Config ───────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 4000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function offerIsEmpty(offer: Offer) {
    return offer.gold <= 0 && offer.diamonds <= 0 && offer.items.length === 0;
}

function formatExpiry(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Shared Styles ────────────────────────────────────────────────────────────

const CARD_STYLE: React.CSSProperties = {
    borderRadius: '16px',
    border: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(255,255,255,0.025)',
    overflow: 'hidden',
};

const LABEL_STYLE: React.CSSProperties = {
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.3)',
};

// ─── Component ────────────────────────────────────────────────────────────────

const Trade = () => {
    const [searchParams] = useSearchParams();
    const tradeId = searchParams.get('id');
    const rawToken = searchParams.get('token');
    const type = searchParams.get('type');
    const brandName = searchParams.get('brand') || 'TokenQuest';
    const logoUrl = searchParams.get('logo');

    const apiBase = useMemo(() => {
        return type === 'discord'
            ? 'https://huntbot.tokenquest.ca/api'
            : 'https://telegram-api.tokenquest.ca/api/v1';
    }, [type]);

    const sessionTokenRef = useRef<string | null>(null);
    const authCalledRef = useRef(false);

    const [phase, setPhase] = useState<'loading' | 'offer' | 'done' | 'error'>(
        'loading'
    );
    const [tradeState, setTradeState] = useState<TradeState | null>(null);
    const [receipt, setReceipt] = useState<Receipt | null>(null);
    const [cancelledBy, setCancelledBy] = useState<string | null>(null);
    const [statusMsg, setStatusMsg] = useState<string | null>(null);
    const [statusType, setStatusType] = useState<StatusType>(null);
    const [submitting, setSubmitting] = useState(false);

    const [draftGold, setDraftGold] = useState(0);
    const [draftDiamonds, setDraftDiamonds] = useState(0);
    const [draftItems, setDraftItems] = useState<OfferItem[]>([]);
    const [offerDirty, setOfferDirty] = useState(false);
    const [activeTab, setActiveTab] = useState<'currency' | 'items'>(
        'currency'
    );

    const showStatus = useCallback((msg: string, type: StatusType) => {
        setStatusMsg(msg);
        setStatusType(type);
    }, []);

    const clearStatus = useCallback(() => {
        setStatusMsg(null);
        setStatusType(null);
    }, []);

    useEffect(() => {
        if (!tradeId || !rawToken) {
            setPhase('error');
            showStatus(
                'Invalid trade link. Please use the link from your Discord DM.',
                'error'
            );
            return;
        }
        if (authCalledRef.current) return;
        authCalledRef.current = true;

        (async () => {
            try {
                const res = await fetch(`${apiBase}/trade/auth`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tradeId, token: rawToken.trim() }),
                });
                const data = await res.json();
                if (!res.ok) {
                    setPhase('error');
                    showStatus(data.error || 'Authentication failed.', 'error');
                    return;
                }
                sessionTokenRef.current = data.sessionToken;
                await fetchTradeState();
                setPhase('offer');
            } catch {
                setPhase('error');
                showStatus(
                    'Could not connect to the server. Please try again.',
                    'error'
                );
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchTradeState = useCallback(async () => {
        if (!sessionTokenRef.current || !tradeId) return;
        try {
            const res = await fetch(`${apiBase}/trade/${tradeId}`, {
                headers: { Authorization: `Bearer ${sessionTokenRef.current}` },
            });
            if (!res.ok) return;
            const data: TradeState = await res.json();
            setTradeState(data);
            setDraftGold((prev) =>
                offerDirty ? prev : (data.myOffer?.gold ?? 0)
            );
            setDraftDiamonds((prev) =>
                offerDirty ? prev : (data.myOffer?.diamonds ?? 0)
            );
            setDraftItems((prev) =>
                offerDirty ? prev : (data.myOffer?.items ?? [])
            );
            if (data.status === 'completed' || data.status === 'cancelled') {
                setPhase('done');
            }
        } catch {
            // Silent — polling will retry
        }
    }, [tradeId, offerDirty]);

    useEffect(() => {
        if (phase !== 'offer') return;
        const interval = setInterval(fetchTradeState, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [phase, fetchTradeState]);

    const getDraftItemQty = (itemId: string) =>
        draftItems.find((i) => i.itemId === itemId)?.quantity ?? 0;

    const setDraftItemQty = (item: TradableItem, qty: number) => {
        setDraftItems((prev) => {
            const filtered = prev.filter((i) => i.itemId !== item.itemId);
            if (qty <= 0) return filtered;
            return [
                ...filtered,
                {
                    itemId: item.itemId,
                    name: item.name,
                    emoji: item.emoji,
                    quantity: qty,
                },
            ];
        });
        setOfferDirty(true);
    };

    const handleSaveOffer = async () => {
        if (!sessionTokenRef.current || !tradeId) return;
        setSubmitting(true);
        clearStatus();
        try {
            const res = await fetch(`${apiBase}/trade/${tradeId}/offer`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${sessionTokenRef.current}`,
                },
                body: JSON.stringify({
                    gold: draftGold,
                    diamonds: draftDiamonds,
                    items: draftItems.map((i) => ({
                        itemId: i.itemId,
                        quantity: i.quantity,
                    })),
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                showStatus(data.error || 'Failed to update offer.', 'error');
            } else {
                showStatus(
                    'Offer saved! Both players must re-confirm.',
                    'success'
                );
                setOfferDirty(false);
                await fetchTradeState();
            }
        } catch {
            showStatus('Network error. Please try again.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleConfirm = async () => {
        if (!sessionTokenRef.current || !tradeId) return;
        if (offerDirty) {
            showStatus('Save your offer changes before confirming.', 'error');
            return;
        }
        setSubmitting(true);
        clearStatus();
        try {
            const res = await fetch(`${apiBase}/trade/${tradeId}/confirm`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${sessionTokenRef.current}` },
            });
            const data = await res.json();
            if (!res.ok) {
                showStatus(data.error || 'Failed to confirm.', 'error');
            } else if (data.status === 'completed') {
                setReceipt(data.receipt ?? null);
                setPhase('done');
                await fetchTradeState();
            } else {
                showStatus(data.message, 'info');
                await fetchTradeState();
            }
        } catch {
            showStatus('Network error. Please try again.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancel = async () => {
        if (!sessionTokenRef.current || !tradeId) return;
        if (!window.confirm('Are you sure you want to cancel this trade?'))
            return;
        setSubmitting(true);
        try {
            const res = await fetch(`${apiBase}/trade/${tradeId}/cancel`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${sessionTokenRef.current}` },
            });
            const data = await res.json();
            if (!res.ok) {
                showStatus(data.error || 'Failed to cancel.', 'error');
            } else {
                setCancelledBy(data.cancelledBy ?? 'You');
                await fetchTradeState();
            }
        } catch {
            showStatus('Network error. Please try again.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const draftOffer: Offer = {
        gold: draftGold,
        diamonds: draftDiamonds,
        items: draftItems,
    };

    const statusColors = {
        info: {
            bg: 'rgba(255,255,255,0.04)',
            border: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.7)',
        },
        success: {
            bg: 'rgba(52,211,153,0.08)',
            border: 'rgba(52,211,153,0.2)',
            color: 'hsl(157,90%,51%)',
        },
        error: {
            bg: 'rgba(239,68,68,0.08)',
            border: 'rgba(239,68,68,0.2)',
            color: 'hsl(0,72%,65%)',
        },
    };

    return (
        <>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
                @keyframes tq-spin { to { transform: rotate(360deg); } }
                @keyframes tq-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
                .tq-trade-root * { box-sizing: border-box; }
                .tq-tab-btn {
                    flex: 1;
                    padding: 10px 8px;
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-family: 'DM Sans', sans-serif;
                    font-size: 11px;
                    font-weight: 600;
                    letter-spacing: 0.07em;
                    text-transform: uppercase;
                    transition: color 0.15s;
                }
                .tq-tab-btn.active {
                    color: rgba(255,255,255,0.9);
                    border-bottom: 2px solid hsl(157,90%,51%);
                }
                .tq-tab-btn:not(.active) {
                    color: rgba(255,255,255,0.3);
                    border-bottom: 2px solid transparent;
                }
                .tq-tab-btn:not(.active):hover { color: rgba(255,255,255,0.6); }
                .tq-icon-btn {
                    width: 28px;
                    height: 28px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.08);
                    background: rgba(255,255,255,0.04);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: rgba(255,255,255,0.6);
                    transition: background 0.15s, color 0.15s;
                    flex-shrink: 0;
                }
                .tq-icon-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.9); }
                .tq-icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }
                .tq-input {
                    flex: 1;
                    text-align: center;
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 8px;
                    color: rgba(255,255,255,0.9);
                    font-family: 'DM Mono', monospace;
                    font-size: 14px;
                    font-weight: 500;
                    padding: 7px 8px;
                    outline: none;
                    transition: border-color 0.15s;
                    min-width: 0;
                }
                .tq-input:focus { border-color: hsl(157,90%,51%); }
                .tq-input:disabled { opacity: 0.4; cursor: not-allowed; }
                .tq-range {
                    width: 100%;
                    accent-color: hsl(157,90%,51%);
                    margin-top: 6px;
                }
                .tq-range:disabled { opacity: 0.3; }
                .tq-btn-confirm {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    border-radius: 14px;
                    background: rgba(255,255,255,0.93);
                    color: #050505;
                    padding: 13px 20px;
                    font-size: 14px;
                    font-weight: 700;
                    font-family: 'DM Sans', sans-serif;
                    border: none;
                    cursor: pointer;
                    transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
                }
                .tq-btn-confirm:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 12px 24px -8px rgba(255,255,255,0.2);
                }
                .tq-btn-confirm:disabled { opacity: 0.35; cursor: not-allowed; transform: none; }
                .tq-btn-cancel {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 14px;
                    border: 1px solid rgba(239,68,68,0.3);
                    background: none;
                    color: hsl(0,72%,65%);
                    padding: 13px 20px;
                    font-size: 13px;
                    font-weight: 600;
                    font-family: 'DM Sans', sans-serif;
                    cursor: pointer;
                    transition: background 0.15s;
                }
                .tq-btn-cancel:hover:not(:disabled) { background: rgba(239,68,68,0.08); }
                .tq-btn-cancel:disabled { opacity: 0.4; cursor: not-allowed; }
                .tq-btn-save {
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    border-radius: 12px;
                    background: linear-gradient(135deg, hsl(157,90%,38%) 0%, hsl(157,90%,51%) 100%);
                    color: #050505;
                    padding: 12px 20px;
                    font-size: 13px;
                    font-weight: 700;
                    font-family: 'DM Sans', sans-serif;
                    border: none;
                    cursor: pointer;
                    transition: transform 0.15s, opacity 0.15s;
                }
                .tq-btn-save:hover:not(:disabled) { transform: translateY(-1px); }
                .tq-btn-save:disabled { opacity: 0.4; cursor: not-allowed; }
                .tq-item-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    border-radius: 12px;
                    border: 1px solid rgba(255,255,255,0.06);
                    background: rgba(255,255,255,0.02);
                    padding: 10px 12px;
                    transition: border-color 0.15s, background 0.15s;
                }
                .tq-item-row.selected {
                    border-color: rgba(52,211,153,0.3);
                    background: rgba(52,211,153,0.04);
                }
                .tq-scroll { overflow-y: auto; max-height: 220px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; }
                .tq-chip {
                    font-size: 12px;
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.07);
                    border-radius: 8px;
                    padding: 4px 10px;
                    color: rgba(255,255,255,0.7);
                    white-space: nowrap;
                }
                .tq-fade { animation: tq-fade 0.3s ease both; }
            `}</style>

            <div
                className="tq-trade-root"
                style={{
                    fontFamily: '"DM Sans", sans-serif',
                    background: 'hsl(0,0%,3%)',
                    color: 'rgba(255,255,255,0.88)',
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: '100%',
                    position: 'relative',
                }}
            >
                {/* Ambient */}
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        pointerEvents: 'none',
                        background:
                            'radial-gradient(ellipse at 10% 5%, hsla(264,100%,64%,0.09) 0%, transparent 45%), radial-gradient(ellipse at 90% 95%, hsla(157,90%,51%,0.07) 0%, transparent 45%)',
                    }}
                />

                {/* Header */}
                <header
                    style={{
                        position: 'relative',
                        zIndex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '16px 20px',
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        backdropFilter: 'blur(12px)',
                        background: 'rgba(0,0,0,0.3)',
                    }}
                >
                    {logoUrl ? (
                        <img
                            src={decodeURIComponent(logoUrl)}
                            alt={brandName}
                            style={{
                                width: '30px',
                                height: '30px',
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: '1px solid rgba(255,255,255,0.1)',
                            }}
                        />
                    ) : (
                        <div
                            style={{
                                width: '30px',
                                height: '30px',
                                borderRadius: '50%',
                                background:
                                    'linear-gradient(135deg, hsl(264,100%,64%) 0%, hsl(157,90%,51%) 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}
                        >
                            <ArrowLeftRight size={14} color="white" />
                        </div>
                    )}
                    <span
                        style={{
                            fontWeight: 700,
                            fontSize: '14px',
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                            color: 'rgba(255,255,255,0.9)',
                        }}
                    >
                        {brandName}
                    </span>
                    <div
                        style={{
                            marginLeft: 'auto',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                        }}
                    >
                        <span
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                fontSize: '11px',
                                fontWeight: 600,
                                letterSpacing: '0.07em',
                                textTransform: 'uppercase',
                                color: 'rgba(255,255,255,0.3)',
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.07)',
                                borderRadius: '6px',
                                padding: '4px 8px',
                            }}
                        >
                            <ShieldCheck size={11} /> Secure
                        </span>
                        <button
                            onClick={fetchTradeState}
                            style={{
                                width: '30px',
                                height: '30px',
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.07)',
                                background: 'rgba(255,255,255,0.03)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'rgba(255,255,255,0.4)',
                                transition: 'background 0.15s',
                            }}
                            title="Refresh"
                        >
                            <RefreshCw size={13} />
                        </button>
                    </div>
                </header>

                {/* Main */}
                <main
                    style={{
                        position: 'relative',
                        zIndex: 1,
                        flex: 1,
                        padding: '20px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent:
                            phase === 'offer' ? 'flex-start' : 'center',
                    }}
                >
                    {/* Loading */}
                    {phase === 'loading' && (
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '16px',
                                padding: '48px 0',
                            }}
                        >
                            <div
                                style={{
                                    width: '56px',
                                    height: '56px',
                                    borderRadius: '16px',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.07)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <Loader2
                                    size={24}
                                    color="hsl(157,90%,51%)"
                                    style={{
                                        animation:
                                            'tq-spin 0.8s linear infinite',
                                    }}
                                />
                            </div>
                            <p
                                style={{
                                    fontSize: '13px',
                                    color: 'rgba(255,255,255,0.35)',
                                }}
                            >
                                Authenticating trade session…
                            </p>
                        </div>
                    )}

                    {/* Error */}
                    {phase === 'error' && (
                        <div
                            style={{
                                ...CARD_STYLE,
                                width: '100%',
                                maxWidth: '420px',
                                padding: '40px 32px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '16px',
                                textAlign: 'center',
                            }}
                        >
                            <div
                                style={{
                                    width: '56px',
                                    height: '56px',
                                    borderRadius: '16px',
                                    background: 'rgba(239,68,68,0.08)',
                                    border: '1px solid rgba(239,68,68,0.15)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <XCircle size={26} color="hsl(0,72%,65%)" />
                            </div>
                            <h2
                                style={{
                                    fontSize: '20px',
                                    fontWeight: 700,
                                    color: 'rgba(255,255,255,0.9)',
                                    margin: 0,
                                }}
                            >
                                Access Denied
                            </h2>
                            <p
                                style={{
                                    fontSize: '13px',
                                    color: 'rgba(255,255,255,0.4)',
                                    margin: 0,
                                    lineHeight: 1.6,
                                }}
                            >
                                {statusMsg}
                            </p>
                        </div>
                    )}

                    {/* Done */}
                    {phase === 'done' && (
                        <div style={{ width: '100%', maxWidth: '480px' }}>
                            {tradeState?.status === 'completed' ? (
                                <CompletedScreen
                                    receipt={receipt}
                                    partnerName={tradeState?.partner?.nickname}
                                />
                            ) : (
                                <CancelledScreen
                                    cancelledBy={cancelledBy}
                                    partnerName={tradeState?.partner?.nickname}
                                />
                            )}
                        </div>
                    )}

                    {/* Offer Phase */}
                    {phase === 'offer' && tradeState && (
                        <div
                            style={{
                                width: '100%',
                                maxWidth: '960px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '16px',
                            }}
                        >
                            {/* Title */}
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    justifyContent: 'space-between',
                                    flexWrap: 'wrap',
                                    gap: '8px',
                                }}
                            >
                                <div>
                                    <h1
                                        style={{
                                            fontSize: '20px',
                                            fontWeight: 700,
                                            margin: '0 0 4px',
                                            color: 'rgba(255,255,255,0.95)',
                                        }}
                                    >
                                        Trading with{' '}
                                        <span
                                            style={{
                                                color: 'hsl(157,90%,51%)',
                                            }}
                                        >
                                            {tradeState.partner.nickname}
                                        </span>
                                    </h1>
                                    <p
                                        style={{
                                            fontSize: '12px',
                                            color: 'rgba(255,255,255,0.35)',
                                            margin: 0,
                                        }}
                                    >
                                        You are the{' '}
                                        <strong
                                            style={{
                                                color: 'rgba(255,255,255,0.6)',
                                            }}
                                        >
                                            {tradeState.role}
                                        </strong>
                                    </p>
                                </div>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        fontSize: '11px',
                                        color: 'rgba(255,255,255,0.35)',
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        borderRadius: '8px',
                                        padding: '6px 10px',
                                    }}
                                >
                                    <Clock size={12} /> Expires{' '}
                                    {formatExpiry(tradeState.expiresAt)}
                                </div>
                            </div>

                            {/* Partner confirmed banner */}
                            {tradeState.theirConfirmed &&
                                !tradeState.myConfirmed && (
                                    <div
                                        className="tq-fade"
                                        style={{
                                            borderRadius: '12px',
                                            background: 'rgba(52,211,153,0.06)',
                                            border: '1px solid rgba(52,211,153,0.18)',
                                            padding: '12px 16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            fontSize: '13px',
                                        }}
                                    >
                                        <CheckCircle
                                            size={15}
                                            color="hsl(157,90%,51%)"
                                        />
                                        <span
                                            style={{
                                                color: 'hsl(157,90%,51%)',
                                                fontWeight: 600,
                                            }}
                                        >
                                            {tradeState.partner.nickname}{' '}
                                            confirmed — it's your turn!
                                        </span>
                                    </div>
                                )}

                            {/* Two panel grid */}
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns:
                                        'repeat(auto-fit, minmax(300px, 1fr))',
                                    gap: '16px',
                                }}
                            >
                                {/* My offer panel */}
                                <div style={CARD_STYLE}>
                                    {/* Panel header */}
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '14px 16px',
                                            borderBottom:
                                                '1px solid rgba(255,255,255,0.05)',
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                            }}
                                        >
                                            <span
                                                style={{
                                                    width: '7px',
                                                    height: '7px',
                                                    borderRadius: '50%',
                                                    background:
                                                        tradeState.myConfirmed
                                                            ? 'hsl(157,90%,51%)'
                                                            : 'hsl(264,100%,64%)',
                                                    boxShadow:
                                                        tradeState.myConfirmed
                                                            ? '0 0 6px hsl(157,90%,51%)'
                                                            : 'none',
                                                    display: 'inline-block',
                                                    flexShrink: 0,
                                                }}
                                            />
                                            <span style={LABEL_STYLE}>
                                                Your Offer{' '}
                                                {tradeState.myConfirmed &&
                                                    '· ✓ Confirmed'}
                                            </span>
                                        </div>
                                        <div
                                            style={{
                                                display: 'flex',
                                                gap: '6px',
                                            }}
                                        >
                                            <span
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    fontSize: '11px',
                                                    color: 'rgba(255,255,255,0.4)',
                                                    background:
                                                        'rgba(255,255,255,0.04)',
                                                    borderRadius: '6px',
                                                    padding: '3px 7px',
                                                }}
                                            >
                                                <Coins size={11} />{' '}
                                                {tradeState.me.gold.toLocaleString()}
                                            </span>
                                            <span
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    fontSize: '11px',
                                                    color: 'rgba(255,255,255,0.4)',
                                                    background:
                                                        'rgba(255,255,255,0.04)',
                                                    borderRadius: '6px',
                                                    padding: '3px 7px',
                                                }}
                                            >
                                                <Gem size={11} />{' '}
                                                {tradeState.me.diamond.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Tabs */}
                                    <div
                                        style={{
                                            display: 'flex',
                                            borderBottom:
                                                '1px solid rgba(255,255,255,0.05)',
                                        }}
                                    >
                                        {(['currency', 'items'] as const).map(
                                            (tab) => (
                                                <button
                                                    key={tab}
                                                    onClick={() =>
                                                        setActiveTab(tab)
                                                    }
                                                    className={`tq-tab-btn${activeTab === tab ? ' active' : ''}`}
                                                >
                                                    {tab === 'currency'
                                                        ? '💰 Currency'
                                                        : '🎒 Items'}
                                                </button>
                                            )
                                        )}
                                    </div>

                                    <div
                                        style={{
                                            padding: '16px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '12px',
                                        }}
                                    >
                                        {activeTab === 'currency' && (
                                            <>
                                                <CurrencyField
                                                    label="💰 Gold"
                                                    value={draftGold}
                                                    max={tradeState.me.gold}
                                                    disabled={
                                                        tradeState.myConfirmed ||
                                                        submitting
                                                    }
                                                    onChange={(v) => {
                                                        setDraftGold(v);
                                                        setOfferDirty(true);
                                                    }}
                                                />
                                                <CurrencyField
                                                    label="💎 Diamonds"
                                                    value={draftDiamonds}
                                                    max={tradeState.me.diamond}
                                                    disabled={
                                                        tradeState.myConfirmed ||
                                                        submitting
                                                    }
                                                    onChange={(v) => {
                                                        setDraftDiamonds(v);
                                                        setOfferDirty(true);
                                                    }}
                                                />
                                            </>
                                        )}

                                        {activeTab === 'items' && (
                                            <div>
                                                {tradeState.me.tradableInventory
                                                    .length === 0 ? (
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            flexDirection:
                                                                'column',
                                                            alignItems:
                                                                'center',
                                                            gap: '8px',
                                                            padding: '32px 0',
                                                            color: 'rgba(255,255,255,0.25)',
                                                            textAlign: 'center',
                                                        }}
                                                    >
                                                        <Package
                                                            size={28}
                                                            style={{
                                                                opacity: 0.4,
                                                            }}
                                                        />
                                                        <p
                                                            style={{
                                                                fontSize:
                                                                    '13px',
                                                                margin: 0,
                                                            }}
                                                        >
                                                            No tradable items
                                                        </p>
                                                        <p
                                                            style={{
                                                                fontSize:
                                                                    '11px',
                                                                margin: 0,
                                                            }}
                                                        >
                                                            Weapons, traps, gear
                                                            are tradable
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div
                                                        className="tq-scroll"
                                                        style={{
                                                            display: 'flex',
                                                            flexDirection:
                                                                'column',
                                                            gap: '6px',
                                                        }}
                                                    >
                                                        {tradeState.me.tradableInventory.map(
                                                            (item) => {
                                                                const qty =
                                                                    getDraftItemQty(
                                                                        item.itemId
                                                                    );
                                                                return (
                                                                    <div
                                                                        key={
                                                                            item.itemId
                                                                        }
                                                                        className={`tq-item-row${qty > 0 ? ' selected' : ''}`}
                                                                    >
                                                                        <span
                                                                            style={{
                                                                                fontSize:
                                                                                    '20px',
                                                                                flexShrink: 0,
                                                                            }}
                                                                        >
                                                                            {
                                                                                item.emoji
                                                                            }
                                                                        </span>
                                                                        <div
                                                                            style={{
                                                                                flex: 1,
                                                                                minWidth: 0,
                                                                            }}
                                                                        >
                                                                            <p
                                                                                style={{
                                                                                    fontSize:
                                                                                        '13px',
                                                                                    fontWeight: 600,
                                                                                    color: 'rgba(255,255,255,0.85)',
                                                                                    margin: '0 0 2px',
                                                                                    overflow:
                                                                                        'hidden',
                                                                                    textOverflow:
                                                                                        'ellipsis',
                                                                                    whiteSpace:
                                                                                        'nowrap',
                                                                                }}
                                                                            >
                                                                                {
                                                                                    item.name
                                                                                }
                                                                            </p>
                                                                            <p
                                                                                style={{
                                                                                    fontSize:
                                                                                        '11px',
                                                                                    color: 'rgba(255,255,255,0.3)',
                                                                                    margin: 0,
                                                                                }}
                                                                            >
                                                                                {
                                                                                    item.typeLabel
                                                                                }{' '}
                                                                                ·
                                                                                Lv.
                                                                                {
                                                                                    item.level
                                                                                }{' '}
                                                                                ·
                                                                                Have:{' '}
                                                                                {
                                                                                    item.quantity
                                                                                }
                                                                            </p>
                                                                        </div>
                                                                        <div
                                                                            style={{
                                                                                display:
                                                                                    'flex',
                                                                                alignItems:
                                                                                    'center',
                                                                                gap: '6px',
                                                                                flexShrink: 0,
                                                                            }}
                                                                        >
                                                                            <button
                                                                                onClick={() =>
                                                                                    setDraftItemQty(
                                                                                        item,
                                                                                        Math.max(
                                                                                            0,
                                                                                            qty -
                                                                                                1
                                                                                        )
                                                                                    )
                                                                                }
                                                                                disabled={
                                                                                    tradeState.myConfirmed ||
                                                                                    submitting
                                                                                }
                                                                                className="tq-icon-btn"
                                                                            >
                                                                                <Minus
                                                                                    size={
                                                                                        11
                                                                                    }
                                                                                />
                                                                            </button>
                                                                            <span
                                                                                style={{
                                                                                    width: '22px',
                                                                                    textAlign:
                                                                                        'center',
                                                                                    fontSize:
                                                                                        '13px',
                                                                                    fontWeight: 600,
                                                                                    color: 'rgba(255,255,255,0.9)',
                                                                                }}
                                                                            >
                                                                                {
                                                                                    qty
                                                                                }
                                                                            </span>
                                                                            <button
                                                                                onClick={() =>
                                                                                    setDraftItemQty(
                                                                                        item,
                                                                                        Math.min(
                                                                                            item.quantity,
                                                                                            qty +
                                                                                                1
                                                                                        )
                                                                                    )
                                                                                }
                                                                                disabled={
                                                                                    tradeState.myConfirmed ||
                                                                                    submitting
                                                                                }
                                                                                className="tq-icon-btn"
                                                                            >
                                                                                <Plus
                                                                                    size={
                                                                                        11
                                                                                    }
                                                                                />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Offer summary */}
                                        {!offerIsEmpty(draftOffer) && (
                                            <div
                                                style={{
                                                    borderRadius: '10px',
                                                    background:
                                                        'rgba(255,255,255,0.03)',
                                                    border: '1px solid rgba(255,255,255,0.06)',
                                                    padding: '12px 14px',
                                                }}
                                            >
                                                <p
                                                    style={{
                                                        ...LABEL_STYLE,
                                                        marginBottom: '8px',
                                                    }}
                                                >
                                                    You're offering
                                                </p>
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        flexWrap: 'wrap',
                                                        gap: '6px',
                                                    }}
                                                >
                                                    {draftGold > 0 && (
                                                        <span className="tq-chip">
                                                            💰{' '}
                                                            {draftGold.toLocaleString()}{' '}
                                                            Gold
                                                        </span>
                                                    )}
                                                    {draftDiamonds > 0 && (
                                                        <span className="tq-chip">
                                                            💎{' '}
                                                            {draftDiamonds.toLocaleString()}{' '}
                                                            Diamonds
                                                        </span>
                                                    )}
                                                    {draftItems.map((i) => (
                                                        <span
                                                            key={i.itemId}
                                                            className="tq-chip"
                                                        >
                                                            {i.emoji} {i.name} ×
                                                            {i.quantity}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {offerDirty &&
                                            !tradeState.myConfirmed && (
                                                <button
                                                    onClick={handleSaveOffer}
                                                    disabled={submitting}
                                                    className="tq-btn-save"
                                                >
                                                    {submitting && (
                                                        <Loader2
                                                            size={14}
                                                            style={{
                                                                animation:
                                                                    'tq-spin 0.8s linear infinite',
                                                            }}
                                                        />
                                                    )}
                                                    Save Offer
                                                </button>
                                            )}
                                    </div>
                                </div>

                                {/* Their offer panel */}
                                <div style={CARD_STYLE}>
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '14px 16px',
                                            borderBottom:
                                                '1px solid rgba(255,255,255,0.05)',
                                        }}
                                    >
                                        <span
                                            style={{
                                                width: '7px',
                                                height: '7px',
                                                borderRadius: '50%',
                                                background:
                                                    tradeState.theirConfirmed
                                                        ? 'hsl(157,90%,51%)'
                                                        : 'rgba(255,255,255,0.15)',
                                                boxShadow:
                                                    tradeState.theirConfirmed
                                                        ? '0 0 6px hsl(157,90%,51%)'
                                                        : 'none',
                                                display: 'inline-block',
                                                flexShrink: 0,
                                            }}
                                        />
                                        <span style={LABEL_STYLE}>
                                            {tradeState.partner.nickname}'s
                                            Offer{' '}
                                            {tradeState.theirConfirmed &&
                                                '· ✓ Confirmed'}
                                        </span>
                                    </div>
                                    <div
                                        style={{
                                            padding: '16px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '8px',
                                        }}
                                    >
                                        {offerIsEmpty(tradeState.theirOffer) ? (
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    gap: '10px',
                                                    padding: '40px 0',
                                                    color: 'rgba(255,255,255,0.2)',
                                                    textAlign: 'center',
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: '44px',
                                                        height: '44px',
                                                        borderRadius: '12px',
                                                        background:
                                                            'rgba(255,255,255,0.03)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent:
                                                            'center',
                                                    }}
                                                >
                                                    <Package
                                                        size={22}
                                                        style={{ opacity: 0.4 }}
                                                    />
                                                </div>
                                                <p
                                                    style={{
                                                        fontSize: '13px',
                                                        margin: 0,
                                                    }}
                                                >
                                                    Waiting for their offer…
                                                </p>
                                            </div>
                                        ) : (
                                            <>
                                                {tradeState.theirOffer.gold >
                                                    0 && (
                                                    <OfferReadOnly
                                                        label="💰 Gold"
                                                        value={tradeState.theirOffer.gold.toLocaleString()}
                                                    />
                                                )}
                                                {tradeState.theirOffer
                                                    .diamonds > 0 && (
                                                    <OfferReadOnly
                                                        label="💎 Diamonds"
                                                        value={tradeState.theirOffer.diamonds.toLocaleString()}
                                                    />
                                                )}
                                                {tradeState.theirOffer.items.map(
                                                    (item) => (
                                                        <OfferReadOnly
                                                            key={item.itemId}
                                                            label={`${item.emoji} ${item.name}`}
                                                            value={`×${item.quantity}`}
                                                        />
                                                    )
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Status message */}
                            {statusMsg && statusType && (
                                <div
                                    className="tq-fade"
                                    style={{
                                        borderRadius: '12px',
                                        padding: '12px 16px',
                                        fontSize: '13px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        ...statusColors[statusType],
                                    }}
                                >
                                    <AlertCircle
                                        size={15}
                                        style={{ flexShrink: 0 }}
                                    />
                                    {statusMsg}
                                </div>
                            )}

                            {/* Action bar */}
                            <div
                                style={{
                                    display: 'flex',
                                    gap: '10px',
                                    flexWrap: 'wrap',
                                }}
                            >
                                <button
                                    onClick={handleConfirm}
                                    disabled={
                                        submitting ||
                                        tradeState.myConfirmed ||
                                        offerDirty ||
                                        offerIsEmpty(draftOffer)
                                    }
                                    className="tq-btn-confirm"
                                >
                                    {submitting ? (
                                        <Loader2
                                            size={16}
                                            style={{
                                                animation:
                                                    'tq-spin 0.8s linear infinite',
                                            }}
                                        />
                                    ) : tradeState.myConfirmed ? (
                                        <>
                                            <CheckCircle
                                                size={16}
                                                color="hsl(157,90%,51%)"
                                            />{' '}
                                            Confirmed — Waiting
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle size={16} /> Confirm
                                            Trade
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={handleCancel}
                                    disabled={submitting}
                                    className="tq-btn-cancel"
                                >
                                    Cancel
                                </button>
                            </div>

                            {/* Confirmation status row */}
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '16px',
                                    fontSize: '12px',
                                    color: 'rgba(255,255,255,0.3)',
                                }}
                            >
                                <span
                                    style={{
                                        color: tradeState.myConfirmed
                                            ? 'hsl(157,90%,51%)'
                                            : undefined,
                                        fontWeight: tradeState.myConfirmed
                                            ? 600
                                            : undefined,
                                    }}
                                >
                                    {tradeState.myConfirmed ? '✓' : '○'} You
                                </span>
                                <ChevronRight
                                    size={12}
                                    style={{ opacity: 0.3 }}
                                />
                                <span
                                    style={{
                                        color: tradeState.theirConfirmed
                                            ? 'hsl(157,90%,51%)'
                                            : undefined,
                                        fontWeight: tradeState.theirConfirmed
                                            ? 600
                                            : undefined,
                                    }}
                                >
                                    {tradeState.theirConfirmed ? '✓' : '○'}{' '}
                                    {tradeState.partner.nickname}
                                </span>
                            </div>
                        </div>
                    )}
                </main>

                {/* Footer */}
                <footer
                    style={{
                        position: 'relative',
                        zIndex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '12px 20px',
                        borderTop: '1px solid rgba(255,255,255,0.04)',
                        fontSize: '11px',
                        color: 'rgba(255,255,255,0.2)',
                        letterSpacing: '0.03em',
                    }}
                >
                    <ShieldCheck size={11} /> End-to-end secured · {brandName}
                </footer>
            </div>
        </>
    );
};

// ─── Done Screens ─────────────────────────────────────────────────────────────

function CompletedScreen({
    receipt,
    partnerName,
}: {
    receipt: Receipt | null;
    partnerName?: string;
}) {
    return (
        <div
            style={{
                ...CARD_STYLE,
                padding: '40px 32px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '20px',
                textAlign: 'center',
            }}
        >
            <div
                style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '20px',
                    background: 'rgba(52,211,153,0.08)',
                    border: '1px solid rgba(52,211,153,0.18)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <CheckCircle size={30} color="hsl(157,90%,51%)" />
            </div>
            <div>
                <h1
                    style={{
                        fontSize: '22px',
                        fontWeight: 700,
                        color: 'rgba(255,255,255,0.95)',
                        margin: '0 0 6px',
                    }}
                >
                    Trade Complete! 🎉
                </h1>
                {partnerName && (
                    <p
                        style={{
                            fontSize: '13px',
                            color: 'rgba(255,255,255,0.4)',
                            margin: 0,
                        }}
                    >
                        Your trade with{' '}
                        <strong style={{ color: 'rgba(255,255,255,0.65)' }}>
                            {partnerName}
                        </strong>{' '}
                        has been finalized.
                    </p>
                )}
            </div>
            {receipt && (
                <div
                    style={{
                        width: '100%',
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '12px',
                    }}
                >
                    <ReceiptCard title="You Gave" side={receipt.youGave} />
                    <ReceiptCard
                        title="You Received"
                        side={receipt.youReceived}
                    />
                </div>
            )}
            <p
                style={{
                    fontSize: '12px',
                    color: 'rgba(255,255,255,0.25)',
                    margin: 0,
                }}
            >
                You can close this tab.
            </p>
        </div>
    );
}

function ReceiptCard({
    title,
    side,
}: {
    title: string;
    side: { gold: number; diamonds: number; items: OfferItem[] };
}) {
    const isEmpty =
        side.gold <= 0 && side.diamonds <= 0 && side.items.length === 0;
    return (
        <div
            style={{
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.025)',
                padding: '14px',
            }}
        >
            <p
                style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase' as const,
                    color: 'rgba(255,255,255,0.3)',
                    marginBottom: '10px',
                }}
            >
                {title}
            </p>
            {isEmpty ? (
                <p
                    style={{
                        fontSize: '13px',
                        color: 'rgba(255,255,255,0.25)',
                        fontStyle: 'italic',
                        margin: 0,
                    }}
                >
                    Nothing
                </p>
            ) : (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                    }}
                >
                    {side.gold > 0 && (
                        <div
                            style={{
                                display: 'flex',
                                gap: '6px',
                                alignItems: 'center',
                                fontSize: '13px',
                            }}
                        >
                            <span>💰</span>
                            <span
                                style={{
                                    color: 'rgba(255,255,255,0.8)',
                                    fontWeight: 500,
                                }}
                            >
                                {side.gold.toLocaleString()} Gold
                            </span>
                        </div>
                    )}
                    {side.diamonds > 0 && (
                        <div
                            style={{
                                display: 'flex',
                                gap: '6px',
                                alignItems: 'center',
                                fontSize: '13px',
                            }}
                        >
                            <span>💎</span>
                            <span
                                style={{
                                    color: 'rgba(255,255,255,0.8)',
                                    fontWeight: 500,
                                }}
                            >
                                {side.diamonds.toLocaleString()} Diamonds
                            </span>
                        </div>
                    )}
                    {side.items.map((item) => (
                        <div
                            key={item.itemId}
                            style={{
                                display: 'flex',
                                gap: '6px',
                                alignItems: 'center',
                                fontSize: '13px',
                            }}
                        >
                            <span>{item.emoji}</span>
                            <span
                                style={{
                                    color: 'rgba(255,255,255,0.8)',
                                    fontWeight: 500,
                                }}
                            >
                                {item.name} ×{item.quantity}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function CancelledScreen({
    cancelledBy,
    partnerName,
}: {
    cancelledBy: string | null;
    partnerName?: string;
}) {
    return (
        <div
            style={{
                ...CARD_STYLE,
                padding: '40px 32px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px',
                textAlign: 'center',
            }}
        >
            <div
                style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '20px',
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <XCircle size={30} color="hsl(0,72%,65%)" />
            </div>
            <h1
                style={{
                    fontSize: '22px',
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.9)',
                    margin: 0,
                }}
            >
                Trade Cancelled
            </h1>
            <p
                style={{
                    fontSize: '13px',
                    color: 'rgba(255,255,255,0.4)',
                    margin: 0,
                    lineHeight: 1.6,
                }}
            >
                {cancelledBy
                    ? `${cancelledBy} cancelled this trade.`
                    : partnerName
                      ? `${partnerName} cancelled this trade.`
                      : 'This trade has been cancelled.'}{' '}
                You can close this tab.
            </p>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CurrencyField({
    label,
    value,
    max,
    disabled,
    onChange,
}: {
    label: string;
    value: number;
    max: number;
    disabled?: boolean;
    onChange: (v: number) => void;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}
            >
                <label
                    style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}
                >
                    {label}
                </label>
                <span
                    style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}
                >
                    Max: {max.toLocaleString()}
                </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                    onClick={() => onChange(Math.max(0, value - 1))}
                    disabled={disabled}
                    className="tq-icon-btn"
                    style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                    }}
                >
                    <Minus size={12} />
                </button>
                <input
                    type="number"
                    min={0}
                    max={max}
                    value={value}
                    disabled={disabled}
                    onChange={(e) =>
                        onChange(
                            Math.min(
                                max,
                                Math.max(0, parseInt(e.target.value) || 0)
                            )
                        )
                    }
                    className="tq-input"
                />
                <button
                    onClick={() => onChange(Math.min(max, value + 1))}
                    disabled={disabled}
                    className="tq-icon-btn"
                    style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                    }}
                >
                    <Plus size={12} />
                </button>
            </div>
            <input
                type="range"
                min={0}
                max={max}
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(parseInt(e.target.value))}
                className="tq-range"
            />
        </div>
    );
}

function OfferReadOnly({ label, value }: { label: string; value: string }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.02)',
                padding: '10px 14px',
            }}
        >
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
                {label}
            </span>
            <span
                style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.85)',
                    fontFamily: '"DM Mono", monospace',
                }}
            >
                {value}
            </span>
        </div>
    );
}

export default Trade;
