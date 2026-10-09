export type Policy = {
  id: string;
  title: string;
  department: string;
  category: string;
  text: string;
};

export type Hit = {
  id: string;
  title: string;
  score: number;
  text: string;
  category: string;
};

export type ApproachResult = {
  method: "rules" | "llm" | "llm-index";
  label: string;
  answer: string;
  policyId: string | null;
  policyTitle: string | null;
  abstained: boolean;
  ms: number;
  tokens: number;
  promptTokens: number;
  completionTokens: number;
  unsupported: number;
  band: "Low" | "Medium" | "High";
  notes: string[];
  hits: Hit[];
  error?: string;
};

export type Comparison = {
  question: string;
  approaches: ApproachResult[];
  cached: boolean;
};
