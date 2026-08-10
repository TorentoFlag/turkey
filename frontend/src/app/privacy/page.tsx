import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/LegalDocument";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Политика конфиденциальности — Turkey Planners",
};

export default function PrivacyAliasPage() {
  return <LegalPageShell><LegalDocument documentId="privacy" /></LegalPageShell>;
}
