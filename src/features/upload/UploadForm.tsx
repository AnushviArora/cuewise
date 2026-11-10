"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { ArrowRightIcon, CaptionsIcon, FileIcon, VideoIcon } from "@/components/ui/Icons";
import { useLecture } from "@/lib/lecture-context";
import {
  MAX_COURSE_NAME,
  validateCourseName,
  validateSlides,
  validateVideo,
} from "@/lib/validation";
import { FileDropzone } from "./FileDropzone";

type Errors = { course: string | null; video: string | null; slides: string | null };
const NO_ERRORS: Errors = { course: null, video: null, slides: null };

export function UploadForm() {
  const router = useRouter();
  const { setLecture } = useLecture();
  const courseId = useId();
  const courseRef = useRef<HTMLInputElement>(null);

  const [course, setCourse] = useState("");
  const [video, setVideo] = useState<File | null>(null);
  const [slides, setSlides] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>(NO_ERRORS);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const next: Errors = {
      course: validateCourseName(course),
      video: validateVideo(video),
      slides: validateSlides(slides),
    };
    setErrors(next);
    if (next.course || next.video || next.slides) {
      // Move focus to the first problem so keyboard/screen-reader users land on it.
      if (next.course) courseRef.current?.focus();
      else document.getElementById("video-field")?.querySelector("input")?.focus();
      return;
    }
    setLecture({ courseName: course, video: video as File, slides });
    router.push("/workspace");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <div className="mb-10">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-muted">
          <CaptionsIcon width={14} height={14} className="text-accent" /> Cuewise
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Upload a lecture
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-muted">
          Add the video and, optionally, the slides. You’ll preview captions and fine-tune how
          they appear before publishing.
        </p>
      </div>

      <GlassPanel className="p-6 sm:p-8">
        <form onSubmit={onSubmit} noValidate className="space-y-7">
          <div>
            <label htmlFor={courseId} className="mb-2 block text-sm font-medium text-ink">
              Course name
            </label>
            <input
              ref={courseRef}
              id={courseId}
              type="text"
              value={course}
              maxLength={MAX_COURSE_NAME + 20}
              placeholder="e.g. MATH 201: Linear Algebra"
              onChange={(e) => {
                setCourse(e.target.value);
                if (errors.course) setErrors((p) => ({ ...p, course: null }));
              }}
              aria-invalid={errors.course ? true : undefined}
              aria-describedby={errors.course ? `${courseId}-error` : undefined}
              className={`w-full rounded-xl border bg-black/30 px-4 py-3 text-sm text-ink placeholder:text-subtle ${
                errors.course ? "border-danger" : "border-edge hover:border-ink/60"
              }`}
            />
            {errors.course && (
              <p id={`${courseId}-error`} role="alert" className="mt-2 text-sm text-danger">
                {errors.course}
              </p>
            )}
          </div>

          <div id="video-field">
            <FileDropzone
              label="Lecture video"
              hint="MP4, up to 2 GB"
              accept="video/mp4,.mp4"
              icon={<VideoIcon />}
              file={video}
              error={errors.video}
              onFile={(f) => {
                setVideo(f);
                setErrors((p) => ({ ...p, video: f ? validateVideo(f) : null }));
              }}
            />
          </div>

          <FileDropzone
            label="Lecture slides"
            optional
            hint="PDF, up to 50 MB. Used to fix names and technical terms in the captions."
            accept="application/pdf,.pdf"
            icon={<FileIcon />}
            file={slides}
            error={errors.slides}
            onFile={(f) => {
              setSlides(f);
              setErrors((p) => ({ ...p, slides: validateSlides(f) }));
            }}
          />

          <div className="flex flex-col-reverse items-stretch gap-4 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-subtle">
              Your video stays in your browser. Only its audio and your slides’ text are sent to OpenAI to make captions.
            </p>
            <Button type="submit">
              Open workspace <ArrowRightIcon width={18} height={18} />
            </Button>
          </div>
        </form>
      </GlassPanel>
    </motion.div>
  );
}
