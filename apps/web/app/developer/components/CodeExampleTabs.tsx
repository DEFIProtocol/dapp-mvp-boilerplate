"use client";

import { useState } from "react";
import styles from "./CodeExampleTabs.module.css";

export default function CodeExampleTabs() {
  const [activeTab, setActiveTab] = useState<"powershell" | "curl" | "javascript">("powershell");
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const powershellScript = `$apiKey = "YOUR_API_KEY_HERE"
$uri = "https://dapp-mvp-boilerplate.onrender.com/api/binance/prices"

try {
    $response = Invoke-WebRequest -Uri $uri -Headers @{'x-api-key'=$apiKey} -Method GET
    
    Write-Host "✅ SUCCESS!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Status Code: $($response.StatusCode)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Rate Limit Headers:" -ForegroundColor Yellow
    Write-Host "  X-RateLimit-Limit: $($response.Headers['X-RateLimit-Limit'])"
    Write-Host "  X-RateLimit-Remaining: $($response.Headers['X-RateLimit-Remaining'])"
    Write-Host "  X-RateLimit-Reset: $($response.Headers['X-RateLimit-Reset'])"
    Write-Host ""
    Write-Host "Response Content:" -ForegroundColor Yellow
    Write-Host $response.Content
    
} catch {
    Write-Host "❌ ERROR!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error Message: $($_.Exception.Message)" -ForegroundColor Red
}`;

  const curlScript = `# Replace YOUR_API_KEY_HERE with your actual API key
curl -H "x-api-key: YOUR_API_KEY_HERE" \\
  -H "Content-Type: application/json" \\
  https://dapp-mvp-boilerplate.onrender.com/api/binance/prices

# For verbose output with headers:
curl -v -H "x-api-key: YOUR_API_KEY_HERE" \\
  https://dapp-mvp-boilerplate.onrender.com/api/binance/prices`;

  const javascriptScript = `// Replace YOUR_API_KEY_HERE with your actual API key
const apiKey = "YOUR_API_KEY_HERE";
const baseUrl = "https://dapp-mvp-boilerplate.onrender.com";

async function testApiKey() {
  try {
    const response = await fetch(\`\${baseUrl}/api/binance/prices\`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ SUCCESS!');
    console.log('Status:', response.status);
    console.log('Rate Limit:', response.headers.get('X-RateLimit-Limit'));
    console.log('Remaining:', response.headers.get('X-RateLimit-Remaining'));
    console.log('Reset:', response.headers.get('X-RateLimit-Reset'));
    
    const data = await response.json();
    console.log('Data:', data);
    
    return data;
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    throw error;
  }
}

// Run the test
testApiKey();`;

  const getActiveScript = () => {
    switch (activeTab) {
      case "powershell":
        return powershellScript;
      case "curl":
        return curlScript;
      case "javascript":
        return javascriptScript;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>🧪 Test Your API Key</h3>
        <p className={styles.subtitle}>
          Copy the script below, replace <code>YOUR_API_KEY_HERE</code> with your actual API key, and run it to test your access.
        </p>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "powershell" ? styles.active : ""}`}
          onClick={() => setActiveTab("powershell")}
        >
          PowerShell (Windows)
        </button>
        <button
          className={`${styles.tab} ${activeTab === "curl" ? styles.active : ""}`}
          onClick={() => setActiveTab("curl")}
        >
          cURL (Mac/Linux)
        </button>
        <button
          className={`${styles.tab} ${activeTab === "javascript" ? styles.active : ""}`}
          onClick={() => setActiveTab("javascript")}
        >
          JavaScript (Node.js)
        </button>
      </div>

      <div className={styles.codeContainer}>
        <div className={styles.codeHeader}>
          <span className={styles.language}>
            {activeTab === "powershell" && "PowerShell"}
            {activeTab === "curl" && "Bash"}
            {activeTab === "javascript" && "JavaScript"}
          </span>
          <button
            className={styles.copyButton}
            onClick={() => handleCopy(getActiveScript())}
          >
            {copied ? "✓ Copied!" : "📋 Copy"}
          </button>
        </div>
        <pre className={styles.code}>
          <code>{getActiveScript()}</code>
        </pre>
      </div>

      <div className={styles.instructions}>
        <h4>How to use:</h4>
        <ol>
          <li>Click the <strong>Copy</strong> button above</li>
          <li>Paste into your terminal or code editor</li>
          <li>Replace <code>YOUR_API_KEY_HERE</code> with your actual API key</li>
          <li>Run the script to verify your API access</li>
        </ol>
      </div>

      <div className={styles.expectedOutput}>
        <h4>Expected Output:</h4>
        <div className={styles.outputBox}>
          <p>✅ SUCCESS!</p>
          <p>Status Code: 200</p>
          <p>Rate Limit: 120</p>
          <p>Remaining: 119</p>
          <p>Response: {"{"}"success": true, "count": 239, "data": [...]{"}"}</p>
        </div>
      </div>
    </div>
  );
}
