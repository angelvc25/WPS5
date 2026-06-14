import React, { useState, useRef, useCallback } from "react";

type WidgetId =
    | "controller"
    | "trophies"
    | "store"
    | "news"
    | "addgame"
    | "recent"
    | "messages"
    | "storage"
    | "wishlist"
    | "background";

interface Widget {
    id: WidgetId;
    row: 0 | 1;
}

const TROPHY_DATA = { platinum: 0, gold: 9, silver: 28, bronze: 195, total: 232 };

function ControllerWidget({ expanded }: { expanded: boolean }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={iconCircle}>
                    <GamepadIcon />
                </div>
                <div style={{ flex: 1 }}>
                    <p style={wTitle}>DualSense Controller</p>
                    <p style={{ ...wSub, color: "#4CD964", display: "flex", alignItems: "center", gap: 4 }}>
                        <BatteryIcon /> 75%
                    </p>
                </div>
            </div>
            {expanded && (
                <div style={{ borderTop: "0.5px solid rgba(255,255,255,0.1)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                    <Row label="Estado" value="Conectado · USB" />
                    <Row label="Vibración" value="Activada" />
                    <Row label="Touchpad" value="Activado" />
                    <Row label="Indicador" value="Azul" />
                </div>
            )}
        </div>
    );
}

function TrophiesWidget({ expanded }: { expanded: boolean }) {
    const items = [
        { color: "#B8D4E8", label: "Platino", count: TROPHY_DATA.platinum },
        { color: "#FFD700", label: "Oro", count: TROPHY_DATA.gold },
        { color: "#C0C0C0", label: "Plata", count: TROPHY_DATA.silver },
        { color: "#CD7F32", label: "Bronce", count: TROPHY_DATA.bronze },
    ];
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <TrophyIcon color="#FFD700" size={16} />
                    <p style={wTitle}>Trofeos</p>
                </div>
                <p style={wSub}>Total: {TROPHY_DATA.total}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: expanded ? 16 : 10 }}>
                {items.map((t) => (
                    <div key={t.label} style={{ display: "flex", flexDirection: expanded ? "column" : "row", alignItems: "center", gap: expanded ? 4 : 2 }}>
                        <TrophyIcon color={t.color} size={expanded ? 18 : 12} />
                        <span style={{ color: "#fff", fontSize: expanded ? 14 : 11, fontWeight: 600 }}>{t.count}</span>
                        {expanded && <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 10 }}>{t.label}</span>}
                    </div>
                ))}
            </div>
            {expanded && (
                <div style={{ borderTop: "0.5px solid rgba(255,255,255,0.1)", paddingTop: 8 }}>
                    <p style={{ ...wSub, fontSize: 11 }}>Nivel PSN: 14 · Progreso al nivel 15: 62%</p>
                    <div style={{ height: 4, borderRadius: 2, background: "#1423318e", marginTop: 6, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: "62%", background: "#FFD700", borderRadius: 2 }} />
                    </div>
                </div>
            )}
        </div>
    );
}

