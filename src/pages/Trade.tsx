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

interface Material {
    name: string;
    quantity: number;
    regionId: string | null;
}

interface OfferMaterial {
    name: string;
    quantity: number;
}

interface Offer {
    gold: number;
    diamonds: number;
    materials: OfferMaterial[];
}

interface TradeState {
    id: string;
    status: TradeStatus;
    role: Role;
    me: {
        nickname: string;
        gold: number;
        diamond: number;
        materials: Material[];
    };
    partner: { nickname: string; discordId: string };
    myOffer: Offer;
    theirOffer: Offer;
    myConfirmed: boolean;
    theirConfirmed: boolean;
    expiresAt: string;
}

interface Receipt {
    youGave: {
        gold: number;
        diamonds: number;
        materials: OfferMaterial[];
    };
    youReceived: {
        gold: number;
        diamonds: number;
        materials: OfferMaterial[];
    };
}

// ─── Config ───────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 4000;

// Hard caps enforced by the trade model (and now the UI too)
const GOLD_MAX = 10_000;
const DIAMOND_MAX = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function offerIsEmpty(offer: Offer | null | undefined) {
    if (!offer) return true;
    return (
        offer.gold <= 0 &&
        offer.diamonds <= 0 &&
        (offer.materials?.length ?? 0) === 0
    );
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
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.6)',
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
            ? // 'http://localhost:3000/api'
              'https://testbot.tokenquest.ca/api'
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
    const [draftMaterials, setDraftMaterials] = useState<OfferMaterial[]>([]);
    const [offerDirty, setOfferDirty] = useState(false);
    const [activeTab, setActiveTab] = useState<'currency' | 'materials'>(
        'currency'
    );
    const [materialSearch, setMaterialSearch] = useState('');
    const [giftMode, setGiftMode] = useState(false);

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
            setDraftMaterials((prev) =>
                offerDirty ? prev : (data.myOffer?.materials ?? [])
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

    const getDraftMatQty = (name: string) =>
        draftMaterials.find((m) => m.name === name)?.quantity ?? 0;

    const setDraftMatQty = (mat: Material, qty: number) => {
        setDraftMaterials((prev) => {
            const filtered = prev.filter((m) => m.name !== mat.name);
            if (qty <= 0) return filtered;
            return [...filtered, { name: mat.name, quantity: qty }];
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
                    materials: draftMaterials.map((m) => ({
                        name: m.name,
                        quantity: m.quantity,
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
        materials: draftMaterials,
    };

    // Gift trade: one side has nothing to offer, but the other side does
    const myDraftEmpty = offerIsEmpty(draftOffer);
    const theirOfferEmpty = offerIsEmpty(tradeState?.theirOffer ?? null);
    // isReceivingGift: I'm accepting a gift (I have nothing, they have something OR gift mode on)
    const isGiftTrade = myDraftEmpty && (!theirOfferEmpty || giftMode);
    // iAmGifting: I'm sending a gift (I have something, they have nothing)
    const iAmGifting = !myDraftEmpty && theirOfferEmpty;
    // Trade is confirmable if: at least one side is non-empty OR gift mode explicitly on
    const canConfirm = !myDraftEmpty || !theirOfferEmpty || giftMode;

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
                @keyframes tq-pulse-glow {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(52,211,153,0.4); }
                    50% { box-shadow: 0 0 0 8px rgba(52,211,153,0); }
                }
                .tq-trade-root * { box-sizing: border-box; font-size: 15px; }
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
                    font-size: 15px;
                    fontWeight: 500;
                    padding: 10px 12px;
                    outline: none;
                    transition: border-color 0.15s, background 0.15s;
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
                    transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s, background 0.2s;
                }
                .tq-btn-confirm.partner-confirmed {
                    background: linear-gradient(135deg, hsl(157,90%,40%) 0%, hsl(157,90%,55%) 100%);
                    color: #000;
                    animation: tq-pulse-glow 1.8s ease-in-out infinite;
                }
                .tq-btn-confirm:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 12px 24px -8px rgba(255,255,255,0.2);
                }
                .tq-btn-confirm:disabled { opacity: 0.35; cursor: not-allowed; transform: none; animation: none; }
                @media (max-width: 640px) {
                    .tq-panels-grid { grid-template-columns: 1fr !important; }
                    .tq-action-bar { flex-direction: column !important; }
                    .tq-action-bar .tq-btn-confirm, .tq-action-bar .tq-btn-cancel { width: 100%; }
                    .tq-trade-root main { padding: 14px !important; }
                    .tq-trade-root header { padding: 12px 14px !important; }
                    .tq-scroll { max-height: 180px !important; }
                }
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
                    minHeight: '100dvh',
                    width: '100%',
                    maxWidth: '960px',
                    margin: '0 auto',
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
                        overflowX: 'hidden',
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
                        <div style={{ width: '100%', maxWidth: '560px' }}>
                            {tradeState?.status === 'completed' ? (
                                <CompletedScreen
                                    receipt={receipt}
                                    tradeState={tradeState}
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
                                            fontSize: '24px',
                                            fontWeight: 800,
                                            margin: '0 0 4px',
                                            color: 'rgba(255,255,255,1)',
                                            letterSpacing: '-0.02em',
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
                                            fontSize: '14px',
                                            color: 'rgba(255,255,255,0.45)',
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

                            {/* Gift trade banners */}
                            {isGiftTrade && !tradeState.myConfirmed && (
                                <div
                                    className="tq-fade"
                                    style={{
                                        borderRadius: '12px',
                                        background: 'rgba(250,204,21,0.07)',
                                        border: '1px solid rgba(250,204,21,0.2)',
                                        padding: '12px 16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        fontSize: '13px',
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: '18px',
                                            flexShrink: 0,
                                        }}
                                    >
                                        🎁
                                    </span>
                                    <span
                                        style={{
                                            color: 'rgba(250,204,21,0.9)',
                                            fontWeight: 600,
                                        }}
                                    >
                                        You're receiving a gift — no offer
                                        required from you. You can confirm
                                        without adding anything.
                                    </span>
                                </div>
                            )}
                            {iAmGifting && !tradeState.myConfirmed && (
                                <div
                                    className="tq-fade"
                                    style={{
                                        borderRadius: '12px',
                                        background: 'rgba(139,92,246,0.07)',
                                        border: '1px solid rgba(139,92,246,0.25)',
                                        padding: '12px 16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        fontSize: '13px',
                                    }}
                                >
                                    <span
                                        style={{
                                            fontSize: '18px',
                                            flexShrink: 0,
                                        }}
                                    >
                                        🎁
                                    </span>
                                    <span
                                        style={{
                                            color: 'rgba(167,139,250,0.9)',
                                            fontWeight: 600,
                                        }}
                                    >
                                        You're sending a gift —{' '}
                                        {tradeState.partner.nickname} receives
                                        without giving anything back.
                                    </span>
                                </div>
                            )}

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
                                className="tq-panels-grid"
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
                                                alignItems: 'center',
                                                gap: '6px',
                                            }}
                                        >
                                            {/* Gift Mode Toggle */}
                                            {!tradeState.myConfirmed && (
                                                <button
                                                    onClick={() =>
                                                        setGiftMode((g) => !g)
                                                    }
                                                    title={
                                                        giftMode
                                                            ? 'Disable gift mode — add your own offer'
                                                            : 'Enable gift mode — confirm without offering anything'
                                                    }
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '5px',
                                                        fontSize: '11px',
                                                        fontWeight: 600,
                                                        letterSpacing: '0.05em',
                                                        borderRadius: '8px',
                                                        border: giftMode
                                                            ? '1px solid rgba(250,204,21,0.4)'
                                                            : '1px solid rgba(255,255,255,0.08)',
                                                        background: giftMode
                                                            ? 'rgba(250,204,21,0.12)'
                                                            : 'rgba(255,255,255,0.04)',
                                                        color: giftMode
                                                            ? 'rgba(250,204,21,0.9)'
                                                            : 'rgba(255,255,255,0.35)',
                                                        padding: '4px 8px',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s',
                                                        fontFamily:
                                                            '"DM Sans", sans-serif',
                                                    }}
                                                >
                                                    🎁 Gift Mode
                                                </button>
                                            )}
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
                                        {(
                                            ['currency', 'materials'] as const
                                        ).map((tab) => (
                                            <button
                                                key={tab}
                                                onClick={() =>
                                                    setActiveTab(tab)
                                                }
                                                className={`tq-tab-btn${activeTab === tab ? ' active' : ''}`}
                                            >
                                                {tab === 'currency'
                                                    ? '💰 Currency'
                                                    : '🪨 Materials'}
                                            </button>
                                        ))}
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
                                                    balance={tradeState.me.gold}
                                                    cap={GOLD_MAX}
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
                                                    balance={
                                                        tradeState.me.diamond
                                                    }
                                                    cap={DIAMOND_MAX}
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

                                        {activeTab === 'materials' && (
                                            <div>
                                                {/* Search */}
                                                <input
                                                    type="text"
                                                    placeholder="Search materials…"
                                                    value={materialSearch}
                                                    onChange={(e) =>
                                                        setMaterialSearch(
                                                            e.target.value
                                                        )
                                                    }
                                                    style={{
                                                        width: '100%',
                                                        background:
                                                            'rgba(255,255,255,0.04)',
                                                        border: '1px solid rgba(255,255,255,0.08)',
                                                        borderRadius: '10px',
                                                        color: 'rgba(255,255,255,0.85)',
                                                        fontSize: '13px',
                                                        padding: '8px 12px',
                                                        outline: 'none',
                                                        marginBottom: '10px',
                                                        fontFamily:
                                                            '"DM Sans", sans-serif',
                                                        boxSizing: 'border-box',
                                                    }}
                                                />
                                                {(() => {
                                                    const mats = (
                                                        tradeState.me
                                                            .materials ?? []
                                                    ).filter(
                                                        (m: Material) =>
                                                            !materialSearch ||
                                                            m.name
                                                                .toLowerCase()
                                                                .includes(
                                                                    materialSearch.toLowerCase()
                                                                )
                                                    );
                                                    if (
                                                        (
                                                            tradeState.me
                                                                .materials ?? []
                                                        ).length === 0
                                                    ) {
                                                        return (
                                                            <div
                                                                style={{
                                                                    display:
                                                                        'flex',
                                                                    flexDirection:
                                                                        'column',
                                                                    alignItems:
                                                                        'center',
                                                                    gap: '8px',
                                                                    padding:
                                                                        '32px 0',
                                                                    color: 'rgba(255,255,255,0.25)',
                                                                    textAlign:
                                                                        'center',
                                                                }}
                                                            >
                                                                <span
                                                                    style={{
                                                                        fontSize:
                                                                            '28px',
                                                                        opacity: 0.4,
                                                                    }}
                                                                >
                                                                    🪨
                                                                </span>
                                                                <p
                                                                    style={{
                                                                        fontSize:
                                                                            '13px',
                                                                        margin: 0,
                                                                    }}
                                                                >
                                                                    No materials
                                                                    yet
                                                                </p>
                                                                <p
                                                                    style={{
                                                                        fontSize:
                                                                            '11px',
                                                                        margin: 0,
                                                                    }}
                                                                >
                                                                    Earn
                                                                    materials by
                                                                    going on
                                                                    hunts
                                                                </p>
                                                            </div>
                                                        );
                                                    }
                                                    if (mats.length === 0) {
                                                        return (
                                                            <div
                                                                style={{
                                                                    textAlign:
                                                                        'center',
                                                                    padding:
                                                                        '24px 0',
                                                                    color: 'rgba(255,255,255,0.25)',
                                                                    fontSize:
                                                                        '13px',
                                                                }}
                                                            >
                                                                No materials
                                                                match "
                                                                {materialSearch}
                                                                "
                                                            </div>
                                                        );
                                                    }
                                                    return (
                                                        <div
                                                            className="tq-scroll"
                                                            style={{
                                                                display: 'flex',
                                                                flexDirection:
                                                                    'column',
                                                                gap: '5px',
                                                            }}
                                                        >
                                                            {mats.map(
                                                                (
                                                                    m: Material
                                                                ) => {
                                                                    const regionLabel =
                                                                        m.regionId
                                                                            ? m.regionId.replace(
                                                                                  /_/g,
                                                                                  ' '
                                                                              )
                                                                            : null;
                                                                    const emoji =
                                                                        /pelt|fur|hide|skin|wool|feather|scale|leather/i.test(
                                                                            m.name
                                                                        )
                                                                            ? '🦎'
                                                                            : /fish|salmon|trout|carp|tuna|anchov|eel|bass|perch|pike|cod|herring|crab|lobster|shrimp|anchovy|clam|oyster|whale|shark|scale/i.test(
                                                                                    m.name
                                                                                )
                                                                              ? '🐟'
                                                                              : /ore|copper|iron|gold|silver|platinum|titanium|crystal|gem|diamond|void|mithril|orichalc|cobalt|tungsten|obsidian/i.test(
                                                                                      m.name
                                                                                  )
                                                                                ? '⛏️'
                                                                                : '🪨';
                                                                    const matQty =
                                                                        getDraftMatQty(
                                                                            m.name
                                                                        );
                                                                    return (
                                                                        <div
                                                                            key={
                                                                                m.name
                                                                            }
                                                                            style={{
                                                                                display:
                                                                                    'flex',
                                                                                alignItems:
                                                                                    'center',
                                                                                gap: '10px',
                                                                                borderRadius:
                                                                                    '10px',
                                                                                border:
                                                                                    matQty >
                                                                                    0
                                                                                        ? '1px solid rgba(52,211,153,0.3)'
                                                                                        : '1px solid rgba(255,255,255,0.06)',
                                                                                background:
                                                                                    matQty >
                                                                                    0
                                                                                        ? 'rgba(52,211,153,0.06)'
                                                                                        : 'rgba(255,255,255,0.02)',
                                                                                padding:
                                                                                    '9px 12px',
                                                                            }}
                                                                        >
                                                                            <span
                                                                                style={{
                                                                                    fontSize:
                                                                                        '18px',
                                                                                    flexShrink: 0,
                                                                                }}
                                                                            >
                                                                                {
                                                                                    emoji
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
                                                                                            '14px',
                                                                                        fontWeight: 600,
                                                                                        color: 'rgba(255,255,255,0.9)',
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
                                                                                        m.name
                                                                                    }
                                                                                </p>
                                                                                {regionLabel && (
                                                                                    <p
                                                                                        style={{
                                                                                            fontSize:
                                                                                                '11px',
                                                                                            color: 'rgba(255,255,255,0.3)',
                                                                                            margin: 0,
                                                                                        }}
                                                                                    >
                                                                                        {
                                                                                            regionLabel
                                                                                        }{' '}
                                                                                        ·
                                                                                        Have:{' '}
                                                                                        {m.quantity.toLocaleString()}
                                                                                    </p>
                                                                                )}
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
                                                                                        setDraftMatQty(
                                                                                            m,
                                                                                            Math.max(
                                                                                                0,
                                                                                                matQty -
                                                                                                    1
                                                                                            )
                                                                                        )
                                                                                    }
                                                                                    disabled={
                                                                                        tradeState.myConfirmed ||
                                                                                        submitting ||
                                                                                        matQty <=
                                                                                            0
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
                                                                                        matQty
                                                                                    }
                                                                                </span>
                                                                                <button
                                                                                    onClick={() =>
                                                                                        setDraftMatQty(
                                                                                            m,
                                                                                            Math.min(
                                                                                                m.quantity,
                                                                                                matQty +
                                                                                                    1
                                                                                            )
                                                                                        )
                                                                                    }
                                                                                    disabled={
                                                                                        tradeState.myConfirmed ||
                                                                                        submitting ||
                                                                                        matQty >=
                                                                                            m.quantity
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
                                                    );
                                                })()}
                                            </div>
                                        )}

                                        {/* Offer summary */}
                                        {isGiftTrade && (
                                            <div
                                                style={{
                                                    borderRadius: '10px',
                                                    background:
                                                        'rgba(250,204,21,0.05)',
                                                    border: '1px solid rgba(250,204,21,0.15)',
                                                    padding: '10px 14px',
                                                    fontSize: '12px',
                                                    color: 'rgba(250,204,21,0.7)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                }}
                                            >
                                                <span>🎁</span>
                                                Nothing — you're receiving a
                                                gift
                                            </div>
                                        )}
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
                                                    {draftMaterials.map((m) => (
                                                        <span
                                                            key={m.name}
                                                            className="tq-chip"
                                                        >
                                                            🪨 {m.name} ×
                                                            {m.quantity}
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
                                                {(
                                                    tradeState.theirOffer
                                                        .materials ?? []
                                                ).map((mat) => (
                                                    <OfferReadOnly
                                                        key={mat.name}
                                                        label={`🪨 ${mat.name}`}
                                                        value={`×${mat.quantity}`}
                                                    />
                                                ))}
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
                                className="tq-action-bar"
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
                                        !canConfirm
                                    }
                                    className={`tq-btn-confirm${
                                        tradeState.theirConfirmed &&
                                        !tradeState.myConfirmed
                                            ? ' partner-confirmed'
                                            : ''
                                    }`}
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
                                            Confirmed — Waiting for{' '}
                                            {tradeState.partner.nickname}
                                        </>
                                    ) : tradeState.theirConfirmed ? (
                                        <>
                                            <CheckCircle size={16} /> Confirm
                                            Now — They're Ready!
                                        </>
                                    ) : isGiftTrade ? (
                                        <>
                                            <span>🎁</span> Accept Gift
                                        </>
                                    ) : iAmGifting ? (
                                        <>
                                            <span>🎁</span> Send Gift
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

function OfferLine({
    icon,
    label,
    value,
}: {
    icon: string;
    label: string;
    value: string;
}) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 12px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
            }}
        >
            <span style={{ fontSize: '18px', flexShrink: 0 }}>{icon}</span>
            <span
                style={{
                    flex: 1,
                    fontSize: '13px',
                    color: 'rgba(255,255,255,0.6)',
                    fontWeight: 500,
                }}
            >
                {label}
            </span>
            <span
                style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.92)',
                    fontFamily: '"DM Mono", monospace',
                }}
            >
                {value}
            </span>
        </div>
    );
}

// accentRgb: "R,G,B" e.g. "52,211,153"
function OfferPanel({
    name,
    isYou,
    offer,
    accentRgb,
    accentHsl,
}: {
    name: string;
    isYou: boolean;
    offer:
        | { gold: number; diamonds: number; materials: OfferMaterial[] }
        | null
        | undefined;
    accentRgb: string;
    accentHsl: string;
}) {
    const empty =
        !offer ||
        (offer.gold <= 0 &&
            offer.diamonds <= 0 &&
            (offer.materials ?? []).length === 0);
    return (
        <div
            style={{
                borderRadius: '14px',
                border: `1px solid rgba(${accentRgb},0.15)`,
                background: `rgba(${accentRgb},0.05)`,
                overflow: 'hidden',
                flex: 1,
                minWidth: 0,
            }}
        >
            {/* Panel head */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 14px',
                    borderBottom: `1px solid rgba(${accentRgb},0.1)`,
                }}
            >
                <span
                    style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: accentHsl,
                        boxShadow: `0 0 6px ${accentHsl}`,
                        flexShrink: 0,
                        display: 'inline-block',
                    }}
                />
                <span
                    style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase' as const,
                        color: accentHsl,
                    }}
                >
                    {isYou ? 'You' : name}
                </span>
                {isYou && (
                    <span
                        style={{
                            marginLeft: 4,
                            fontSize: '10px',
                            fontWeight: 600,
                            letterSpacing: '0.06em',
                            background: `rgba(${accentRgb},0.15)`,
                            color: accentHsl,
                            borderRadius: '6px',
                            padding: '2px 6px',
                        }}
                    >
                        YOU
                    </span>
                )}
            </div>
            {/* Items */}
            <div
                style={{
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                }}
            >
                {empty ? (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 12px',
                            borderRadius: '10px',
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.05)',
                        }}
                    >
                        <span style={{ fontSize: '16px' }}>🎁</span>
                        <span
                            style={{
                                fontSize: '13px',
                                color: 'rgba(255,255,255,0.3)',
                                fontStyle: 'italic',
                            }}
                        >
                            Nothing — gift
                        </span>
                    </div>
                ) : (
                    <>
                        {(offer?.gold ?? 0) > 0 && (
                            <OfferLine
                                icon="💰"
                                label="Gold"
                                value={offer!.gold.toLocaleString()}
                            />
                        )}
                        {(offer?.diamonds ?? 0) > 0 && (
                            <OfferLine
                                icon="💎"
                                label="Diamonds"
                                value={offer!.diamonds.toLocaleString()}
                            />
                        )}
                        {(offer?.materials ?? []).map((m) => (
                            <OfferLine
                                key={m.name}
                                icon="🪨"
                                label={m.name}
                                value={`×${m.quantity}`}
                            />
                        ))}
                    </>
                )}
            </div>
        </div>
    );
}

