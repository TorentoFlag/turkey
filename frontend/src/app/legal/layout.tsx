import type { ReactNode } from "react";

import { LegalPageShell } from "@/components/legal/LegalPageShell";

export default function LegalLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <LegalPageShell>{children}</LegalPageShell>;
}
