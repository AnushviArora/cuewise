"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { AlertIcon, CloseIcon } from "@/components/ui/Icons";
import { formatBytes } from "@/lib/validation";

interface Props {
  label: string;
  hint: string;
  optional?: boolean;
  accept: string;
  icon: ReactNode;
  file: File | null;
  error: string | null;
  onFile: (file: File | null) => void;
}

/** Click, keyboard or drag-and-drop file picker with empty, filled and error states. */
export function FileDropzone({ label, hint, optional, accept, icon, file, error, onFile }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const describedBy = `${id}-hint${error ? ` ${id}-error` : ""}`;

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onFile(dropped);
  };

  const clear = () => {
    onFile(null);
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.focus();
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {optional && <span className="text-xs text-subtle">Optional</span>}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`relative rounded-2xl border border-dashed transition-colors ${
          error
            ? "border-danger bg-danger/5"
            : dragging
              ? "border-accent bg-accent-soft"
              : "border-edge bg-white/[0.03] hover:border-ink/60 hover:bg-white/[0.06]"
        }`}
      >
        {/* Real input stays in the tab order; the visible box mirrors its focus. */}
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        />
        <div className="pointer-events-none absolute inset-0 rounded-2xl peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />

        <div className="flex items-center gap-4 px-5 py-6">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-accent">
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            {file ? (
              <>
                <p className="truncate text-sm font-medium text-ink">{file.name}</p>
                <p className="text-xs text-muted">
                  {formatBytes(file.size)} · Click or drop to replace
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-ink">
                  Drop a file here, or <span className="text-accent underline underline-offset-2">browse</span>
                </p>
                <p id={`${id}-hint`} className="text-xs text-muted">
                  {hint}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* hint id must always exist for aria-describedby */}
      {file && (
        <p id={`${id}-hint`} className="sr-only">
          {hint}
        </p>
      )}

      {file && (
        <button
          type="button"
          onClick={clear}
          className="mt-2 inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-ink"
        >
          <CloseIcon width={14} height={14} /> Remove file
        </button>
      )}

      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            id={`${id}-error`}
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 flex items-start gap-2 overflow-hidden text-sm text-danger"
          >
            <AlertIcon width={16} height={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