function CompletedScreen({
    receipt,
    tradeState,
}: {
    receipt: Receipt | null;
    tradeState: TradeState | null;
}) {
    // Derive both offers from receipt OR tradeState
    // receipt.youGave = my offer, receipt.youReceived = their offer
    // If receipt is null (polled completion), fall back to tradeState offers
    const myOffer: Offer = receipt?.youGave ??
        tradeState?.myOffer ?? { gold: 0, diamonds: 0, materials: [] };
    const theirOffer: Offer = receipt?.youReceived ??
        tradeState?.theirOffer ?? { gold: 0, diamonds: 0, materials: [] };
    const myName = tradeState?.me?.nickname ?? 'You';
    const partnerName = tradeState?.partner?.nickname ?? 'Partner';
    const completedAt = new Date().toLocaleString([], {
        dateStyle: 'medium',
        timeStyle: 'short',
    });

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                width: '100%',
                animation: 'tq-fade 0.4s ease both',
            }}
        >
            {/* ── Success banner ── */}
            <div
                style={{
                    borderRadius: '16px',
                    background: 'rgba(52,211,153,0.06)',
                    border: '1px solid rgba(52,211,153,0.18)',
                    padding: '28px 24px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                    textAlign: 'center',
                }}
            >
                <div
                    style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '18px',
                        background: 'rgba(52,211,153,0.1)',
                        border: '1px solid rgba(52,211,153,0.22)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <CheckCircle size={28} color="hsl(157,90%,51%)" />
                </div>
                <div>
                    <h1
                        style={{
                            fontSize: '22px',
                            fontWeight: 800,
                            color: 'rgba(255,255,255,1)',
                            margin: '0 0 4px',
                            letterSpacing: '-0.02em',
                        }}
                    >
                        Trade Complete! 🎉
                    </h1>
                    <p
                        style={{
                            fontSize: '13px',
                            color: 'rgba(255,255,255,0.45)',
                            margin: 0,
                        }}
                    >
                        Between{' '}
                        <strong style={{ color: 'rgba(255,255,255,0.7)' }}>
                            {myName}
                        </strong>{' '}
                        and{' '}
                        <strong style={{ color: 'rgba(255,255,255,0.7)' }}>
                            {partnerName}
                        </strong>
                        {' · '}
                        <span style={{ color: 'rgba(255,255,255,0.3)' }}>
                            {completedAt}
                        </span>
                    </p>
                </div>
            </div>

            {/* ── Exchange summary ── */}
            <div style={{ ...CARD_STYLE }}>
                {/* Header */}
                <div
                    style={{
                        padding: '14px 16px',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}
                >
                    <p style={{ ...LABEL_STYLE, margin: 0 }}>
                        Exchange Summary
                    </p>
                </div>
                <div style={{ padding: '16px' }}>
                    {/* Both panels side by side */}
                    <div
                        style={{
                            display: 'flex',
                            gap: '10px',
                            flexWrap: 'wrap',
                        }}
                    >
                        <OfferPanel
                            name={myName}
                            isYou={true}
                            offer={myOffer}
                            accentRgb="139,92,246"
                            accentHsl="hsl(264,100%,64%)"
                        />
                        {/* Arrow divider */}
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                flexShrink: 0,
                                padding: '0 2px',
                            }}
                        >
                            <ArrowLeftRight
                                size={16}
                                color="rgba(255,255,255,0.2)"
                            />
                        </div>
                        <OfferPanel
                            name={partnerName}
                            isYou={false}
                            offer={theirOffer}
                            accentRgb="52,211,153"
                            accentHsl="hsl(157,90%,51%)"
                        />
                    </div>

                    {/* What you got / what you gave — personal summary row */}
                    <div
                        style={{
                            marginTop: '14px',
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '10px',
                        }}
                    >
                        <div
                            style={{
                                borderRadius: '12px',
                                background: 'rgba(139,92,246,0.06)',
                                border: '1px solid rgba(139,92,246,0.15)',
                                padding: '12px 14px',
                            }}
                        >
                            <p
                                style={{
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    letterSpacing: '0.1em',
                                    textTransform: 'uppercase' as const,
                                    color: 'rgba(139,92,246,0.8)',
                                    margin: '0 0 8px',
                                }}
                            >
                                You Gave
                            </p>
                            <OfferSummaryList
                                offer={myOffer}
                                emptyLabel="Nothing"
                            />
                        </div>
                        <div
                            style={{
                                borderRadius: '12px',
                                background: 'rgba(52,211,153,0.06)',
                                border: '1px solid rgba(52,211,153,0.15)',
                                padding: '12px 14px',
                            }}
                        >
                            <p
                                style={{
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    letterSpacing: '0.1em',
                                    textTransform: 'uppercase' as const,
                                    color: 'hsl(157,90%,51%)',
                                    margin: '0 0 8px',
                                }}
                            >
                                You Received
                            </p>
                            <OfferSummaryList
                                offer={theirOffer}
                                emptyLabel="Nothing"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Trade details ── */}
            <div style={{ ...CARD_STYLE, padding: '14px 16px' }}>
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '13px',
                        }}
                    >
                        <span style={{ color: 'rgba(255,255,255,0.35)' }}>
                            Status
                        </span>
                        <span
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                color: 'hsl(157,90%,51%)',
                                fontWeight: 600,
                            }}
                        >
                            <CheckCircle size={13} /> Completed
                        </span>
                    </div>
                    <div
                        style={{
                            height: '1px',
                            background: 'rgba(255,255,255,0.05)',
                        }}
                    />
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '13px',
                        }}
                    >
                        <span style={{ color: 'rgba(255,255,255,0.35)' }}>
                            Participants
                        </span>
                        <span
                            style={{
                                color: 'rgba(255,255,255,0.7)',
                                fontWeight: 500,
                            }}
                        >
                            {myName} &amp; {partnerName}
                        </span>
                    </div>
                    <div
                        style={{
                            height: '1px',
                            background: 'rgba(255,255,255,0.05)',
                        }}
                    />
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '13px',
                        }}
                    >
                        <span style={{ color: 'rgba(255,255,255,0.35)' }}>
                            Completed at
                        </span>
                        <span
                            style={{
                                color: 'rgba(255,255,255,0.5)',
                                fontFamily: '"DM Mono", monospace',
                                fontSize: '12px',
                            }}
                        >
                            {completedAt}
                        </span>
                    </div>
                </div>
            </div>

            <p
                style={{
                    textAlign: 'center',
                    fontSize: '12px',
                    color: 'rgba(255,255,255,0.2)',
                    margin: 0,
                }}
            >
                You can close this tab.
            </p>
        </div>
    );
}

