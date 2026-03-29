// app/crypto/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Zap, ArrowRight } from "lucide-react";
import styles from "./page.module.css";

export default function CryptoPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect after a short delay for a smooth transition
    const timer = setTimeout(() => {
      router.replace("/futures");
    }, 1500);
    
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className={styles.splashScreen}>
      <div className={styles.gradientBg} />
      
      <div className={styles.splashContent}>
        <div className={styles.logoWrapper}>
          <div className={styles.logoGlow} />
          <Zap size={48} className={styles.logoIcon} />
          <h1 className={styles.logoText}>DApp</h1>
        </div>
        
        <div className={styles.loadingSection}>
          <div className={styles.loadingRing}>
            <div className={styles.ring} />
            <div className={styles.ring} />
            <div className={styles.ring} />
          </div>
          <p className={styles.loadingText}>Redirecting to Futures...</p>
        </div>
        
        <button 
          className={styles.manualRedirect}
          onClick={() => router.replace("/futures")}
        >
          <span>Go Now</span>
          <ArrowRight size={16} />
        </button>
      </div>
      
      <div className={styles.particles}>
        {[...Array(20)].map((_, i) => (
          <div key={i} className={styles.particle} style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 2}s`,
            animationDuration: `${2 + Math.random() * 3}s`
          }} />
        ))}
      </div>
    </div>
  );
}