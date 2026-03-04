import React, { useCallback, useRef, useState } from "react";
import { Upload, File, CheckCircle2, AlertCircle, Loader2, Plus, X, Database } from "lucide-react";
import axios from "axios";

interface IngestedDoc {
    id: string;
    name: string;
    chunks: number;
    status: "success" | "error" | "loading";
    timestamp: number;
}

interface DocumentUploadProps {
    onClose: () => void;
}

export function DocumentUpload({ onClose }: DocumentUploadProps) {
    const [isDragOver, setIsDragOver] = useState(false);
    const [docs, setDocs] = useState<IngestedDoc[]>([]);
    const [manualText, setManualText] = useState("");
    const [manualName, setManualName] = useState("");
    const [isIngesting, setIsIngesting] = useState(false);
    const [tab, setTab] = useState<"upload" | "text" | "docs">("upload");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const ingestText = useCallback(
        async (text: string, name: string) => {
            if (!text.trim()) return;

            // Chunk text into ~500-char segments
            const chunks: string[] = [];
            const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
            let current = "";
            for (const sent of sentences) {
                if ((current + sent).length > 500 && current) {
                    chunks.push(current.trim());
                    current = sent;
                } else {
                    current += " " + sent;
                }
            }
            if (current.trim()) chunks.push(current.trim());

            const docId = `doc-${Date.now()}`;
            const doc: IngestedDoc = {
                id: docId,
                name,
                chunks: chunks.length,
                status: "loading",
                timestamp: Date.now(),
            };

            setDocs((prev) => [doc, ...prev]);

            try {
                setIsIngesting(true);
                await Promise.all(
                    chunks.map((chunk) =>
                        axios.post("/api/ingest", { text: chunk, source: name })
                    )
                );
                setDocs((prev) =>
                    prev.map((d) => (d.id === docId ? { ...d, status: "success" } : d))
                );
            } catch {
                setDocs((prev) =>
                    prev.map((d) => (d.id === docId ? { ...d, status: "error" } : d))
                );
            } finally {
                setIsIngesting(false);
            }
        },
        []
    );

    const handleFiles = useCallback(
        async (files: FileList | File[]) => {
            const arr = Array.from(files);
            for (const file of arr) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const text = e.target?.result as string;
                    ingestText(text, file.name);
                };
                reader.readAsText(file);
            }
        },
        [ingestText]
    );

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragOver(false);
            handleFiles(e.dataTransfer.files);
        },
        [handleFiles]
    );

    const handleManualIngest = () => {
        if (!manualText.trim()) return;
        ingestText(manualText, manualName || "Manual Entry");
        setManualText("");
        setManualName("");
        setTab("docs");
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(2,4,10,0.85)", backdropFilter: "blur(8px)" }}
        >
            <div
                className="relative"
                style={{
                    width: "min(600px, 95vw)",
                    background: "var(--vv-bg-panel)",
                    border: "1px solid var(--vv-border)",
                    borderRadius: "var(--vv-radius-lg)",
                    boxShadow: "0 24px 80px rgba(124,58,237,0.2)",
                    overflow: "hidden",
                }}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-4 py-3"
                    style={{
                        borderBottom: "1px solid var(--vv-border-subtle)",
                        background:
                            "linear-gradient(90deg, rgba(124,58,237,0.08), transparent)",
                    }}
                >
                    <div className="flex items-center gap-2">
                        <div
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: 8,
                                background: "rgba(124,58,237,0.2)",
                                border: "1px solid rgba(124,58,237,0.35)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <Database size={16} color="#c4b5fd" />
                        </div>
                        <div>
                            <div
                                style={{
                                    fontFamily: "var(--font-display)",
                                    fontWeight: 700,
                                    fontSize: 15,
                                    color: "var(--vv-text-primary)",
                                }}
                            >
                                Document Ingestion
                            </div>
                            <div style={{ fontSize: 11, color: "var(--vv-text-muted)" }}>
                                Upload & embed into MongoDB Atlas
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="btn btn-ghost btn-icon"
                        style={{ color: "var(--vv-text-muted)" }}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Tabs */}
                <div
                    className="flex"
                    style={{
                        borderBottom: "1px solid var(--vv-border-subtle)",
                        padding: "0 16px",
                    }}
                >
                    {(["upload", "text", "docs"] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            style={{
                                padding: "10px 16px",
                                fontSize: 12,
                                fontWeight: 600,
                                textTransform: "capitalize",
                                background: "none",
                                border: "none",
                                borderBottom: tab === t ? "2px solid var(--vv-primary)" : "2px solid transparent",
                                color: tab === t ? "#c4b5fd" : "var(--vv-text-muted)",
                                cursor: "pointer",
                                transition: "all 0.2s",
                                marginBottom: -1,
                            }}
                        >
                            {t === "docs" ? `Ingested (${docs.filter(d => d.status === "success").length})` : t === "upload" ? "Upload Files" : "Paste Text"}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div style={{ padding: 20, maxHeight: "60vh", overflowY: "auto" }}>
                    {tab === "upload" && (
                        <div>
                            <div
                                className={`upload-zone ${isDragOver ? "drag-over" : ""}`}
                                style={{
                                    padding: 32,
                                    textAlign: "center",
                                    marginBottom: 12,
                                }}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setIsDragOver(true);
                                }}
                                onDragLeave={() => setIsDragOver(false)}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <div
                                    style={{
                                        width: 56,
                                        height: 56,
                                        borderRadius: "50%",
                                        background: "rgba(124,58,237,0.12)",
                                        border: "1px solid rgba(124,58,237,0.3)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        margin: "0 auto 12px",
                                    }}
                                >
                                    <Upload size={24} color="#c4b5fd" />
                                </div>
                                <div
                                    style={{
                                        fontWeight: 600,
                                        fontSize: 14,
                                        color: "var(--vv-text-primary)",
                                        marginBottom: 4,
                                    }}
                                >
                                    Drop files here or click to browse
                                </div>
                                <div style={{ fontSize: 12, color: "var(--vv-text-muted)" }}>
                                    Supports .txt, .md, .csv, .json files
                                </div>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                multiple
                                accept=".txt,.md,.csv,.json"
                                style={{ display: "none" }}
                                onChange={(e) => e.target.files && handleFiles(e.target.files)}
                            />
                            <p
                                style={{
                                    fontSize: 11,
                                    color: "var(--vv-text-muted)",
                                    textAlign: "center",
                                }}
                            >
                                Files are chunked, embedded with{" "}
                                <span style={{ color: "#c4b5fd" }}>all-MiniLM-L6-v2</span>, and
                                stored in{" "}
                                <span style={{ color: "#67e8f9" }}>MongoDB Atlas Vector Search</span>
                            </p>
                        </div>
                    )}

                    {tab === "text" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <div>
                                <label className="section-label">Source Name</label>
                                <input
                                    className="vv-input"
                                    placeholder="e.g. Research Paper, Meeting Notes..."
                                    value={manualName}
                                    onChange={(e) => setManualName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="section-label">Content</label>
                                <textarea
                                    className="vv-input"
                                    placeholder="Paste your document content here..."
                                    value={manualText}
                                    onChange={(e) => setManualText(e.target.value)}
                                    rows={8}
                                    style={{ resize: "vertical" }}
                                />
                            </div>
                            <button
                                className="btn btn-primary"
                                onClick={handleManualIngest}
                                disabled={!manualText.trim() || isIngesting}
                                style={{ alignSelf: "flex-start" }}
                            >
                                {isIngesting ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <Plus size={14} />
                                )}
                                Ingest into Atlas
                            </button>
                        </div>
                    )}

                    {tab === "docs" && (
                        <div>
                            {docs.length === 0 ? (
                                <div
                                    style={{
                                        textAlign: "center",
                                        padding: "32px 0",
                                        color: "var(--vv-text-muted)",
                                    }}
                                >
                                    <Database size={32} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
                                    <div style={{ fontSize: 13 }}>No documents ingested yet</div>
                                </div>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {docs.map((doc) => (
                                        <div
                                            key={doc.id}
                                            className="vv-card"
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 12,
                                                padding: 12,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    width: 36,
                                                    height: 36,
                                                    borderRadius: 8,
                                                    background:
                                                        doc.status === "success"
                                                            ? "rgba(16,185,129,0.12)"
                                                            : doc.status === "error"
                                                                ? "rgba(239,68,68,0.12)"
                                                                : "rgba(124,58,237,0.12)",
                                                    border: `1px solid ${doc.status === "success"
                                                            ? "rgba(16,185,129,0.3)"
                                                            : doc.status === "error"
                                                                ? "rgba(239,68,68,0.3)"
                                                                : "rgba(124,58,237,0.3)"
                                                        }`,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    flexShrink: 0,
                                                }}
                                            >
                                                {doc.status === "loading" ? (
                                                    <Loader2 size={16} className="animate-spin" color="#c4b5fd" />
                                                ) : doc.status === "success" ? (
                                                    <CheckCircle2 size={16} color="#6ee7b7" />
                                                ) : (
                                                    <AlertCircle size={16} color="#fca5a5" />
                                                )}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div
                                                    style={{
                                                        fontSize: 13,
                                                        fontWeight: 600,
                                                        color: "var(--vv-text-primary)",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    {doc.name}
                                                </div>
                                                <div style={{ fontSize: 11, color: "var(--vv-text-muted)" }}>
                                                    {doc.chunks} chunk{doc.chunks !== 1 ? "s" : ""} ·{" "}
                                                    {doc.status === "success"
                                                        ? "Embedded in Atlas"
                                                        : doc.status === "error"
                                                            ? "Failed"
                                                            : "Processing..."}
                                                </div>
                                            </div>
                                            <span
                                                className={`badge ${doc.status === "success"
                                                        ? "badge-emerald"
                                                        : doc.status === "error"
                                                            ? "badge-danger"
                                                            : "badge-primary"
                                                    }`}
                                            >
                                                {doc.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
