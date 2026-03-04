import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  BookOpen,
  Apple,
  Flower2,
  GitBranch,
  Leaf,
  Loader2,
  Plus,
  Scissors,
  Search,
  Sparkles,
  Trophy,
  WandSparkles,
  Upload,
  Database,
  Zap,
  Brain,
  Network,
  Target,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { KnowledgeForest } from "./components/KnowledgeForest";
import { DocumentUpload } from "./components/DocumentUpload";
import { Flashcard, GraphData, GraphNode, QuizQuestion } from "./types";
import { useForestState } from "./hooks/useForestState";

type Tool = "study" | "growth" | "prune" | "flashcard" | "blossom" | "fruit";

type SavedSession = {
  id: string;
  savedAt: number;
  query: string;
  graphData: GraphData;
  selectedNodeId: string | null;
  negativePromptKeywords: string[];
  quiz: QuizQuestion[];
  quizAnswers: number[];
  quizResult: { correct: number; total: number } | null;
  filters: { synthetic: boolean; real: boolean };
};

type CloudSessionSummary = {
  id: string;
  query: string;
  savedAt: string;
  nodeCount: number;
};

const SESSION_STORAGE_KEY = "vectorvortex.saved.sessions.v1";
const MAX_SAVED_SESSIONS = 12;

const TOOL_DEFS = [
  { id: "study" as Tool, icon: BookOpen, color: "#06b6d4", label: "Study", tip: "Click node to inspect" },
  { id: "growth" as Tool, icon: Plus, color: "#10b981", label: "Grow", tip: "Expand node with related topics" },
  { id: "prune" as Tool, icon: Scissors, color: "#f59e0b", label: "Prune", tip: "Remove subtree from graph" },
  { id: "flashcard" as Tool, icon: Leaf, color: "#8b5cf6", label: "Leaf", tip: "Generate flashcards" },
  { id: "blossom" as Tool, icon: Flower2, color: "#ec4899", label: "Blossom", tip: "Mark as learned" },
  { id: "fruit" as Tool, icon: Apple, color: "#ef4444", label: "Quiz", tip: "Generate quiz from learned path" },
];

