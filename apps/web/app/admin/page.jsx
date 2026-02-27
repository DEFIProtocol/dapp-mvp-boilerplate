// app/admin/page.jsx
import { Suspense } from 'react';
import AdminAccess from './components/AdminAccess';
import PricingManager from './components/PricingManager';
import TokenManager from './components/TokenManager.jsx';
import './admin.module.css';

export default async function AdminPage({ searchParams }) {
    // Await the searchParams promise
    const params = await searchParams;
    const auth = params?.auth;

    // Simple auth check
    if (auth !== 'admin123') {
        return <AdminAccess />;
    }

    return (
        <div className="admin-container">
            <div className="admin-header">
                <h1>Admin Dashboard</h1>
                <a href="/admin" className="logout-btn">Logout</a>
            </div>
            
            <div className="admin-tabs">
                <button className="tab-button active">💰 Pricing</button>
                <button className="tab-button" disabled>🗂️ Tokens</button>
                <TokenManager />
                <button className="tab-button" disabled>👥 Users (Coming Soon)</button>
            </div>
            
            <div className="admin-content">
                <Suspense fallback={<div className="loading">Loading pricing data...</div>}>
                    <PricingManager />
                </Suspense>
            </div>
        </div>
    );
}