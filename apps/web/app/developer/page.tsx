import Link from "next/link";
import DeveloperApiKeys from "./components/DeveloperApiKeys";
import styles from "./developer.module.css";

export default function DeveloperPage() {
  return (
    <main className={styles.page}>
      {/* Self-Service API Keys Section */}
      <DeveloperApiKeys />

      {/* Documentation Section */}
      <div className={styles.hero}>
        <div>
          <p className={styles.label}>Developer Portal</p>
          <h1>Unified API Key Access</h1>
          <p className={styles.description}>
            One developer API key gives you access to our pricing and market data endpoints.
            Use it with the `x-api-key` header or `Authorization: ApiKey &lt;key&gt;`.
          </p>
        </div>
      </div>

      <section className={styles.cardGrid}>
        <article className={styles.card}>
          <h2>How it works</h2>
          <p>
            We issue a single API key to your project and manage access centrally. The backend stores only
            a salted SHA-256 hash of the key, so the raw key is never retained after issuance.
          </p>
          <ul>
            <li>Developer keys are issued via admin-signed requests.</li>
            <li>Raw keys appear once on creation.</li>
            <li>Supported headers: <code>x-api-key</code> or <code>Authorization: ApiKey &lt;key&gt;</code>.</li>
            <li>Existing routes remain unchanged unless explicitly protected.</li>
          </ul>
        </article>

        <article className={styles.card}>
          <h2>Protected endpoints</h2>
          <p>These routes require your issued API key:</p>
          <ul>
            <li><code>/api/binance</code></li>
            <li><code>/api/coinbase</code></li>
            <li><code>/api/coinranking</code></li>
            <li><code>/api/1inch</code></li>
            <li><code>/api/klines</code></li>
            <li><code>/api/oracle</code></li>
            <li><code>/api/pyth</code></li>
            <li><code>/api/aggregator</code></li>
          </ul>
        </article>
      </section>

      <section className={styles.card}>
        <h2>Admin issuance</h2>
        <p>
          Key creation and revocation are protected by admin wallet signature proof. The admin must sign a message that matches the expected action:
        </p>
        <pre className={styles.codeBlock}>ADMIN_API_KEY_MANAGEMENT</pre>
        <p>
          Send the signed payload to <code>POST /api/api-keys</code>. The response returns the raw key once in this format:
        </p>
        <pre className={styles.codeBlock}><code>{"<key-id>.<secret>"}</code></pre>
      </section>

      <section className={styles.card}>
        <h2>Example requests</h2>
        <p><strong>Using x-api-key header:</strong></p>
        <pre className={styles.codeBlock}>
          <code>
{`GET /api/binance/prices HTTP/1.1
Host: api.example.com
x-api-key: <your_api_key>

# Example with curl:
curl -H "x-api-key: YOUR_API_KEY" \\
  https://api.example.com/api/binance/prices`}
          </code>
        </pre>
        <p><strong>Using Authorization header:</strong></p>
        <pre className={styles.codeBlock}>
          <code>
{`GET /api/coinbase/prices HTTP/1.1
Host: api.example.com
Authorization: ApiKey <your_api_key>

# Example with curl:
curl -H "Authorization: ApiKey YOUR_API_KEY" \\
  https://api.example.com/api/coinbase/prices`}
          </code>
        </pre>
      </section>

      <section className={styles.card}>
        <h2>Rate limiting</h2>
        <p>
          All API responses include rate limit headers to help you track your usage:
        </p>
        <ul>
          <li><code>X-RateLimit-Limit</code>: Maximum requests allowed per window</li>
          <li><code>X-RateLimit-Remaining</code>: Requests remaining in current window</li>
          <li><code>X-RateLimit-Reset</code>: Window duration in seconds</li>
        </ul>
        <p>
          If you exceed your rate limit, you'll receive a <code>429 Too Many Requests</code> response.
          Wait for the window to reset before making additional requests.
        </p>
      </section>

      <section className={styles.card}>
        <h2>Error responses</h2>
        <p>The API uses standard HTTP status codes:</p>
        <ul>
          <li><code>401 Unauthorized</code>: Missing or invalid API key</li>
          <li><code>403 Forbidden</code>: Endpoint not authorized for your key</li>
          <li><code>429 Too Many Requests</code>: Rate limit exceeded</li>
          <li><code>500 Internal Server Error</code>: Server-side error</li>
        </ul>
        <p>All error responses include a JSON body with details:</p>
        <pre className={styles.codeBlock}>
          <code>
{`{
  "success": false,
  "error": "Rate limit exceeded"
}`}
          </code>
        </pre>
      </section>

      <section className={styles.card}>
        <h2>Need help?</h2>
        <p>
          If you want, I can also add a small admin dashboard page for key issuance and revocation flows.
        </p>
        <Link className={styles.button} href="/account">
          Back to Account
        </Link>
      </section>
    </main>
  );
}
