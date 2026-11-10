"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useId, useRef, useState, type DragEvent } from "react";
import { AlertIcon, CloseIcon, FileIcon } from "@/components/ui/Icons";
import { formatBytes, MAX_SLIDES_FILES } from "@/lib/validation";

interface Props {
  files: File[];
  messages: string[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
}

/** Multi-PDF picker: click or drop several files at once, add more later, remove any with ×. */
export function DocumentsDropzone({ files, messages, onAdd, onRemove }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const full = files.length >= MAX_SLIDES_FILES;
  const describedBy = `${id}-hint${messages.length ? ` ${id}-error` : ""}`;

  const take = (list: FileList | null) => {
    if (list && list.length) onAdd(Array.from(list));
    if (inputRef.current) inputRef.current.value = ""; // allow re-picking the same file
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    take(e.dataTransfer.files);
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          Slides, notes and handouts
        </label>
        <span className="text-xs text-subtle">
          Optional{files.length > 0 && ` · ${files.length} of ${MAX_SLIDES_FILES}`}
        </span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`relative rounded-2xl border border-dashed transition-colors ${
          messages.length
            ? "border-danger bg-danger/5"
            : dragging
              ? "border-accent bg-accent-soft"
              : "border-edge bg-white/[0.03] hover:border-ink/60 hover:bg-white/[0.06]"
        }`}
      >
        <input
          ref={inputRef}
          id={id}
          type="file"
          multiple
          accept="application/pdf,.pdf"
          aria-describedby={describedBy}
          onChange={(e) => take(e.target.files)}
          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        />
        <div className="pointer-events-none absolute inset-0 rounded-2xl peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" />
        <div className={`flex items-center gap-4 px-5 ${files.length ? "py-4" : "py-6"}`}>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-accent">
            <FileIcon />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">
              {files.length ? "Add more PDFs" : "Drop PDFs here, or "}
              {!files.length && (
                <span className="text-accent underline underline-offset-2">browse</span>
              )}
            </p>
            <p id={`${id}-hint`} className="text-xs text-muted">
              {full
                ? `You’ve reached the ${MAX_SLIDES_FILES}-document limit.`
                : `Up to ${MAX_SLIDES_FILES} PDFs, 50 MB each. Names and terms from all of them improve the captions.`}
            </p>
          </div>
        </div>
      </div>

      <ul aria-label="Added documents" className="mt-3 space-y-2">
        <AnimatePresence initial={false}>
          {files.map((f, i) => (
            <motion.li
              key={`${f.name}-${f.size}-${f.lastModified}`}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] py-2 pl-3 pr-2"
            >
              <FileIcon width={16} height={16} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{f.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted">{formatBytes(f.size)}</span>
              <button
                type="button"
                onClick={() => {
                  onRemove(i);
                  inputRef.current?.focus();
                }}
                aria-label={`Remove ${f.name}`}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-white/10 hover:text-ink"
              >
                <CloseIcon width={16} height={16} />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <AnimatePresence initial={false}>
        {messages.length > 0 && (
          <motion.ul
            id={`${id}-error`}
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 space-y-1 overflow-hidden text-sm text-danger"
          >
            {messages.map((m) => (
              <li key={m} className="flex items-start gap-2">
                <AlertIcon width={16} height={16} className="mt-0.5 shrink-0" />
                <span>{m}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