function OfferSummaryList({
    offer,
    emptyLabel,
}: {
    offer: Offer | null | undefined;
    emptyLabel: string;
}) {
    const empty =
        !offer ||
        (offer.gold <= 0 &&
            offer.diamonds <= 0 &&
            (offer.materials ?? []).length === 0);
    if (empty) {
        return (
            <p
                style={{
                    fontSize: '13px',
                    color: 'rgba(255,255,255,0.25)',
                    fontStyle: 'italic',
                    margin: 0,
                }}
            >
                {emptyLabel}
            </p>
        );
    }
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {(offer?.gold ?? 0) > 0 && (
                <span
                    style={{
                        fontSize: '13px',
                        color: 'rgba(255,255,255,0.8)',
                        fontWeight: 500,
                    }}
                >
                    💰 {offer!.gold.toLocaleString()} Gold
                </span>
            )}
            {(offer?.diamonds ?? 0) > 0 && (
                <span
                    style={{
                        fontSize: '13px',
                        color: 'rgba(255,255,255,0.8)',
                        fontWeight: 500,
                    }}
                >
                    💎 {offer!.diamonds.toLocaleString()} Diamonds
                </span>
            )}
            {(offer?.materials ?? []).map((m) => (
                <span
                    key={m.name}
                    style={{
                        fontSize: '13px',
                        color: 'rgba(255,255,255,0.8)',
                        fontWeight: 500,
                    }}
                >
                    🪨 {m.name} ×{m.quantity}
                </span>
            ))}
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
    balance,
    cap,
    disabled,
    onChange,
}: {
    label: string;
    value: number;
    balance: number; // player's actual balance
    cap: number; // hard cap (10000 gold / 10 diamonds)
    disabled?: boolean;
    onChange: (v: number) => void;
}) {
    // Effective max = min(what player has, hard cap)
    const effectiveMax = Math.min(balance, cap);
    const overBalance = value > balance;
    const overCap = value > cap;
    const hasWarning = overBalance || overCap;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Label row */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}
            >
                <label
                    style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.6)',
                    }}
                >
                    {label}
                </label>
                <span
                    style={{
                        fontSize: '11px',
                        color: 'rgba(255,255,255,0.3)',
                        display: 'flex',
                        gap: '6px',
                    }}
                >
                    <span>💼 {balance.toLocaleString()} available</span>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span>cap {cap.toLocaleString()}</span>
                </span>
            </div>

            {/* Input row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                    onClick={() => onChange(Math.max(0, value - 1))}
                    disabled={disabled || value <= 0}
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
                    max={effectiveMax}
                    value={value}
                    disabled={disabled}
                    onChange={(e) =>
                        onChange(
                            Math.min(
                                effectiveMax,
                                Math.max(0, parseInt(e.target.value) || 0)
                            )
                        )
                    }
                    className="tq-input"
                    style={
                        hasWarning
                            ? {
                                  borderColor: 'hsl(0,72%,65%)',
                                  color: 'hsl(0,72%,65%)',
                              }
                            : {}
                    }
                />
                <button
                    onClick={() => onChange(Math.min(effectiveMax, value + 1))}
                    disabled={disabled || value >= effectiveMax}
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

            {/* Slider */}
            <input
                type="range"
                min={0}
                max={effectiveMax}
                value={Math.min(value, effectiveMax)}
                disabled={disabled}
                onChange={(e) => onChange(parseInt(e.target.value))}
                className="tq-range"
            />

            {/* Balance bar */}
            <div
                style={{
                    position: 'relative',
                    height: '3px',
                    borderRadius: '2px',
                    background: 'rgba(255,255,255,0.06)',
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        height: '100%',
                        borderRadius: '2px',
                        width: `${effectiveMax > 0 ? Math.min(100, (value / effectiveMax) * 100) : 0}%`,
                        background: hasWarning
                            ? 'hsl(0,72%,55%)'
                            : 'linear-gradient(90deg, hsl(157,90%,40%), hsl(157,90%,55%))',
                        transition: 'width 0.2s',
                    }}
                />
            </div>

            {/* Warning */}
            {overCap && (
                <p
                    style={{
                        fontSize: '11px',
                        color: 'hsl(0,72%,65%)',
                        margin: 0,
                    }}
                >
                    ⚠️ Max tradeable is {cap.toLocaleString()} (hard cap)
                </p>
            )}
            {overBalance && !overCap && (
                <p
                    style={{
                        fontSize: '11px',
                        color: 'hsl(0,72%,65%)',
                        margin: 0,
                    }}
                >
                    ⚠️ You only have {balance.toLocaleString()} available
                </p>
            )}
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
                    fontSize: '15px',
                    fontWeight: 700,
                    color: 'rgba(255,255,255,1)',
                    fontFamily: '"DM Mono", monospace',
                }}
            >
                {value}
            </span>
        </div>
    );
}

export default Trade;
