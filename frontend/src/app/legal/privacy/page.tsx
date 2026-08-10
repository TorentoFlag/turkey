import type { Metadata } from "next";

import { LegalDocument } from "@/components/legal/LegalDocument";

export const metadata: Metadata = {
  title: "Политика конфиденциальности — Turkey Planners",
};

export default function PrivacyPage() {
  return <LegalDocument documentId="privacy" />;
}
