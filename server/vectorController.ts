import express from "express";
import mongoose from "mongoose";
import { llmService } from "./llmService";

interface VectorControllerDeps {
  Chunk: mongoose.Model<any>;
  generateEmbedding: (text: string) => Promise<number[]>;
}

function toObjectIds(ids: string[]) {
  return ids
    .map((id) => {
      try {
        return new mongoose.Types.ObjectId(id);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function createVectorRouter({ Chunk, generateEmbedding }: VectorControllerDeps) {
  const router = express.Router();

  router.post("/explore", async (req, res) => {
    const {
      query,
      queryVector,
      alreadyVisibleIds = [],
      parentNodeId,
      parentText,
      negativePromptKeywords = [],
    } = req.body || {};

    const visibleIds = Array.isArray(alreadyVisibleIds) ? alreadyVisibleIds.map(String) : [];
    const negativeKeywords = Array.isArray(negativePromptKeywords)
      ? negativePromptKeywords.map(String)
      : [];

    try {
      const semanticInput =
        typeof query === "string" && query.trim()
          ? query.trim()
          : typeof parentText === "string" && parentText.trim()
            ? parentText.trim()
            : "";

      const vector = Array.isArray(queryVector)
        ? queryVector
        : semanticInput
          ? await generateEmbedding(semanticInput)
          : null;

      if (!vector) {
        return res
          .status(400)
          .json({ error: "Provide query/queryVector or a valid parentText for expansion." });
      }

      const nodes: any[] = [];
      if (mongoose.connection.readyState === 1) {
        const excludedObjectIds = toObjectIds(visibleIds);

        const pipeline: any[] = [
          {
            $vectorSearch: {
              index: "vector_index",
              path: "embedding",
              queryVector: vector,
              numCandidates: 200,
              limit: 20,
            },
          },
          {
            $match: {
              _id: { $nin: excludedObjectIds },
            },
          },
          {
            $project: {
              text: 1,
              label: 1,
              metadata: 1,
              score: { $meta: "vectorSearchScore" },
            },
          },
          { $limit: 8 },
        ];

        const docs = await Chunk.aggregate(pipeline);

        nodes.push(
          ...docs.map((doc: any) => ({
            id: String(doc._id),
            label: doc.metadata?.label || doc.label || (doc.text || "").slice(0, 60),
            text: doc.text,
            summary: doc.metadata?.summary || (doc.text || "").slice(0, 180),
            source: doc.metadata?.source || "database",
            sourceUrl: doc.metadata?.sourceUrl || "",
            synthetic: !!doc.metadata?.isSynthetic,
            nodeKind: doc.metadata?.nodeKind || "data",
            type: doc.metadata?.completed ? "flower" : "branch",
            completed: !!doc.metadata?.completed,
            score: doc.score,
          })),
        );
      }

      const targetCount = typeof query === "string" && query.trim() ? 5 : 3;
      const exclusionBag = [...visibleIds, ...negativeKeywords, ...nodes.map((n) => n.label)];

      if (nodes.length < targetCount && typeof parentText === "string" && parentText.trim()) {
        const attempts = Math.min(8, targetCount + 3);

        for (let i = 0; i < attempts && nodes.length < targetCount; i += 1) {
          const growth = await llmService.runGrowthChain({
            parentText,
            excludedIDs: exclusionBag,
          });
          if (!growth) continue;

          const dup = nodes.some((n) => n.label.toLowerCase() === growth.label.toLowerCase());
          if (dup) {
            exclusionBag.push(growth.label);
            continue;
          }

          let persistedId: string | null = null;

          if (mongoose.connection.readyState === 1) {
            const bridgeEmbedding = await generateEmbedding(`${growth.label}\n${growth.summary}`);
            const bridge = await Chunk.create({
              text: growth.summary,
              label: growth.label,
              type: "branch",
              metadata: {
                source: "growth_chain",
                sourceUrl: "",
                isSynthetic: true,
                nodeKind: "gap",
                summary: growth.summary,
                parentNodeId: parentNodeId || null,
              },
              embedding: bridgeEmbedding,
            });
            persistedId = String(bridge._id);
          }

          nodes.push({
            id: persistedId || `gap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${i}`,
            label: growth.label,
            text: growth.summary,
            summary: growth.summary,
            source: "growth_chain",
            sourceUrl: "",
            synthetic: true,
            nodeKind: "gap",
            type: "branch",
            completed: false,
          });
          exclusionBag.push(growth.label);
        }
      }

      return res.json({ nodes });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || "Explore failed." });
    }
  });

  router.post("/flashcards", async (req, res) => {
    try {
      const { label, text, summary } = req.body || {};
      const topic = typeof label === "string" ? label : "topic";
      const content = String(text || summary || "").trim();

      if (!content) {
        return res.status(400).json({ error: "text or summary is required" });
      }

      const flashcards = await llmService.runFlashcardChain({ label: topic, content });
      return res.json({ flashcards });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || "Flashcard generation failed." });
    }
  });

  router.post("/fruit", async (req, res) => {
    try {
      const { branchPath = [] } = req.body || {};
      const safePath = Array.isArray(branchPath)
        ? branchPath.map(String).filter((segment) => segment.trim().length > 0)
        : [];

      const quiz = await llmService.runFruitChain({ branchPath: safePath });
      return res.json({ quiz });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || "Fruit chain failed." });
    }
  });

  return router;
}
