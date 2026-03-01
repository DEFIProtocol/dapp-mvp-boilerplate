"use client";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AdminAccess from "./components/AdminAccess";
import PricingManager from "./components/PricingManager";
import TokenManager from "./components/TokenManager";
import UserManager from "./components/UserManager";
import styles from "./admin.module.css"; // Changed to import as styles

export default function AdminPage() {
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
            </div>

            <div className={styles.adminContent}>
                {activeTab === "pricing" && (
                    <Suspense fallback={<div className={styles.loading}>Loading pricing data...</div>}>
                        <PricingManager />
                    </Suspense>
                )}

                {activeTab === "tokens" && <TokenManager />}

                {activeTab === "users" && <UserManager />}
            </div>
        </div>
    );
}