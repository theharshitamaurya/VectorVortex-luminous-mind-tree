export type AIProvider = "gemini" | "openai" | "groq";

export interface GrowthInput {
  parentText: string;
  excludedIDs: string[];
}

export interface GrowthOutput {
  label: string;
  summary: string;
}

export interface FruitInput {
  branchPath: string[];
}

export interface FlashcardInput {
  label: string;
  content: string;
}

export interface Flashcard {
  question: string;
  answer: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
}

export class LLMService {
  private modelInstance: any | null = null;
  private growthSuffixes = [
    "Foundations",
    "Core Concepts",
    "Hands-on Workflow",
    "Common Mistakes",
    "Advanced Applications",
    "Evaluation Methods",
    "Real-world Case Study",
    "Future Trends",
  ];

  private getProvider(): AIProvider {
    const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase();
    if (provider === "openai" || provider === "groq" || provider === "gemini") {
      return provider;
    }
    return "gemini";
  }

  private async getModel() {
    if (this.modelInstance) return this.modelInstance;

    const provider = this.getProvider();

    if (provider === "openai") {
      const mod = await import("@langchain/openai");
      this.modelInstance = new mod.ChatOpenAI({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        apiKey: process.env.OPENAI_API_KEY,
        temperature: 0.3,
      });
      return this.modelInstance;
    }

    if (provider === "groq") {
      const mod = await import("@langchain/groq");
      this.modelInstance = new mod.ChatGroq({
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        apiKey: process.env.GROQ_API_KEY,
        temperature: 0.3,
      });
      return this.modelInstance;
    }

    const mod = await import("@langchain/google-genai");
    this.modelInstance = new mod.ChatGoogleGenerativeAI({
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      apiKey: process.env.GEMINI_API_KEY,
      temperature: 0.3,
    });
    return this.modelInstance;
  }

  private normalizeContent(content: any): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part.text === "string") return part.text;
          return "";
        })
        .join("\n");
    }
    return "";
  }

  private async invokeJson<T>(prompt: string, fallback: T): Promise<T> {
    try {
      const model = await this.getModel();
      const response = await model.invoke(prompt);
      const raw = this.normalizeContent(response.content || "");
      const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(cleaned) as T;
    } catch {
      return fallback;
    }
  }

  private tokenizeTopic(text: string): string {
    const cleaned = (text || "").replace(/\s+/g, " ").trim();
    if (!cleaned) return "Topic";
    return cleaned.length > 48 ? `${cleaned.slice(0, 48)}...` : cleaned;
  }

  async runGrowthChain(input: GrowthInput): Promise<GrowthOutput | null> {
    const excludedText = input.excludedIDs.length ? input.excludedIDs.join(", ") : "none";

    const prompt = [
      "You are the Growth Chain for a recursive knowledge forest.",
      "Propose exactly one unique new sub-topic (a knowledge gap bridge).",
      `Parent node text: ${input.parentText}`,
      `Do not repeat these IDs/keywords/topics: ${excludedText}`,
      "Return JSON only:",
      '{"label":"...","summary":"..."}',
    ].join("\n");

    const out = await this.invokeJson<GrowthOutput | null>(prompt, null);
    if (out?.label && out?.summary) return out;

    // Offline-safe fallback so growth never stalls.
    const topic = this.tokenizeTopic(input.parentText);
    const excluded = new Set(input.excludedIDs.map((v) => v.toLowerCase()));
    const candidate =
      this.growthSuffixes.find((suffix) => !excluded.has(`${topic} ${suffix}`.toLowerCase())) ||
      this.growthSuffixes[0];

    return {
      label: `${topic} ${candidate}`,
      summary: `Explore ${candidate.toLowerCase()} for ${topic.toLowerCase()} with practical examples and short checkpoints.`,
    };
  }

  async runFlashcardChain(input: FlashcardInput): Promise<Flashcard[]> {
    const prompt = [
      "You are a learning assistant.",
      `Topic: ${input.label}`,
      `Content: ${input.content}`,
      "Generate exactly 3 concise flashcards.",
      "Return JSON only as an array:",
      '[{"question":"...","answer":"..."}]',
    ].join("\n");

    const out = await this.invokeJson<Flashcard[]>(prompt, []);
    const clean = out.filter((card) => card.question && card.answer).slice(0, 3);
    if (clean.length > 0) return clean;

    const topic = this.tokenizeTopic(input.label || input.content);
    return [
      {
        question: `What is the main idea behind ${topic}?`,
        answer: `${topic} focuses on the core principles, decision process, and practical outcomes.`,
      },
      {
        question: `What is one practical workflow step for ${topic}?`,
        answer: `Define the goal, choose a method, test results, then refine based on feedback.`,
      },
      {
        question: `What is a common pitfall in ${topic}?`,
        answer: `Jumping to advanced techniques before validating fundamentals and evaluation criteria.`,
      },
    ];
  }

  async runFruitChain(input: FruitInput): Promise<QuizQuestion[]> {
    const prompt = [
      "You are the Fruit Chain for a knowledge forest.",
      "Analyze the branch path and produce exactly 3 MCQ questions.",
      `Branch path: ${input.branchPath.join(" -> ")}`,
      "Return JSON only as an array:",
      '[{"question":"...","options":["A","B","C","D"],"correctAnswer":"A"}]',
    ].join("\n");

    const out = await this.invokeJson<QuizQuestion[]>(prompt, []);
    const clean = out.filter(
      (q) => q.question && Array.isArray(q.options) && q.options.length === 4 && q.correctAnswer,
    );
    if (clean.length > 0) return clean.slice(0, 3);

    const topic = this.tokenizeTopic(input.branchPath.join(" -> ") || "the topic");
    return [
      {
        question: `What is the first best step when learning ${topic}?`,
        options: [
          "Clarify objective and constraints",
          "Skip fundamentals",
          "Memorize terms only",
          "Avoid validation",
        ],
        correctAnswer: "Clarify objective and constraints",
      },
      {
        question: `Which action improves understanding most over time?`,
        options: [
          "Iterate with feedback",
          "Never test assumptions",
          "Ignore errors",
          "Use one source forever",
        ],
        correctAnswer: "Iterate with feedback",
      },
      {
        question: `What usually causes weak results?`,
        options: [
          "Poor evaluation criteria",
          "Clear metrics",
          "Balanced practice",
          "Stepwise refinement",
        ],
        correctAnswer: "Poor evaluation criteria",
      },
    ];
  }
}

export const llmService = new LLMService();
