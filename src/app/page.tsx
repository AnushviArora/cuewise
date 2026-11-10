import { UploadForm } from "@/features/upload/UploadForm";

export default function HomePage() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-5 py-16 sm:py-24">
      <UploadForm />
    </main>
  );
}
