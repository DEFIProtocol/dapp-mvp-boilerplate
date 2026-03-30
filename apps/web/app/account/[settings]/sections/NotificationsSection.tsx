import { Mail } from "lucide-react";
import type { PreferencesSectionProps } from "./types";
import styles from "../SettingsPage.module.css";

export function NotificationsSection({ preferences, setPreferences }: PreferencesSectionProps) {
  return (
    <div className={styles.settingsCard}>
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          <div className={styles.cardIcon}>
            <Mail size={18} />
          </div>
          <div>
            <h2 className={styles.cardTitle}>Email Notifications</h2>
            <p className={styles.cardDescription}>Stay updated on your trades</p>
          </div>
        </div>
      </div>

      <div className={styles.notificationGrid}>
        {Object.entries(preferences.notifications.email).map(([key, value]) => (
          <label key={key} className={styles.toggleItem}>
            <span className={styles.toggleLabel}>{key.replace(/([A-Z])/g, " $1").trim()}</span>
            <div className={styles.toggleSwitch}>
              <input
                type="checkbox"
                checked={value}
                onChange={(event) =>
                  setPreferences((prev) => ({
                    ...prev,
                    notifications: {
                      email: {
                        ...prev.notifications.email,
                        [key]: event.target.checked,
                      },
                    },
                  }))
                }
                className={styles.toggleInput}
              />
              <span className={styles.toggleSlider} />
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
