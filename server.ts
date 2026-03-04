import express from "express";
import { createServer as createViteServer } from "vite";
import mongoose from "mongoose";
import { pipeline } from "@xenova/transformers";
import dotenv from "dotenv";
import path from "path";
import { createVectorRouter } from "./server/vectorController";

dotenv.config();

const app = express();
const PREFERRED_PORT = Number(process.env.PORT) || 3000;
let activePort = PREFERRED_PORT;

app.use(express.json());
app.use("/static", express.static(path.join(process.cwd(), "frontend")));

const ChunkSchema = new mongoose.Schema({
  text: String,
  label: String,
  type: {
    type: String,
    enum: ["root", "branch", "leaf", "flower", "fruit"],
    default: "branch",
  },
  metadata: {
    source: String,
    isSynthetic: { type: Boolean, default: false },
    nodeKind: { type: String, enum: ["seed", "data", "gap"], default: "data" },
    summary: String,
    parentNodeId: String,
    completed: { type: Boolean, default: false },
  },
  embedding: [Number],
  createdAt: { type: Date, default: Date.now },
});

const Chunk = mongoose.model("Chunk", ChunkSchema);
const SessionSchema = new mongoose.Schema({
  query: { type: String, default: "Untitled Session" },
  snapshot: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
const Session = mongoose.model("Session", SessionSchema);

let embedder: any = null;

async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return embedder;
}

async function generateEmbedding(text: string) {
  const extractor = await getEmbedder();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

app.get("/api/status", (req, res) => {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  res.json({
    status: states[mongoose.connection.readyState],
    hasUri: !!process.env.MONGODB_URI,
  });
});

app.use("/api", createVectorRouter({ Chunk, generateEmbedding }));

function mapNodesToResults(nodes: any[]) {
  return (nodes || []).map((node: any) => ({
    title: node.label || "Untitled Topic",
    snippet: node.summary || node.text || "",
    llm_content: node.text || node.summary || "",
    url: node.sourceUrl || "",
    source: node.source || "",
    synthetic: !!node.synthetic,
  }));
}

function normalizeText(value: any, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function localApi(pathname: string) {
  return `http://127.0.0.1:${activePort}${pathname}`;
}

// Compatibility route for older UI callers.
app.post("/api/search", async (req, res) => {
  try {
    const {
      query,
      excludedIds = [],
      parentNodeId = null,
      prunedTopics = [],
    } = req.body || {};

    if (typeof query !== "string" || !query.trim()) {
      return res.status(400).json({ error: "query is required", nodes: [] });
    }

    const vector = await generateEmbedding(query);
    const response = await fetch(localApi("/api/explore"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queryVector: vector,
        alreadyVisibleIds: excludedIds,
        parentNodeId,
        parentText: query,
        negativePromptKeywords: prunedTopics,
      }),
    });

    const data = await response.json();
    const nodes = data.nodes || [];
    return res.json({
      nodes,
      results: mapNodesToResults(nodes),
      mode: "mongodb",
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Search failed", nodes: [] });
  }
});

// Legacy game route compatibility.
app.post("/api/web-search", async (req, res) => {
  try {
    const {
      query,
      count = 5,
      negative_prompts = [],
    } = req.body || {};

    if (typeof query !== "string" || !query.trim()) {
      return res.status(400).json({ error: "query is required", results: [] });
    }

    const vector = await generateEmbedding(query);
    const response = await fetch(localApi("/api/explore"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queryVector: vector,
        parentText: query,
        alreadyVisibleIds: [],
        negativePromptKeywords: Array.isArray(negative_prompts) ? negative_prompts : [],
      }),
    });

    const data = await response.json();
    const nodes = (data.nodes || []).slice(0, Math.max(1, Number(count) || 5));
    return res.json({ results: mapNodesToResults(nodes) });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "web-search failed", results: [] });
  }
});

// Legacy game route compatibility.
app.post("/api/create-flashcards", async (req, res) => {
  try {
    const { search_result, count = 5, node_position = null } = req.body || {};
    const title = normalizeText(search_result?.title, "Topic");
    const text = normalizeText(search_result?.llm_content, normalizeText(search_result?.snippet, ""));

    if (!text.trim()) {
      return res.status(400).json({ success: false, error: "search_result content is required" });
    }

    const response = await fetch(localApi("/api/flashcards"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: title,
        text,
      }),
    });

    const data = await response.json();
    const flashcards = (data.flashcards || [])
      .slice(0, Math.max(1, Number(count) || 5))
      .map((card: any) => ({
        front: normalizeText(card.question, "Question"),
        back: normalizeText(card.answer, "Answer"),
        difficulty: "medium",
        topic: title,
        node_position,
      }));

    return res.json({ success: true, flashcards });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || "create-flashcards failed" });
  }
});

