import Link from "next/link";
import styles from "./developer.module.css";

export default function DeveloperPage() {
  return (
    <main className={styles.page}>
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
        <h2>Example request</h2>
        <pre className={styles.codeBlock}>
          <code>
{`GET /api/binance/prices HTTP/1.1
Host: api.example.com
x-api-key: <your_api_key>`}
          </code>
        </pre>
        <p>Or using the authorization header:</p>
        <pre className={styles.codeBlock}>
          <code>
{`Authorization: ApiKey <your_api_key>`}
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
