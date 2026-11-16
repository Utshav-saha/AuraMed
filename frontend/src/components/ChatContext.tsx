"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// medicine details page theke chat ke bole dey kon generic niye kotha hocche
interface ChatCtx {
  genericId: number | null;
  genericName: string | null;
  open: boolean;
  setGeneric: (id: number | null, name?: string | null) => void;
  setOpen: (v: boolean) => void;
  ask: (question: string) => void;
  pendingQuestion: string | null;
  consumePending: () => string | null;
}

const Ctx = createContext<ChatCtx | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [genericId, setGenericId] = useState<number | null>(null);
  const [genericName, setGenericName] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pendingQuestion, setPending] = useState<string | null>(null);

  return (
    <Ctx.Provider
      value={{
        genericId,
        genericName,
        open,
        setOpen,
        setGeneric: (id, name) => {
          setGenericId(id);
          setGenericName(name ?? null);
        },
        ask: (q) => {
          setPending(q);
          setOpen(true);
        },
        pendingQuestion,
        consumePending: () => {
          const q = pendingQuestion;
          setPending(null);
          return q;
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useChat() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useChat outside ChatProvider");
  return c;
}