// Legacy game route compatibility.
app.post("/api/generate-quiz", async (req, res) => {
  try {
    const { flashcards = [] } = req.body || {};
    const safeCards = Array.isArray(flashcards) ? flashcards : [];
    const branchPath = safeCards.map((card: any) => normalizeText(card.front)).filter(Boolean);

    const response = await fetch(localApi("/api/fruit"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchPath }),
    });
    const data = await response.json();

    let questions = (data.quiz || []).map((q: any) => ({
      question: normalizeText(q.question, "Question"),
      options: Array.isArray(q.options) ? q.options : [],
      correctAnswer: normalizeText(q.correctAnswer, ""),
    }));

    // Ensure at least one playable question for the game UI.
    if (!questions.length && safeCards.length) {
      questions = safeCards.slice(0, 3).map((card: any) => {
        const correctAnswer = normalizeText(card.back, "Answer");
        const distractors = safeCards
          .map((other: any) => normalizeText(other.back, ""))
          .filter((v: string) => v && v !== correctAnswer)
          .slice(0, 3);
        while (distractors.length < 3) distractors.push(`Option ${distractors.length + 2}`);
        const options = [correctAnswer, ...distractors].sort(() => Math.random() - 0.5);
        return {
          question: normalizeText(card.front, "Question"),
          options,
          correctAnswer,
        };
      });
    }

    return res.json({ questions });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "generate-quiz failed", questions: [] });
  }
});

app.post("/api/ingest", async (req, res) => {
  try {
    const { text, source } = req.body || {};

    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "text is required" });
    }

    const embedding = await generateEmbedding(text);
    const chunk = new Chunk({
      text,
      metadata: {
        source: source || "manual",
        nodeKind: "data",
        isSynthetic: false,
        summary: text.slice(0, 200),
      },
      embedding,
    });

    await chunk.save();
    res.json({ success: true, id: chunk._id });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to ingest" });
  }
});

app.post("/api/sessions/save", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "MongoDB is not connected." });
    }

    const {
      query = "Untitled Session",
      graphData,
      selectedNodeId = null,
      negativePromptKeywords = [],
      quiz = [],
      quizAnswers = [],
      quizResult = null,
      filters = { synthetic: true, real: true },
    } = req.body || {};

    if (!graphData || !Array.isArray(graphData.nodes) || !Array.isArray(graphData.links)) {
      return res.status(400).json({ error: "graphData with nodes and links is required." });
    }

    const doc = await Session.create({
      query: normalizeText(query, "Untitled Session"),
      snapshot: {
        graphData,
        selectedNodeId,
        negativePromptKeywords: Array.isArray(negativePromptKeywords) ? negativePromptKeywords : [],
        quiz: Array.isArray(quiz) ? quiz : [],
        quizAnswers: Array.isArray(quizAnswers) ? quizAnswers : [],
        quizResult: quizResult || null,
        filters: filters || { synthetic: true, real: true },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return res.json({
      id: String(doc._id),
      savedAt: doc.createdAt,
      query: doc.query,
      nodeCount: graphData.nodes.length,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Failed to save session." });
  }
});

app.get("/api/sessions", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "MongoDB is not connected.", sessions: [] });
    }

    const sessions = await Session.find({}, { query: 1, createdAt: 1, updatedAt: 1, snapshot: 1 })
      .sort({ updatedAt: -1 })
      .limit(20)
      .lean();

    return res.json({
      sessions: sessions.map((s: any) => ({
        id: String(s._id),
        query: normalizeText(s.query, "Untitled Session"),
        savedAt: s.updatedAt || s.createdAt,
        nodeCount: Array.isArray(s.snapshot?.graphData?.nodes) ? s.snapshot.graphData.nodes.length : 0,
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Failed to load sessions.", sessions: [] });
  }
});

app.get("/api/sessions/:id", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "MongoDB is not connected." });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid session id." });
    }

    const session = await Session.findById(id).lean();
    if (!session) {
      return res.status(404).json({ error: "Session not found." });
    }

    return res.json({
      id: String((session as any)._id),
      query: normalizeText((session as any).query, "Untitled Session"),
      savedAt: (session as any).updatedAt || (session as any).createdAt,
      snapshot: (session as any).snapshot || {},
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Failed to load session." });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        strictPort: false,
        port: Number(process.env.VITE_DEV_PORT) || 5173,
        hmr: {
          port: Number(process.env.VITE_HMR_PORT) || 24678,
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.get("/game", (req, res) => {
    res.sendFile(path.join(process.cwd(), "frontend", "index.html"));
  });

  if (process.env.MONGODB_URI) {
    mongoose
      .connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 7000,
        connectTimeoutMS: 10000,
      })
      .then(() => console.log("Connected to MongoDB Atlas"))
      .catch((err) => console.error("MongoDB connect error:", err.message));

    mongoose.connection.on("disconnected", () => {
      console.warn("MongoDB disconnected.");
    });
  }

  const maxAttempts = 20;
  for (let offset = 0; offset <= maxAttempts; offset += 1) {
    const port = PREFERRED_PORT + offset;
    try {
      await new Promise<void>((resolve, reject) => {
        const server = app.listen(port, "0.0.0.0", () => {
          activePort = port;
          console.log(`VectorVortex server running on http://localhost:${port}`);
          resolve();
        });
        server.once("error", (err: any) => {
          server.close();
          reject(err);
        });
      });
      return;
    } catch (err: any) {
      if (err?.code !== "EADDRINUSE" || offset === maxAttempts) {
        throw err;
      }
    }
  }
}

startServer();
