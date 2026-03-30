import { Check, User } from "lucide-react";
import styles from "../SettingsPage.module.css";

interface AccountSectionProps {
  email: string;
  setEmail: (value: string) => void;
  username: string;
  setUsername: (value: string) => void;
  emailVerified: boolean;
  setEmailVerified: (value: boolean) => void;
  isVerifiedByCoinbase: boolean;
  setIsVerifiedByCoinbase: (value: boolean) => void;
  onVerifyEmail: () => void;
}

export function AccountSection({
  email,
  setEmail,
  username,
  setUsername,
  emailVerified,
  setEmailVerified,
  isVerifiedByCoinbase,
  setIsVerifiedByCoinbase,
  onVerifyEmail,
}: AccountSectionProps) {
  return (
    <div className={styles.settingsCard}>
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          <div className={styles.cardIcon}>
            <User size={18} />
          </div>
          <div>
            <h2 className={styles.cardTitle}>Account</h2>
            <p className={styles.cardDescription}>Manage profile fields from your user record</p>
          </div>
        </div>
      </div>

      <div className={styles.formStack}>
        <div className={styles.selectWrapper}>
          <label className={styles.selectLabel}>Username</label>
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="your_username"
            className={styles.textInput}
          />
        </div>

        <div className={styles.selectWrapper}>
          <label className={styles.selectLabel}>Email</label>
          <div className={styles.inputWrapper}>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="your@email.com"
              className={styles.emailInput}
            />
            {email && !emailVerified ? (
              <button type="button" onClick={onVerifyEmail} className={styles.verifyButton}>
                Verify
              </button>
            ) : null}
          </div>
          {emailVerified ? (
            <div className={styles.verifiedBadge}>
              <Check size={12} />
              <span>Verified</span>
            </div>
          ) : null}
        </div>
      </div>

      <label className={styles.toggleItem}>
        <span className={styles.toggleLabel}>Email verified</span>
        <div className={styles.toggleSwitch}>
          <input
            type="checkbox"
            checked={emailVerified}
            onChange={(event) => setEmailVerified(event.target.checked)}
            className={styles.toggleInput}
          />
          <span className={styles.toggleSlider} />
        </div>
      </label>

      <label className={styles.toggleItem}>
        <span className={styles.toggleLabel}>Verified by Coinbase</span>
        <div className={styles.toggleSwitch}>
          <input
            type="checkbox"
            checked={isVerifiedByCoinbase}
            onChange={(event) => setIsVerifiedByCoinbase(event.target.checked)}
            className={styles.toggleInput}
          />
          <span className={styles.toggleSlider} />
        </div>
      </label>
    </div>
  );
}
