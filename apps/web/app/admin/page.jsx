// app/admin/page.tsx
"use client";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AdminAccess from "./components/AdminAccess";
import PricingManager from "./components/PricingManager";
import TokenManager from "./components/TokenManager";
import UserManager from "./components/UserManager";
import PerpsManager from "./components/PerpsManager"; // Add this import
import styles from "./admin.module.css";

function AdminPageContent() {
    const searchParams = useSearchParams();
    const auth = searchParams.get("auth");
    
    const [activeTab, setActiveTab] = useState("pricing");
    
    if (auth !== "admin123") {
        return <AdminAccess />;
    }
    
    return (
        <div className={styles.adminContainer}>
            <div className={styles.adminHeader}>
                <h1>Admin Dashboard</h1>
                <a href="/admin" className={styles.logoutBtn}>Logout</a>
            </div>

            <div className={styles.adminTabs}>
                <button
                    className={`${styles.tabButton} ${activeTab === "pricing" ? styles.active : ""}`}
                    onClick={() => setActiveTab("pricing")}
                >
                    <span>💰</span> Pricing
                </button>

                <button
                    className={`${styles.tabButton} ${activeTab === "tokens" ? styles.active : ""}`}
                    onClick={() => setActiveTab("tokens")}
                >
                    <span>🗂️</span> Tokens
                </button>

                <button
                    className={`${styles.tabButton} ${activeTab === "users" ? styles.active : ""}`}
                    onClick={() => setActiveTab("users")}
                >
                    <span>👥</span> Users
                </button>

                {/* New Perps Tab */}
                <button
                    className={`${styles.tabButton} ${activeTab === "perps" ? styles.active : ""}`}
                    onClick={() => setActiveTab("perps")}
                >
                    <span>📈</span> Perpetuals
                </button>
            </div>

            <div className={styles.adminContent}>
                {activeTab === "pricing" && (
                    <Suspense fallback={<div className={styles.loading}>Loading pricing data...</div>}>
                        <PricingManager />
                    </Suspense>
                )}

                {activeTab === "tokens" && <TokenManager />}

                {activeTab === "users" && <UserManager />}

                {/* New Perps Manager */}
                {activeTab === "perps" && <PerpsManager />}
            </div>
        </div>
    );
}

export default function AdminPage() {
    return (
        <Suspense fallback={<div className={styles.loading}>Loading admin...</div>}>
            <AdminPageContent />
        </Suspense>
    );
}