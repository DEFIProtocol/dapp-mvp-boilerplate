'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import './styles/AdminAccess.css';

export default function AdminAccess() {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const router = useRouter();

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');
        
        // Simple redirect with auth param
        router.push('/admin?auth=admin123');
    };

    return (
        <div className="admin-login-container">
            <div className="admin-login-card">
                <h1>Admin Access</h1>
                <p className="subtitle">Enter password to continue</p>
                
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter admin password"
                            className="password-input"
                            autoFocus
                        />
                    </div>
                    
                    {error && <div className="error-message">{error}</div>}
                    
                    <button type="submit" className="login-button">
                        Login
                    </button>
                </form>
                
                <p className="hint">
                    Hint: Use 'admin123' (you can change this later)
                </p>
            </div>
        </div>
    );
}