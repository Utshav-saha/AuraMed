"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export default function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div
        className={`relative sheet w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-md"} max-h-[92vh] flex flex-col rounded-b-none sm:rounded-b-lg shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200`}
      >
        <header className="flex items-center justify-between px-5 h-13 border-b border-line shrink-0">
          <h3 className="text-base">{title}</h3>
          <button onClick={onClose} className="btn-ghost h-8 w-8 p-0" aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4 flex-1">{children}</div>
        {footer && <footer className="px-5 py-3 border-t border-line flex items-center justify-end gap-2 shrink-0 bg-paper rounded-b-lg">{footer}</footer>}
      </div>
    </div>
  );
}
