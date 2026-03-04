import { useMemo, useState } from "react";
import { GraphData, GraphLink, GraphNode } from "../types";

function asNodeId(value: string | { id: string }): string {
  return typeof value === "string" ? value : value.id;
}

function extractKeywords(text: string): string[] {
  const stop = new Set(["about", "there", "their", "which", "would", "could", "should", "these", "those"]);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 5 && !stop.has(w));
  return Array.from(new Set(words)).slice(0, 20);
}

function edgeKey(link: GraphLink): string {
  const source = asNodeId(link.source as any);
  const target = asNodeId(link.target as any);
  return `${source}->${target}`;
}

export function useForestState() {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [alreadyVisibleIds, setAlreadyVisibleIds] = useState<Set<string>>(new Set());
  const [negativePromptKeywords, setNegativePromptKeywords] = useState<string[]>([]);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [expandingNodeId, setExpandingNodeId] = useState<string | null>(null);

  const rootId = useMemo(() => graphData.nodes.find((n) => n.type === "root")?.id ?? null, [graphData.nodes]);

  const resetForest = () => {
    setGraphData({ nodes: [], links: [] });
    setAlreadyVisibleIds(new Set());
    setNegativePromptKeywords([]);
    setSelectedNode(null);
    setExpandingNodeId(null);
  };

  const hydrateForest = (snapshot: {
    graphData: GraphData;
    selectedNodeId?: string | null;
    negativePromptKeywords?: string[];
  }) => {
    const safeGraph: GraphData = {
      nodes: Array.isArray(snapshot.graphData?.nodes)
        ? snapshot.graphData.nodes.map((n) => ({ ...n }))
        : [],
      links: Array.isArray(snapshot.graphData?.links)
        ? snapshot.graphData.links.map((l) => ({
            source: asNodeId(l.source as any),
            target: asNodeId(l.target as any),
          }))
        : [],
    };

    setGraphData(safeGraph);
    setAlreadyVisibleIds(new Set(safeGraph.nodes.map((n) => n.id)));
    setNegativePromptKeywords(
      Array.isArray(snapshot.negativePromptKeywords) ? snapshot.negativePromptKeywords : [],
    );

    const selected = snapshot.selectedNodeId
      ? safeGraph.nodes.find((n) => n.id === snapshot.selectedNodeId) || null
      : null;
    setSelectedNode(selected);
    setExpandingNodeId(null);
  };

  const seedRoot = (query: string): GraphNode => {
    const id = `root-${Date.now()}`;
    const root: GraphNode = {
      id,
      label: query,
      text: query,
      summary: query,
      type: "root",
      nodeKind: "seed",
      timestamp: Date.now(),
    };

    setGraphData({ nodes: [root], links: [] });
    setAlreadyVisibleIds(new Set([id]));
    setSelectedNode(root);
    return root;
  };

  const appendChildren = (
    parentId: string,
    incomingNodes: GraphNode[],
    extraLinks: GraphLink[] = [],
  ) => {
    setGraphData((prev) => {
      const idSet = new Set(prev.nodes.map((n) => n.id));
      const linkSet = new Set(prev.links.map(edgeKey));

      const nextNodes = [...prev.nodes];
      const nextLinks = [...prev.links];

      for (const node of incomingNodes) {
        if (!idSet.has(node.id)) {
          nextNodes.push({ ...node, timestamp: Date.now() });
          idSet.add(node.id);
        }

        const key = `${parentId}->${node.id}`;
        if (!linkSet.has(key)) {
          nextLinks.push({ source: parentId, target: node.id });
          linkSet.add(key);
        }
      }

      for (const link of extraLinks) {
        const key = edgeKey(link);
        if (!linkSet.has(key)) {
          nextLinks.push(link);
          linkSet.add(key);
        }
      }

      return { nodes: nextNodes, links: nextLinks };
    });

    setAlreadyVisibleIds((prev) => {
      const next = new Set(prev);
      for (const node of incomingNodes) next.add(node.id);
      return next;
    });
  };

  const updateNode = (nodeId: string, patch: Partial<GraphNode>) => {
    setGraphData((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
    }));

    setSelectedNode((prev) => (prev && prev.id === nodeId ? { ...prev, ...patch } : prev));
  };

  const pruneSubtree = (nodeId: string) => {
    if (rootId && nodeId === rootId) {
      resetForest();
      return;
    }

    setGraphData((prev) => {
      const children = new Map<string, string[]>();
      for (const link of prev.links) {
        const source = asNodeId(link.source as any);
        const target = asNodeId(link.target as any);
        if (!children.has(source)) children.set(source, []);
        children.get(source)!.push(target);
      }

      const stack = [nodeId];
      const remove = new Set<string>();
      while (stack.length) {
        const current = stack.pop()!;
        if (remove.has(current)) continue;
        remove.add(current);
        for (const child of children.get(current) || []) stack.push(child);
      }

      const removedNodes = prev.nodes.filter((n) => remove.has(n.id));
      const textBlob = removedNodes.map((n) => `${n.label} ${n.text || ""}`).join(" ");
      const newKeywords = extractKeywords(textBlob);

      setNegativePromptKeywords((existing) => Array.from(new Set([...existing, ...newKeywords])));
      setAlreadyVisibleIds((existing) => {
        const next = new Set(existing);
        for (const id of remove) next.delete(id);
        return next;
      });

      return {
        nodes: prev.nodes.filter((n) => !remove.has(n.id)),
        links: prev.links.filter(
          (l) => !remove.has(asNodeId(l.source as any)) && !remove.has(asNodeId(l.target as any)),
        ),
      };
    });

    setSelectedNode((prev) => (prev && prev.id === nodeId ? null : prev));
  };

  return {
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
  };
}
