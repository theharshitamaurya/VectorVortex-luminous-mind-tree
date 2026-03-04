export type NodeType = "root" | "branch" | "leaf" | "flower" | "fruit" | "query";
export type BranchType = "depth" | "breadth" | "creative" | "root";
export type NodeKind = "seed" | "data" | "gap";

export interface Flashcard {
  question: string;
  answer: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  nodeKind?: NodeKind;
  branchType?: BranchType;
  color?: string;
  text?: string;
  summary?: string;
  source?: string;
  sourceUrl?: string;
  score?: number;
  expanded?: boolean;
  synthetic?: boolean;
  persisted?: boolean;
  reasoning?: string;
  pruned?: boolean;
  flashcards?: Flashcard[];
  quiz?: QuizQuestion[];
  completed?: boolean;
  timestamp?: number;
  fx?: number;
  fy?: number;
  fz?: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}
