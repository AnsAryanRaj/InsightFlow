import { Suspense } from "react";
import Nav from "@/components/Nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="paper-grain min-h-screen">
      <div className="no-print">
        <Nav />
      </div>
      <main className="mx-auto max-w-[1360px] px-5 pb-24 pt-10 md:px-8 md:pt-14">
        <Suspense fallback={null}>{children}</Suspense>
      </main>
    </div>
  );
}
