import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Пользовательское соглашение — Turkey Planners",
};

export default function TermsPage() {
  return <LegalDocument documentId="terms" />;
}
