"use client";

import dynamic from "next/dynamic";

const Thread = dynamic(
  () => import("./thread").then((mod) => ({ default: mod.Thread })),
  { ssr: false }
);

export function ClientThread() {
  return <Thread />;
}