function normalizeText(value: any, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function ScoreRing({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80 ? "#10b981" : pct >= 60 ? "#06b6d4" : pct >= 40 ? "#f59e0b" : "#94a3b8";
  return (
    <div
      className="score-ring"
      style={{ borderColor: color, color, fontSize: 10 }}
    >
      {pct}
    </div>
  );
}

function FlashCard({ card, index }: { card: Flashcard; index: number }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div
      className={`flip-card ${flipped ? "flipped" : ""}`}
      onClick={() => setFlipped((v) => !v)}
      style={{ marginBottom: 8 }}
    >
      <div className="flip-card-inner" style={{ minHeight: 72, position: "relative" }}>
        <div
          className="flip-face vv-card"
          style={{ padding: "12px 14px", minHeight: 72 }}
        >
          <div
            style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#67e8f9", marginBottom: 4, fontWeight: 700 }}
          >
            Q {index + 1} · tap to flip
          </div>
          <div style={{ fontSize: 12, color: "var(--vv-text-primary)", fontWeight: 500, lineHeight: 1.45 }}>
            {card.question}
          </div>
        </div>
        <div
          className="flip-face flip-back vv-card"
          style={{
            padding: "12px 14px",
            minHeight: 72,
            background: "rgba(124,58,237,0.1)",
            border: "1px solid rgba(124,58,237,0.25)",
          }}
        >
          <div
            style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#c4b5fd", marginBottom: 4, fontWeight: 700 }}
          >
            Answer
          </div>
          <div style={{ fontSize: 12, color: "var(--vv-text-primary)", lineHeight: 1.45 }}>
            {card.answer}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [activeTool, setActiveTool] = useState<Tool>("study");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState("Enter a query to begin exploring");
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [quizResult, setQuizResult] = useState<{ correct: number; total: number } | null>(null);
  const [quizNodeId, setQuizNodeId] = useState<string | null>(null);
  const [loadingNodeIds, setLoadingNodeIds] = useState<Set<string>>(new Set());
  const [showUpload, setShowUpload] = useState(false);
  const [ritualMode, setRitualMode] = useState(false);
  const ritualRef = React.useRef(0);
  const [filters, setFilters] = useState({ synthetic: true, real: true });
  const [dbStatus, setDbStatus] = useState<"connected" | "disconnected" | "checking">("checking");
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [cloudSessions, setCloudSessions] = useState<CloudSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeCloudSessionId, setActiveCloudSessionId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth <= 1024 : false,
  );
  const [showMobileInspector, setShowMobileInspector] = useState(false);

  const {
    graphData,
    rootId,
    selectedNode,
    setSelectedNode,
    expandingNodeId,
    setExpandingNodeId,
    alreadyVisibleIds,
    negativePromptKeywords,
    resetForest,
    hydrateForest,
    seedRoot,
    appendChildren,
    updateNode,
    pruneSubtree,
  } = useForestState();

  // Check DB connection on mount
  useEffect(() => {
    axios
      .get("/api/status")
      .then((res) => setDbStatus(res.data.status === "connected" ? "connected" : "disconnected"))
      .catch(() => setDbStatus("disconnected"));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSavedSessions(parsed.filter((s) => s && s.graphData && Array.isArray(s.graphData.nodes)));
      }
    } catch {
      // Ignore corrupted local storage payload.
    }
  }, []);

  useEffect(() => {
    if (!isMobile) setShowMobileInspector(false);
  }, [isMobile]);

  useEffect(() => {
    if (dbStatus === "connected") {
      void refreshCloudSessions();
    }
  }, [dbStatus]);

  const persistSessions = (sessions: SavedSession[]) => {
    setSavedSessions(sessions);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessions));
    }
  };

  const restoreSnapshot = (payload: {
    graphData: GraphData;
    selectedNodeId?: string | null;
    negativePromptKeywords?: string[];
    quiz?: QuizQuestion[];
    quizAnswers?: number[];
    quizResult?: { correct: number; total: number } | null;
    filters?: { synthetic: boolean; real: boolean };
    query?: string;
  }) => {
    hydrateForest({
      graphData: payload.graphData,
      selectedNodeId: payload.selectedNodeId || null,
      negativePromptKeywords: payload.negativePromptKeywords || [],
    });
    setQuery(payload.query || "");
    setQuiz(Array.isArray(payload.quiz) ? payload.quiz : []);
    setQuizAnswers(Array.isArray(payload.quizAnswers) ? payload.quizAnswers : []);
    setQuizResult(payload.quizResult || null);
    setQuizNodeId(payload.selectedNodeId || null);
    setFilters(payload.filters || { synthetic: true, real: true });
    setError(null);
  };

  const refreshCloudSessions = async () => {
    try {
      const response = await axios.get("/api/sessions");
      setCloudSessions(Array.isArray(response.data?.sessions) ? response.data.sessions : []);
    } catch {
      setCloudSessions([]);
    }
  };

  const serializeGraphData = (): GraphData => ({
    nodes: graphData.nodes.map((n) => ({ ...n })),
    links: graphData.links.map((l) => ({
      source: typeof l.source === "string" ? l.source : (l.source as any).id,
      target: typeof l.target === "string" ? l.target : (l.target as any).id,
    })),
  });

  const saveSession = () => {
    if (graphData.nodes.length === 0) {
      setSessionStatus("Nothing to save yet. Explore at least one topic first.");
      return;
    }

    const root = graphData.nodes.find((n) => n.type === "root");
    const snapshot: SavedSession = {
      id: `session-${Date.now()}`,
      savedAt: Date.now(),
      query: root?.label || query || "Untitled Session",
      graphData: serializeGraphData(),
      selectedNodeId: selectedNode?.id || null,
      negativePromptKeywords: [...negativePromptKeywords],
      quiz: [...quiz],
      quizAnswers: [...quizAnswers],
      quizResult,
      filters: { ...filters },
    };

    const next = [snapshot, ...savedSessions.filter((s) => s.id !== snapshot.id)].slice(
      0,
      MAX_SAVED_SESSIONS,
    );
    persistSessions(next);
    setActiveSessionId(snapshot.id);
    setSessionStatus(`Session saved (${next.length}/${MAX_SAVED_SESSIONS})`);
  };

  const loadSession = (sessionId: string) => {
    const target = savedSessions.find((s) => s.id === sessionId);
    if (!target) {
      setSessionStatus("Session not found.");
      return;
    }

    restoreSnapshot({
      query: target.query,
      graphData: target.graphData,
      selectedNodeId: target.selectedNodeId,
      negativePromptKeywords: target.negativePromptKeywords,
      quiz: target.quiz,
      quizAnswers: target.quizAnswers,
      quizResult: target.quizResult,
      filters: target.filters,
    });
    setActiveSessionId(target.id);
    setQuizNodeId(target.selectedNodeId || null);
    setError(null);
    setSessionStatus(`Loaded session from ${new Date(target.savedAt).toLocaleString()}`);
  };

  const saveSessionToCloud = async () => {
    if (graphData.nodes.length === 0) {
      setSessionStatus("Nothing to save yet. Explore at least one topic first.");
      return;
    }

    if (dbStatus !== "connected") {
      setSessionStatus("MongoDB is offline. Cloud save unavailable.");
      return;
    }

    try {
      const root = graphData.nodes.find((n) => n.type === "root");
      const payload = {
        query: root?.label || query || "Untitled Session",
        graphData: serializeGraphData(),
        selectedNodeId: selectedNode?.id || null,
        negativePromptKeywords: [...negativePromptKeywords],
        quiz: [...quiz],
        quizAnswers: [...quizAnswers],
        quizResult,
        filters: { ...filters },
      };
      const response = await axios.post("/api/sessions/save", payload);
      await refreshCloudSessions();
      setActiveCloudSessionId(response.data?.id || null);
      setSessionStatus(`Cloud session saved (${response.data?.id || "ok"})`);
    } catch (e: any) {
      setSessionStatus(e.response?.data?.error || "Cloud save failed.");
    }
  };

  const loadCloudSession = async (sessionId: string) => {
    try {
      const response = await axios.get(`/api/sessions/${sessionId}`);
      const snapshot = response.data?.snapshot || {};
      restoreSnapshot({
        query: response.data?.query || "",
        graphData: snapshot.graphData || { nodes: [], links: [] },
        selectedNodeId: snapshot.selectedNodeId || null,
        negativePromptKeywords: snapshot.negativePromptKeywords || [],
        quiz: snapshot.quiz || [],
        quizAnswers: snapshot.quizAnswers || [],
        quizResult: snapshot.quizResult || null,
        filters: snapshot.filters || { synthetic: true, real: true },
      });
      setActiveCloudSessionId(sessionId);
      setSessionStatus(`Loaded cloud session from ${new Date(response.data?.savedAt).toLocaleString()}`);
    } catch (e: any) {
      setSessionStatus(e.response?.data?.error || "Cloud load failed.");
    }
  };

  const clearWorkspace = () => {
    resetForest();
    setQuiz([]);
    setQuizAnswers([]);
    setQuizResult(null);
    setQuizNodeId(null);
    setError(null);
    setQuery("");
    setActiveSessionId(null);
    setSessionStatus("Workspace reset. Start a new exploration.");
  };

  const markNodeLoading = (nodeId: string, loading: boolean) => {
    setLoadingNodeIds((prev) => {
      const next = new Set(prev);
      loading ? next.add(nodeId) : next.delete(nodeId);
      return next;
    });
  };

  const metrics = React.useMemo(() => {
    const branches = graphData.nodes.filter((n) => n.type === "branch").length;
    const leaves = graphData.nodes.filter((n) => n.type === "leaf").length;
    const flowers = graphData.nodes.filter((n) => n.type === "flower").length;
    const fruits = graphData.nodes.filter((n) => n.type === "fruit").length;
    const completed = graphData.nodes.filter((n) => n.completed).length;
    return { branches, leaves, flowers, fruits, completed };
  }, [graphData.nodes]);

  const buildBranchPath = (targetId: string): string[] => {
    if (!rootId) return [selectedNode?.label || "Topic"];
    const parents = new Map<string, string>();
    for (const link of graphData.links) {
      const src = typeof link.source === "string" ? link.source : (link.source as any).id;
      const tgt = typeof link.target === "string" ? link.target : (link.target as any).id;
      if (!parents.has(tgt)) parents.set(tgt, src);
    }
    const pathIds: string[] = [];
    let cur: string | undefined = targetId;
    while (cur) {
      pathIds.push(cur);
      if (cur === rootId) break;
      cur = parents.get(cur);
    }
    return pathIds
      .reverse()
      .map((id) => graphData.nodes.find((n) => n.id === id)?.label)
      .filter(Boolean) as string[];
  };

  const explore = async (
    node: GraphNode,
    opts?: { isRoot?: boolean; visibleIdsOverride?: string[]; retryCount?: number }
  ) => {
    setError(null);
    setIsLoading(true);
    setExpandingNodeId(node.id);
    setSessionStatus(`Exploring ${node.label}...`);

    try {
      const visible = opts?.visibleIdsOverride || Array.from(alreadyVisibleIds);
      const visibleSet = new Set(visible);

      const response = await axios.post("/api/explore", {
        query: opts?.isRoot ? node.label : undefined,
        parentNodeId: node.id,
        parentText: node.text || node.summary || node.label,
        alreadyVisibleIds: visible,
        negativePromptKeywords,
      });

      let nodes = (response.data?.nodes || []) as GraphNode[];
      if (opts?.isRoot) nodes = nodes.slice(0, 5);

      const uniqueNew = nodes.filter((n) => !visibleSet.has(n.id)).length;
      if (uniqueNew === 0 && (opts?.retryCount || 0) < 1) {
        await explore(node, {
          isRoot: opts?.isRoot,
          visibleIdsOverride: visible,
          retryCount: (opts?.retryCount || 0) + 1,
        });
        return;
      }

      appendChildren(node.id, nodes);
      setSessionStatus(`${uniqueNew} new node${uniqueNew !== 1 ? "s" : ""} discovered`);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || "Explore failed");
      setSessionStatus("Search failed.");
    } finally {
      setIsLoading(false);
      setExpandingNodeId(null);
    }
  };

  const generateFlashcards = async (node: GraphNode) => {
    if (node.flashcards && node.flashcards.length > 0) {
      setSelectedNode(node);
      return;
    }
    markNodeLoading(node.id, true);
    setSessionStatus(`Generating flashcards for ${node.label}...`);
    try {
      const response = await axios.post("/api/flashcards", {
        label: node.label,
        text: node.text,
        summary: node.summary,
      });
      const flashcards = (response.data?.flashcards || []) as Flashcard[];
      updateNode(node.id, { flashcards, type: "leaf" });
      setSessionStatus(`${flashcards.length} flashcards generated`);
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || "Flashcard generation failed");
      setSessionStatus("Flashcard generation failed.");
    } finally {
      markNodeLoading(node.id, false);
    }
  };

  const blossomNode = (node: GraphNode) => {
    updateNode(node.id, { completed: true, type: "flower" });
    setSessionStatus(`${node.label} marked as learned ✓`);
  };

  const generateFruitQuiz = async (node: GraphNode) => {
    if (!node.completed) {
      setSessionStatus("Only blossomed nodes can bear fruit. Mark as learned first.");
      return;
    }
    markNodeLoading(node.id, true);
    setSessionStatus(`Generating quiz for ${node.label}...`);
    try {
      const path = buildBranchPath(node.id);
      const response = await axios.post("/api/fruit", { branchPath: path });
      const quizData = (response.data?.quiz || []) as QuizQuestion[];
      updateNode(node.id, { quiz: quizData, type: "fruit" });
      setQuiz(quizData);
      setQuizAnswers(Array(quizData.length).fill(-1));
      setQuizResult(null);
      setQuizNodeId(node.id);
      setSessionStatus("Quiz generated — answer to test your knowledge");
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || "Quiz generation failed");
    } finally {
      markNodeLoading(node.id, false);
    }
  };

  const handleToolAction = async (node: GraphNode) => {
    setSelectedNode(node);
    const nodeQuiz = node.quiz || [];
    if (nodeQuiz.length > 0) {
      setQuiz(nodeQuiz);
      setQuizAnswers(Array(nodeQuiz.length).fill(-1));
      setQuizResult(null);
      setQuizNodeId(node.id);
    } else if (quizNodeId && quizNodeId !== node.id) {
      setQuiz([]);
      setQuizAnswers([]);
      setQuizResult(null);
      setQuizNodeId(null);
    }
    if (activeTool === "study") return;
    if (activeTool === "growth") { await explore(node); return; }
    if (activeTool === "prune") {
      pruneSubtree(node.id);
      setSessionStatus(`Pruned ${node.label}`);
      return;
    }
    if (activeTool === "flashcard") { await generateFlashcards(node); return; }
    if (activeTool === "blossom") { blossomNode(node); return; }
    if (activeTool === "fruit") { await generateFruitQuiz(node); }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key >= "1" && e.key <= "6") {
        setActiveTool(TOOL_DEFS[Number(e.key) - 1].id);
      }
      if (e.key.toLowerCase() === "r") setRitualMode((v) => !v);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Ritual mode
  useEffect(() => {
    if (!ritualMode) return;
    const timer = window.setInterval(() => {
      ritualRef.current += 1;
      if (ritualRef.current > 5) {
        setRitualMode(false);
        ritualRef.current = 0;
        setSessionStatus("Ritual complete — knowledge grove expanded");
        return;
      }
      const node = selectedNode || graphData.nodes.find((n) => n.type === "root");
      if (node) void explore(node);
      setSessionStatus(`Ritual pulse ${ritualRef.current}/5...`);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [ritualMode, selectedNode, graphData.nodes]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    resetForest();
    setQuiz([]);
    setQuizResult(null);
    setQuizAnswers([]);
    setQuizNodeId(null);
    setActiveSessionId(null);
    const rootNode = seedRoot(trimmed);
    await explore(rootNode, { isRoot: true, visibleIdsOverride: [rootNode.id] });
  };

  const submitQuiz = () => {
    const unanswered = quizAnswers.findIndex((a) => a < 0);
    if (unanswered >= 0) {
      setSessionStatus(`Answer question ${unanswered + 1} before submitting.`);
      return;
    }
    let correct = 0;
    quiz.forEach((q, i) => {
      if (q.options[quizAnswers[i]] === q.correctAnswer) correct += 1;
    });
    setQuizResult({ correct, total: quiz.length });
    setSessionStatus(`Quiz: ${correct}/${quiz.length} correct`);
  };

  const filteredGraphData = React.useMemo(() => {
    const visibleSet = new Set(
      graphData.nodes
        .filter((n) => {
          if (n.type === "root") return true;
          if (n.synthetic) return filters.synthetic;
          return filters.real;
        })
        .map((n) => n.id)
    );
    return {
      nodes: graphData.nodes.filter((n) => visibleSet.has(n.id)),
      links: graphData.links.filter((l) => {
        const src = typeof l.source === "string" ? l.source : (l.source as any).id;
        const tgt = typeof l.target === "string" ? l.target : (l.target as any).id;
        return visibleSet.has(src) && visibleSet.has(tgt);
      }),
    };
  }, [graphData, filters]);

  return (
    <div
      className="vv-shell"
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--vv-bg-deep)",
        color: "var(--vv-text-primary)",
        overflow: "hidden",
        fontFamily: "var(--font-base)",
      }}
    >
      {/* ─── HEADER ────────────────────────────────────── */}
      <header
        className="vv-header"
        style={{
          padding: isMobile ? "8px 12px" : "0 20px",
          minHeight: isMobile ? 96 : 58,
          display: "flex",
          alignItems: isMobile ? "stretch" : "center",
          flexWrap: isMobile ? "wrap" : "nowrap",
          gap: 12,
          borderBottom: "1px solid var(--vv-border-subtle)",
          background: "rgba(6,13,26,0.9)",
          backdropFilter: "blur(20px)",
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "linear-gradient(135deg, rgba(124,58,237,0.5), rgba(6,182,212,0.4))",
              border: "1px solid rgba(124,58,237,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 16px rgba(124,58,237,0.3)",
            }}
          >
            <Network size={18} color="#c4b5fd" />
          </div>
          <div>
            <div
              className="gradient-primary font-display"
              style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.01em" }}
            >
              VectorVortex
            </div>
            <div style={{ fontSize: 9, color: "var(--vv-text-muted)", letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Semantic Knowledge Explorer
            </div>
          </div>
        </div>

        {!isMobile && (
          <div
            style={{
              width: 1,
              height: 28,
              background: "var(--vv-border-subtle)",
              margin: "0 4px",
              flexShrink: 0,
            }}
          />
        )}

        {/* Search Bar */}
        <form
          onSubmit={onSubmit}
          style={{
            flex: isMobile ? "1 0 100%" : 1,
            maxWidth: isMobile ? "100%" : 580,
            position: "relative",
            order: isMobile ? 3 : 0,
          }}
        >
          <input
            className="search-bar"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your knowledge base semantically..."
            style={{ paddingRight: 46 }}
          />
          <button
            type="submit"
            style={{
              position: "absolute",
              right: 6,
              top: "50%",
              transform: "translateY(-50%)",
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: isLoading
                ? "rgba(124,58,237,0.3)"
                : "linear-gradient(135deg, #7c3aed, #06b6d4)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 10px rgba(124,58,237,0.35)",
              transition: "all 0.2s",
            }}
          >
            {isLoading ? (
              <Loader2 size={14} color="white" className="animate-spin" />
            ) : (
              <Search size={14} color="white" />
            )}
          </button>
        </form>

        {/* Right Controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginLeft: isMobile ? 0 : "auto",
            flexShrink: 0,
            flexWrap: isMobile ? "wrap" : "nowrap",
          }}
        >
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowUpload(true)}
            style={{ gap: 5 }}
          >
            <Upload size={13} />
            {isMobile ? "Ingest" : "Ingest Docs"}
          </button>

          <button className="btn btn-ghost btn-sm" onClick={saveSession} style={{ gap: 5 }}>
            <Database size={12} />
            Save
          </button>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => void saveSessionToCloud()}
            style={{ gap: 5 }}
            disabled={dbStatus !== "connected"}
          >
            <Zap size={12} />
            Cloud Save
          </button>

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => savedSessions[0] && loadSession(savedSessions[0].id)}
            disabled={savedSessions.length === 0}
            style={{ gap: 5, opacity: savedSessions.length === 0 ? 0.45 : 1 }}
          >
            <GitBranch size={12} />
            Load
          </button>

          <button className="btn btn-ghost btn-sm" onClick={clearWorkspace} style={{ gap: 5 }}>
            <Scissors size={12} />
            New
          </button>

          <button
            className="btn btn-sm"
            onClick={() => setRitualMode((v) => !v)}
            style={{
              background: ritualMode ? "rgba(124,58,237,0.2)" : "rgba(255,255,255,0.04)",
              border: ritualMode ? "1px solid rgba(124,58,237,0.4)" : "1px solid var(--vv-border-subtle)",
              color: ritualMode ? "#c4b5fd" : "var(--vv-text-muted)",
              gap: 5,
            }}
          >
            <WandSparkles size={12} />
            Ritual {ritualMode ? "ON" : "OFF"}
          </button>

          {isMobile && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowMobileInspector((v) => !v)}
              style={{ gap: 5 }}
            >
              <ChevronRight
                size={12}
                style={{ transform: showMobileInspector ? "rotate(90deg)" : "rotate(0deg)" }}
              />
              Inspector
            </button>
          )}

          <div
            className={`badge ${dbStatus === "connected" ? "badge-emerald" : dbStatus === "checking" ? "badge-primary" : "badge-danger"}`}
          >
            <div
              className="stat-dot"
              style={{
                width: 6,
                height: 6,
                background: dbStatus === "connected" ? "#10b981" : dbStatus === "checking" ? "#7c3aed" : "#ef4444",
              }}
            />
            {dbStatus === "connected" ? "Atlas Connected" : dbStatus === "checking" ? "Connecting..." : "Offline"}
          </div>

          {!isMobile && savedSessions.length > 0 && (
            <select
              value={activeSessionId || ""}
              onChange={(e) => e.target.value && loadSession(e.target.value)}
              className="vv-input"
              style={{
                maxWidth: 220,
                padding: "6px 10px",
                fontSize: 11,
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <option value="" disabled>
                Load saved session...
              </option>
              {savedSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.query} · {new Date(session.savedAt).toLocaleTimeString()}
                </option>
              ))}
            </select>
          )}

          {!isMobile && cloudSessions.length > 0 && (
            <select
              value={activeCloudSessionId || ""}
              onChange={(e) => e.target.value && void loadCloudSession(e.target.value)}
              className="vv-input"
              style={{
                maxWidth: 220,
                padding: "6px 10px",
                fontSize: 11,
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <option value="" disabled>
                Load cloud session...
              </option>
              {cloudSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.query} · {session.nodeCount} nodes
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {/* Error Strip */}
      {error && (
        <div
          style={{
            padding: "8px 20px",
            fontSize: 12,
            color: "#fca5a5",
            background: "rgba(239,68,68,0.08)",
            borderBottom: "1px solid rgba(239,68,68,0.2)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span>⚠</span> {error}
        </div>
      )}

      {/* ─── MAIN LAYOUT ──────────────────────────────── */}
      <main
        className="vv-main-grid"
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "64px minmax(0, 1fr) minmax(0, 1fr)",
          gridTemplateRows: isMobile ? "auto 1fr" : "1fr",
          gap: isMobile ? 8 : 10,
          padding: isMobile ? "8px" : "10px 10px 10px 10px",
        }}
      >
        {/* ── TOOL SIDEBAR ── */}
        <aside
          className="vv-panel vv-tool-rail"
          style={{
            background: "var(--vv-bg-panel)",
            border: "1px solid var(--vv-border-subtle)",
            borderRadius: "var(--vv-radius)",
            padding: isMobile ? 6 : 8,
            display: "flex",
            flexDirection: isMobile ? "row" : "column",
            gap: 4,
            alignItems: "center",
            overflowX: isMobile ? "auto" : "visible",
            overflowY: "hidden",
          }}
        >
          {TOOL_DEFS.map((tool, i) => {
            const Icon = tool.icon;
            const active = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                className="tool-btn"
                onClick={() => setActiveTool(tool.id)}
                title={`${tool.label} — ${tool.tip}`}
                style={{
                  width: isMobile ? 72 : "100%",
                  minWidth: isMobile ? 72 : "unset",
                  background: active ? `${tool.color}22` : "transparent",
                  border: active ? `1px solid ${tool.color}55` : "1px solid transparent",
                  color: active ? tool.color : "var(--vv-text-muted)",
                  boxShadow: active ? `0 0 12px ${tool.color}25` : "none",
                  position: "relative",
                }}
              >
                <Icon size={16} />
                <span>{tool.label}</span>
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    fontSize: 8,
                    color: active ? tool.color : "var(--vv-text-muted)",
                    fontFamily: "var(--font-mono)",
                    opacity: 0.7,
                  }}
                >
                  {i + 1}
                </span>
              </button>
            );
          })}

          <div
            className="divider"
            style={{
              width: isMobile ? 1 : "100%",
              height: isMobile ? 44 : 1,
              margin: isMobile ? "0 6px" : "8px 0",
            }}
          />

          {/* Filter mini-buttons */}
          <button
            title="Toggle synthetic (AI-generated) nodes"
            onClick={() => setFilters((f) => ({ ...f, synthetic: !f.synthetic }))}
            style={{
              width: isMobile ? 60 : "100%",
              minWidth: isMobile ? 60 : "unset",
              padding: "6px 4px",
              borderRadius: 6,
              fontSize: 8,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              border: filters.synthetic ? "1px solid rgba(124,58,237,0.4)" : "1px solid var(--vv-border-subtle)",
              background: filters.synthetic ? "rgba(124,58,237,0.1)" : "transparent",
              color: filters.synthetic ? "#c4b5fd" : "var(--vv-text-muted)",
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            AI
          </button>
          <button
            title="Toggle real (database) nodes"
            onClick={() => setFilters((f) => ({ ...f, real: !f.real }))}
            style={{
              width: isMobile ? 60 : "100%",
              minWidth: isMobile ? 60 : "unset",
              padding: "6px 4px",
              borderRadius: 6,
              fontSize: 8,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              border: filters.real ? "1px solid rgba(6,182,212,0.4)" : "1px solid var(--vv-border-subtle)",
              background: filters.real ? "rgba(6,182,212,0.08)" : "transparent",
              color: filters.real ? "#67e8f9" : "var(--vv-text-muted)",
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            DB
          </button>
        </aside>

        {/* ── KNOWLEDGE GRAPH VIEWPORT ── */}
        <section className="vv-panel vv-graph-panel" style={{ position: "relative", minHeight: 0 }}>
          <KnowledgeForest
            data={filteredGraphData}
            onNodeClick={(node) => void handleToolAction(node)}
            onNodeDoubleClick={(node) => void explore(node)}
            onNodeRightClick={(node) => {
              pruneSubtree(node.id);
              setSessionStatus(`Pruned ${node.label}`);
            }}
            expandingNodeId={expandingNodeId}
          />

          {/* Empty state overlay */}
          {graphData.nodes.length === 0 && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                zIndex: 5,
              }}
            >
              <div
                style={{
                  textAlign: "center",
                  padding: 32,
                  maxWidth: 420,
                }}
              >
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, rgba(124,58,237,0.2), rgba(6,182,212,0.15))",
                    border: "1px solid rgba(124,58,237,0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 20px",
                    boxShadow: "0 0 40px rgba(124,58,237,0.15)",
                  }}
                >
                  <Brain size={36} color="#c4b5fd" opacity={0.7} />
                </div>
                <div
                  className="font-display"
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    marginBottom: 8,
                    background: "linear-gradient(135deg, #c4b5fd, #67e8f9)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  Your Knowledge Awaits
                </div>
                <div style={{ fontSize: 13, color: "var(--vv-text-muted)", lineHeight: 1.6, marginBottom: 20 }}>
                  Type any topic in the search bar to begin semantic exploration.
                  Ingest documents first to search your own knowledge base.
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                  {["MongoDB Atlas", "Vector Search", "RAG Architecture", "Neural Embeddings"].map((s) => (
                    <button
                      key={s}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 99,
                        fontSize: 11,
                        fontWeight: 600,
                        background: "rgba(124,58,237,0.1)",
                        border: "1px solid rgba(124,58,237,0.25)",
                        color: "#c4b5fd",
                        cursor: "pointer",
                        pointerEvents: "all",
                      }}
                      onClick={() => {
                        setQuery(s);
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Status Bar */}
          <div
            style={{
              position: "absolute",
              left: 12,
              bottom: 12,
              fontSize: 11,
              padding: "5px 12px",
              borderRadius: 99,
              background: "rgba(6,13,26,0.85)",
              border: "1px solid var(--vv-border-subtle)",
              backdropFilter: "blur(8px)",
              color: "var(--vv-text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              maxWidth: isMobile ? "70vw" : "unset",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {isLoading && <Loader2 size={11} className="animate-spin" color="#7c3aed" />}
            {sessionStatus}
          </div>

          {/* Legend */}
          <div
            style={{
              position: "absolute",
              right: 12,
              top: 12,
              background: "rgba(6,13,26,0.85)",
              border: "1px solid var(--vv-border-subtle)",
              backdropFilter: "blur(8px)",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 11,
              display: "flex",
              flexDirection: "column",
              gap: 5,
              maxWidth: isMobile ? 156 : "unset",
            }}
          >
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--vv-text-muted)", marginBottom: 2, fontWeight: 700 }}>
              Node Types
            </div>
            {[
              { dot: "stat-dot-gold", label: "Root Query" },
              { dot: "stat-dot-accent", label: "Atlas Document" },
              { dot: "stat-dot-primary", label: "AI Gap Bridge" },
              { dot: "stat-dot-pink", label: "Learned" },
            ].map(({ dot, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className={`stat-dot ${dot}`} />
                <span style={{ color: "var(--vv-text-secondary)" }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Controls hint */}
          <div
            style={{
              position: "absolute",
              right: 12,
              bottom: 12,
              fontSize: 9,
              color: "var(--vv-text-muted)",
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              display: isMobile ? "none" : "block",
            }}
          >
            Click: tool · Dbl: expand · Right: prune · R: ritual
          </div>
        </section>

        {/* ── INSPECTOR PANEL ── */}
        {!isMobile && (
        <aside
          className="vv-panel vv-inspector"
          style={{
            background: "var(--vv-bg-panel)",
            border: "1px solid var(--vv-border-subtle)",
            borderRadius: "var(--vv-radius)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Quest Board */}
          <div
            className="vv-quest-board"
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid var(--vv-border-subtle)",
              background: "rgba(245,158,11,0.04)",
            }}
          >
            <div
              style={{
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
                color: "#fcd34d",
                fontWeight: 700,
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Trophy size={11} color="#fcd34d" />
              Knowledge Quests
            </div>
            {[
              { label: "Discover 12 nodes", current: Math.max(graphData.nodes.length - 1, 0), max: 12 },
              { label: "Generate 6 flashcards", current: metrics.leaves, max: 6 },
              { label: "Blossom 4 nodes", current: metrics.flowers, max: 4 },
              { label: "Complete 2 quizzes", current: metrics.fruits, max: 2 },
            ].map(({ label, current, max }) => {
              const progress = Math.min(current / max, 1);
              const done = progress >= 1;
              return (
                <div key={label} style={{ marginBottom: 7 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 11,
                      marginBottom: 3,
                      color: done ? "#6ee7b7" : "var(--vv-text-secondary)",
                    }}
                  >
                    <span>{label}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>
                      {Math.min(current, max)}/{max}
                    </span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${progress * 100}%`,
                        background: done
                          ? "linear-gradient(90deg, #10b981, #6ee7b7)"
                          : "linear-gradient(90deg, #7c3aed, #06b6d4)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Graph Stats */}
          <div
            className="vv-stats-row"
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--vv-border-subtle)",
              display: "flex",
              gap: 8,
            }}
          >
            {[
              { label: "Nodes", value: graphData.nodes.length, color: "#c4b5fd" },
              { label: "Links", value: graphData.links.length, color: "#67e8f9" },
              { label: "Learned", value: metrics.completed, color: "#6ee7b7" },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "6px 4px",
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 8,
                  border: "1px solid var(--vv-border-subtle)",
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: "var(--font-mono)" }}>
                  {value}
                </div>
                <div style={{ fontSize: 9, textTransform: "uppercase", color: "var(--vv-text-muted)", letterSpacing: "0.08em" }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Node Inspector / Flashcards / Quiz */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 14px" }}>
            {!selectedNode ? (
              <div
                style={{
                  textAlign: "center",
                  paddingTop: 24,
                  color: "var(--vv-text-muted)",
                }}
              >
                <Target size={28} style={{ margin: "0 auto 8px", opacity: 0.3 }} />
                <div style={{ fontSize: 12 }}>
                  Select a tool and click a node to inspect it
                </div>
              </div>
            ) : (
              <div className="animate-slide-in">
                {/* Node Header */}
                <div style={{ marginBottom: 10 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      marginBottom: 6,
                    }}
                  >
                    {selectedNode.score !== undefined && (
                      <ScoreRing score={selectedNode.score} />
                    )}
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "var(--vv-text-primary)",
                          lineHeight: 1.3,
                          fontFamily: "var(--font-display)",
                        }}
                      >
                        {selectedNode.label}
                      </div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                        <span
                          className={`badge ${selectedNode.synthetic ? "badge-primary" : "badge-accent"}`}
                        >
                          {selectedNode.synthetic ? "AI Generated" : "Atlas Doc"}
                        </span>
                        {selectedNode.nodeKind && (
                          <span className="badge badge-gold">{selectedNode.nodeKind}</span>
                        )}
                        {selectedNode.completed && (
                          <span className="badge badge-emerald">Learned ✓</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--vv-text-secondary)",
                      lineHeight: 1.6,
                    }}
                  >
                    {selectedNode.summary || selectedNode.text || "No summary available"}
                  </div>

                  {selectedNode.source && (
                    <div style={{ marginTop: 6, fontSize: 10, color: "var(--vv-text-muted)" }}>
                      Source: {selectedNode.source}
                      {selectedNode.sourceUrl && (
                        <a
                          href={selectedNode.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ marginLeft: 6, color: "#67e8f9" }}
                        >
                          <ExternalLink size={10} style={{ display: "inline" }} />
                        </a>
                      )}
                    </div>
                  )}

                  {loadingNodeIds.has(selectedNode.id) && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        marginTop: 6,
                        fontSize: 11,
                        color: "#fcd34d",
                      }}
                    >
                      <Loader2 size={11} className="animate-spin" color="#f59e0b" />
                      Processing...
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => void explore(selectedNode)}
                  >
                    <Plus size={11} /> Expand
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => void generateFlashcards(selectedNode)}
                  >
                    <Leaf size={11} /> Cards
                  </button>
                  {!selectedNode.completed && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => blossomNode(selectedNode)}
                    >
                      <Flower2 size={11} /> Learn
                    </button>
                  )}
                  {selectedNode.completed && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => void generateFruitQuiz(selectedNode)}
                    >
                      <Apple size={11} /> Quiz
                    </button>
                  )}
                </div>

                <div className="divider" />

                {/* Flashcards */}
                {selectedNode.flashcards && selectedNode.flashcards.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        fontSize: 9,
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        color: "#c4b5fd",
                        fontWeight: 700,
                        marginBottom: 8,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Leaf size={10} color="#c4b5fd" />
                      Flashcards · tap to flip
                    </div>
                    {selectedNode.flashcards.map((card, i) => (
                      <FlashCard key={i} card={card} index={i} />
                    ))}
                  </div>
                )}

                {/* Quiz */}
                {quiz.length > 0 && quizNodeId === selectedNode.id && (
                  <div>
                    <div
                      style={{
                        fontSize: 9,
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        color: "#f9a8d4",
                        fontWeight: 700,
                        marginBottom: 8,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Apple size={10} color="#ec4899" />
                      Knowledge Quiz
                    </div>
                    {quiz.map((q, i) => (
                      <div
                        key={i}
                        className="vv-card"
                        style={{ marginBottom: 8, padding: "10px 12px" }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 7, color: "var(--vv-text-primary)" }}>
                          {i + 1}. {q.question}
                        </div>
                        {q.options.map((opt, j) => {
                          const selected = quizAnswers[i] === j;
                          const revealed = quizResult !== null;
                          const correct = opt === q.correctAnswer;
                          let bg = "rgba(255,255,255,0.04)";
                          let border = "var(--vv-border-subtle)";
                          let color = "var(--vv-text-secondary)";
                          if (selected && !revealed) { bg = "rgba(124,58,237,0.15)"; border = "rgba(124,58,237,0.5)"; color = "#c4b5fd"; }
                          if (revealed && correct) { bg = "rgba(16,185,129,0.12)"; border = "rgba(16,185,129,0.4)"; color = "#6ee7b7"; }
                          if (revealed && selected && !correct) { bg = "rgba(239,68,68,0.12)"; border = "rgba(239,68,68,0.4)"; color = "#fca5a5"; }

                          return (
                            <button
                              key={j}
                              onClick={() =>
                                setQuizAnswers((prev) => {
                                  const n = [...prev];
                                  n[i] = j;
                                  return n;
                                })
                              }
                              disabled={!!quizResult}
                              style={{
                                display: "block",
                                width: "100%",
                                textAlign: "left",
                                padding: "6px 10px",
                                marginBottom: 4,
                                borderRadius: 7,
                                fontSize: 11,
                                border: `1px solid ${border}`,
                                background: bg,
                                color,
                                cursor: quizResult ? "default" : "pointer",
                                transition: "all 0.15s",
                                fontFamily: "var(--font-base)",
                              }}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    ))}

                    {!quizResult ? (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={submitQuiz}
                        style={{ width: "100%", justifyContent: "center" }}
                      >
                        <Sparkles size={12} />
                        Submit Quiz
                      </button>
                    ) : (
                      <div
                        style={{
                          textAlign: "center",
                          padding: 12,
                          borderRadius: 10,
                          background:
                            quizResult.correct / quizResult.total >= 0.7
                              ? "rgba(16,185,129,0.1)"
                              : "rgba(239,68,68,0.08)",
                          border: `1px solid ${quizResult.correct / quizResult.total >= 0.7 ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.25)"}`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 22,
                            fontWeight: 800,
                            fontFamily: "var(--font-display)",
                            color: quizResult.correct / quizResult.total >= 0.7 ? "#6ee7b7" : "#fca5a5",
                            marginBottom: 2,
                          }}
                        >
                          {quizResult.correct}/{quizResult.total}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--vv-text-muted)" }}>
                          {Math.round((quizResult.correct / quizResult.total) * 100)}% accuracy
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Negative Keyword Buffer */}
            {negativePromptKeywords.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="section-label">Pruned Keywords</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {negativePromptKeywords.slice(0, 15).map((kw) => (
                    <span
                      key={kw}
                      style={{
                        padding: "2px 7px",
                        borderRadius: 99,
                        fontSize: 10,
                        background: "rgba(239,68,68,0.08)",
                        border: "1px solid rgba(239,68,68,0.2)",
                        color: "#fca5a5",
                      }}
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer: Active Tool Indicator */}
          <div
            style={{
              padding: "8px 14px",
              borderTop: "1px solid var(--vv-border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: 10,
              color: "var(--vv-text-muted)",
            }}
          >
            <span>
              Active:{" "}
              <span
                style={{
                  color: TOOL_DEFS.find((t) => t.id === activeTool)?.color || "white",
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                {activeTool}
              </span>
            </span>
            <span>R = Ritual {ritualMode ? "●" : "○"}</span>
          </div>
        </aside>
        )}
      </main>

      {isMobile && showMobileInspector && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2,4,10,0.75)",
            zIndex: 60,
            display: "flex",
            alignItems: "flex-end",
          }}
          onClick={() => setShowMobileInspector(false)}
        >
          <div
            style={{
              width: "100%",
              maxHeight: "75vh",
              background: "var(--vv-bg-panel)",
              borderTop: "1px solid var(--vv-border)",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--vv-border-subtle)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 12,
              }}
            >
              <span style={{ color: "var(--vv-text-secondary)" }}>
                Active Tool: <strong style={{ color: "var(--vv-text-primary)" }}>{activeTool}</strong>
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowMobileInspector(false)}>
                Close
              </button>
            </div>

            <div style={{ padding: 12, overflowY: "auto" }}>
              <div style={{ marginBottom: 12 }}>
                <div className="section-label">Saved Sessions</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={saveSession}>
                    Save Local
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => void saveSessionToCloud()}
                    disabled={dbStatus !== "connected"}
                    style={{ opacity: dbStatus === "connected" ? 1 : 0.5 }}
                  >
                    Save Cloud
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {savedSessions.slice(0, 6).map((session) => (
                    <button
                      key={session.id}
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        loadSession(session.id);
                        setShowMobileInspector(false);
                      }}
                      style={{
                        justifyContent: "space-between",
                        opacity: activeSessionId === session.id ? 1 : 0.85,
                      }}
                    >
                      <span style={{ maxWidth: "70%", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {session.query}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--vv-text-muted)" }}>
                        {new Date(session.savedAt).toLocaleTimeString()}
                      </span>
                    </button>
                  ))}
                  {savedSessions.length === 0 && (
                    <div style={{ fontSize: 11, color: "var(--vv-text-muted)" }}>
                      No saved sessions yet.
                    </div>
                  )}
                </div>
                {cloudSessions.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="section-label">Cloud Sessions</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {cloudSessions.slice(0, 6).map((session) => (
                        <button
                          key={`cloud-${session.id}`}
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            void loadCloudSession(session.id);
                            setShowMobileInspector(false);
                          }}
                          style={{
                            justifyContent: "space-between",
                            opacity: activeCloudSessionId === session.id ? 1 : 0.85,
                          }}
                        >
                          <span style={{ maxWidth: "70%", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {session.query}
                          </span>
                          <span style={{ fontSize: 10, color: "var(--vv-text-muted)" }}>
                            {session.nodeCount}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {selectedNode ? (
                <div>
                  <div className="section-label">Selected Node</div>
                  <div className="vv-card" style={{ padding: 12, marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                      {selectedNode.label}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--vv-text-secondary)", lineHeight: 1.55 }}>
                      {selectedNode.summary || selectedNode.text || "No summary available"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => void explore(selectedNode)}>
                      <Plus size={11} /> Expand
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => void generateFlashcards(selectedNode)}>
                      <Leaf size={11} /> Cards
                    </button>
                    {!selectedNode.completed && (
                      <button className="btn btn-ghost btn-sm" onClick={() => blossomNode(selectedNode)}>
                        <Flower2 size={11} /> Learn
                      </button>
                    )}
                    {selectedNode.completed && (
                      <button className="btn btn-ghost btn-sm" onClick={() => void generateFruitQuiz(selectedNode)}>
                        <Apple size={11} /> Quiz
                      </button>
                    )}
                  </div>

                  {selectedNode.flashcards && selectedNode.flashcards.length > 0 && (
                    <div>
                      <div className="section-label">Flashcards</div>
                      {selectedNode.flashcards.map((card, i) => (
                        <FlashCard key={`mobile-${i}`} card={card} index={i} />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--vv-text-muted)" }}>
                  Tap a node to inspect details and run quick actions.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Document Upload Modal */}
      {showUpload && <DocumentUpload onClose={() => setShowUpload(false)} />}
    </div>
  );
}
