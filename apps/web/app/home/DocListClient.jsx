"use client";
import { useState } from "react";
import styles from "./page.module.css";

export default function DocListClient({ docs }) {
  const [activeId, setActiveId] = useState(null);

  return (
    <div className={styles.docsInner}>
      {docs.map((doc) => {
        const isActive = activeId === doc.id;
        return (
          <div key={doc.id} className={styles.docItemBlock}>
            <div className={styles.docItemRow}>
              <div style={{ flex: 1 }}>
                <h3>{doc.title}</h3>
                <p>{doc.subtitle}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className={styles.primaryBtn}
                  onClick={() => setActiveId(isActive ? null : doc.id)}
                  type="button"
                >
                  {isActive ? "Close" : "View"}
                </button>
                <a className={styles.secondaryBtn} href={doc.url} download>
                  Download
                </a>
              </div>
            </div>

            {isActive && (
              <div className={styles.docViewer}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>Viewing {doc.title}</strong>
                  <a href={doc.url} target="_blank" rel="noreferrer" className={styles.secondaryBtn}>
                    Open in new tab
                  </a>
                </div>
                <div style={{ marginTop: 12 }}>
                  <iframe src={doc.url} width="100%" height="700px" title={doc.title} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
