import { findLegalDocument, type LegalDocumentId } from "@/config/legal";

import styles from "./legal-document.module.css";

type LegalDocumentProps = {
  documentId: LegalDocumentId;
};

export function LegalDocument({ documentId }: LegalDocumentProps) {
  const document = findLegalDocument(documentId);

  return (
    <article aria-labelledby="legal-document-title" className={styles.document}>
      <header className={styles.header}>
        <h1 id="legal-document-title">{document.title}</h1>
      </header>
      <div className={styles.intro}>
        {document.intro.map((text) => <p key={text}>{text}</p>)}
      </div>
      <div className={styles.sections}>
        {document.sections.map((section) => (
          <section className={styles.section} key={section.title}>
            <h2>{section.title}</h2>
            {section.blocks.map((block, index) => <p key={`${section.title}-${index}`}>{block.text}</p>)}
          </section>
        ))}
      </div>
    </article>
  );
}
