import { createContext, useContext, useState, type ReactNode } from "react";

export interface SelectedQuestion {
  id: string;
  questionNumber: string;
  sectionNumber: string | null;
  title: string;
  status: string | null;
  assignedWriterId: string | null;
  pensDownDate: string | null;
}

interface QuestionContextValue {
  selectedQuestion: SelectedQuestion | null;
  setSelectedQuestion: (q: SelectedQuestion | null) => void;
}

const QuestionContext = createContext<QuestionContextValue | null>(null);

export function QuestionProvider({ children }: { children: ReactNode }) {
  const [selectedQuestion, setSelectedQuestion] = useState<SelectedQuestion | null>(null);
  return (
    <QuestionContext.Provider value={{ selectedQuestion, setSelectedQuestion }}>
      {children}
    </QuestionContext.Provider>
  );
}

export function useQuestion() {
  const ctx = useContext(QuestionContext);
  if (!ctx) throw new Error("useQuestion must be used inside QuestionProvider");
  return ctx;
}

/** Safe variant for components that may render outside the provider. */
export function useQuestionOptional(): QuestionContextValue | null {
  return useContext(QuestionContext);
}