function StoreWidget({ expanded }: { expanded: boolean }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <BagIcon />
                <p style={wTitle}>PlayStation Store</p>
            </div>
            <p style={wSub}>Descubre las últimas ofertas</p>
            <p style={{ color: "#4e9fe8", fontSize: 12, fontWeight: 700, margin: 0 }}>Ver tienda →</p>
            {expanded && (
                <div style={{ borderTop: "0.5px solid rgba(255,255,255,0.1)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    <p style={{ color: "#FFD700", fontSize: 11, fontWeight: 600, margin: 0 }}>🔥 Ofertas esta semana</p>
                    {["God of War Ragnarök  −40%", "Spider-Man 2  −35%", "Horizon FW  −50%"].map((g) => (
                        <p key={g} style={{ ...wSub, margin: 0 }}>{g}</p>
                    ))}
                </div>
            )}
        </div>
    );
}

function NewsWidget({ expanded }: { expanded: boolean }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <NewsIcon />
                <p style={wTitle}>Noticias</p>
            </div>
            <p style={wSub}>Descubre juegos nuevos</p>
            {expanded && (
                <div style={{ borderTop: "0.5px solid rgba(255,255,255,0.1)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    {[
                        "Ghost of Yōtei — nuevo tráiler revealed",
                        "PS Plus junio: 3 juegos gratis",
                        "Actualización firmware 8.10 disponible",
                    ].map((n) => (
                        <div key={n} style={{ display: "flex", gap: 6 }}>
                            <div style={{ width: 3, minWidth: 3, height: "auto", background: "#4e9fe8", borderRadius: 2 }} />
                            <p style={{ ...wSub, margin: 0, fontSize: 11 }}>{n}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function AddGameWidget({ expanded }: { expanded: boolean }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ ...iconCircle, width: 34, height: 34, borderRadius: 17 }}>
                <span style={{ color: "#fff", fontSize: 20, lineHeight: 1 }}>+</span>
            </div>
            <div style={{ flex: 1 }}>
                <p style={wTitle}>Agregar Juego</p>
                <p style={wSub}>{expanded ? "Busca y agrega accesos directos a tus juegos favoritos" : "Agrega accesos directos"}</p>
            </div>
        </div>
    );
}

function RecentWidget({ expanded }: { expanded: boolean }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <ControllerSmIcon />
                <p style={wTitle}>Jugados recientemente</p>
            </div>
            <p style={{ color: "#666", fontSize: 11, fontStyle: "italic", margin: 0 }}>Sin juegos recientes</p>
            {expanded && (
                <p style={{ ...wSub, fontSize: 11, margin: 0 }}>Los juegos que abras aparecerán aquí automáticamente.</p>
            )}
        </div>
    );
}

function MessagesWidget({ expanded }: { expanded: boolean }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <ChatIcon />
                <p style={wTitle}>Mensajes</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 14, background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <PersonIcon />
                </div>
                <div>
                    <p style={{ ...wTitle, fontSize: 12 }}>Usuario</p>
                    <p style={wSub}>Sin mensajes</p>
                </div>
            </div>
            {expanded && (
                <div style={{ borderTop: "0.5px solid rgba(255,255,255,0.1)", paddingTop: 8 }}>
                    <p style={{ ...wSub, fontSize: 11, margin: 0 }}>Tus mensajes de amigos de PSN aparecerán aquí.</p>
                </div>
            )}
        </div>
    );
}

function StorageWidget({ expanded }: { expanded: boolean }) {
    const used = 65;
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <HddIcon />
                    <p style={wTitle}>Almacenamiento</p>
                </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
                <p style={wSub}>Espacio libre</p>
                <p style={{ color: "#fff", fontSize: 11, fontWeight: 700, margin: 0 }}>36.47 GB</p>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${used}%`, background: "#0070D1", borderRadius: 2 }} />
            </div>
            {expanded && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                    <Row label="Usado" value={`${used}% · ~67 GB`} />
                    <Row label="Juegos" value="58.2 GB" />
                    <Row label="Guardados" value="3.1 GB" />
                    <Row label="Capturas" value="5.7 GB" />
                </div>
            )}
        </div>
    );
}

function WishlistWidget({ expanded }: { expanded: boolean }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <HeartIcon />
                <p style={wTitle}>Lista de deseos</p>
            </div>
            <p style={wSub}>{expanded ? "0 juegos guardados en tu lista" : "Ver tu lista de deseos"}</p>
            {expanded && (
                <p style={{ ...wSub, fontSize: 11, margin: 0 }}>Guarda juegos desde la PS Store para no perderlos de vista.</p>
            )}
        </div>
    );
}

function BackgroundWidget({ expanded }: { expanded: boolean }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ ...iconCircle, width: 34, height: 34, borderRadius: 17 }}>
                <ImageIcon />
            </div>
            <div style={{ flex: 1 }}>
                <p style={wTitle}>Cambiar Fondo</p>
                <p style={wSub}>{expanded ? "Elige una imagen de tu biblioteca o descarga nuevos temas" : "Personaliza tu consola"}</p>
            </div>
        </div>
    );
}

const WIDGET_CONTENT: Record<WidgetId, (expanded: boolean) => React.ReactNode> = {
    controller: (e) => <ControllerWidget expanded={e} />,
    trophies: (e) => <TrophiesWidget expanded={e} />,
    store: (e) => <StoreWidget expanded={e} />,
    news: (e) => <NewsWidget expanded={e} />,
    addgame: (e) => <AddGameWidget expanded={e} />,
    recent: (e) => <RecentWidget expanded={e} />,
    messages: (e) => <MessagesWidget expanded={e} />,
    storage: (e) => <StorageWidget expanded={e} />,
    wishlist: (e) => <WishlistWidget expanded={e} />,
    background: (e) => <BackgroundWidget expanded={e} />,
};

const INITIAL_WIDGETS: WidgetId[] = [
    "controller", "trophies", "store", "news", "addgame",
    "recent", "messages", "storage", "wishlist", "background"
];

export default function PS5WidgetRow() {
    const [widgets, setWidgets] = useState<WidgetId[]>(INITIAL_WIDGETS);
    // Cambiamos el estado a un arreglo para permitir múltiples expandidos
    const [expanded, setExpanded] = useState<WidgetId[]>([]);
    const [focused, setFocused] = useState<WidgetId | null>(null);

    const dragSrc = useRef<number | null>(null);

    const handleDragStart = useCallback((idx: number) => {
        dragSrc.current = idx;
    }, []);

    const handleDrop = useCallback(
        (targetIdx: number) => {
            if (dragSrc.current === null) return;
            const srcIdx = dragSrc.current;
            if (srcIdx === targetIdx) return;

            setWidgets((prev) => {
                const next = [...prev];
                const srcId = next[srcIdx];
                const tgtId = next[targetIdx];
                next[srcIdx] = tgtId;
                next[targetIdx] = srcId;
                return next;
            });
            dragSrc.current = null;
        },
        []
    );

    const toggleExpand = useCallback((id: WidgetId) => {
        setExpanded((prev) =>
            // Si el ID ya está expandido, lo quitamos. Si no, lo agregamos.
            prev.includes(id) ? prev.filter((wId) => wId !== id) : [...prev, id]
        );
    }, []);

    return (
        <div
            style={{
                background: "transparent",
                padding: "20px 16px",
                borderRadius: 16,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                minHeight: 200,
                userSelect: "none",
            }}
        >
            <div
                style={{
                    display: "grid",
                    gridTemplateRows: "repeat(3, 85px)",
                    gridAutoColumns: "280px",
                    gridAutoFlow: "column",
                    gap: 10,
                    overflowX: "auto",
                    paddingBottom: 8,
                }}
            >
                {widgets.map((id, idx) => {
                    // Validamos si el arreglo incluye el ID actual
                    const isExpanded = expanded.includes(id);
                    const isFocused = focused === id;
                    return (
                        <div
                            key={id}
                            draggable
                            onDragStart={() => handleDragStart(idx)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => handleDrop(idx)}
                            onClick={() => {
                                setFocused(id);
                                toggleExpand(id);
                            }}
                            style={{
                                // estilos de widget en ps5
                                gridRow: isExpanded ? "span 2" : "span 1",
                                background: isFocused
                                    ? "linear-gradient(90deg, rgba(55, 65, 70, 1) 0%, rgba(12, 26, 39, 1) 100%)"
                                    : "#121a22ef",
                                // border: isFocused
                                //     ? "1.5px solid rgba(255,255,255,0.35)"
                                //     : "0.5px solid rgba(255,255,255,0.1)",
                                borderRadius: 12,
                                padding: "12px 14px",
                                cursor: "grab",
                                transition: "background 0.15s, border-color 0.15s",
                                display: "flex",
                                flexDirection: "column",
                                gap: 0,
                                boxSizing: "border-box",
                                overflow: "hidden",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "flex-end",
                                    marginBottom: 4,
                                    opacity: 0.35,
                                    gap: 6,
                                }}
                            >
                                <span style={{ fontSize: 9, color: "#fff", letterSpacing: "0.05em" }}>
                                    {isExpanded ? "▲ contraer" : "▼ expandir"}
                                </span>
                                <span style={{ fontSize: 9, color: "#fff" }}>⠿ mover</span>
                            </div>
                            {WIDGET_CONTENT[id](isExpanded)}
                        </div>
                    );
                })}
            </div>

            <p
                style={{
                    color: "rgba(255,255,255,0.18)",
                    fontSize: 10,
                    margin: "4px 0 0",
                    textAlign: "center",
                }}
            >
                Arrastra para reordenar · Toca para expandir
            </p>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{label}</span>
            <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: 500 }}>{value}</span>
        </div>
    );
}

const wTitle: React.CSSProperties = {
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    margin: 0,
    lineHeight: 1.3,
};

const wSub: React.CSSProperties = {
    color: "rgba(255,255,255,0.45)",
    fontSize: 10,
    margin: "2px 0 0",
    lineHeight: 1.3,
};

const iconCircle: React.CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: 17,
    background: "rgba(255,255,255,0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
};

function GamepadIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="20" height="12" rx="4" />
            <path d="M6 12h4M8 10v4M15 11h2M15 13h2" />
        </svg>
    );
}

function TrophyIcon({ color, size }: { color: string; size: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9H4a2 2 0 0 1-2-2V5h4" />
            <path d="M18 9h2a2 2 0 0 0 2-2V5h-4" />
            <path d="M12 17v4" />
            <path d="M8 21h8" />
            <path d="M6 5v7a6 6 0 0 0 12 0V5H6z" />
        </svg>
    );
}

function BagIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4e9fe8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
    );
}

function NewsIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
            <path d="M18 14h-8M15 18h-5M10 6h8v4h-8z" />
        </svg>
    );
}

function ControllerSmIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="20" height="12" rx="4" />
            <path d="M6 12h4M8 10v4M15 11h2M15 13h2" />
        </svg>
    );
}

function ChatIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
    );
}

function PersonIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </svg>
    );
}

function HddIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
        </svg>
    );
}

function HeartIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF6B6B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
    );
}

function ImageIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
        </svg>
    );
}

function BatteryIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4CD964" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="6" width="18" height="12" rx="2" ry="2" />
            <line x1="23" y1="13" x2="23" y2="11" />
            <line x1="5" y1="10" x2="5" y2="14" />
            <line x1="9" y1="10" x2="9" y2="14" />
            <line x1="13" y1="10" x2="13" y2="14" />
        </svg>
    );
}