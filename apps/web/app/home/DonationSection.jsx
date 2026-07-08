'use client';

import { useState } from 'react';
import styles from './DonationSection.module.css';

export default function DonationSection() {
  const [copiedAddress, setCopiedAddress] = useState(null);

  const copyToClipboard = async (address, label) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(label);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const foundationAddresses = [
    {
      label: 'Ethereum (Foundation)',
      address: '0x748D3D9A16f312C781Da370374391b242e68f1C1',
    },
    {
      label: 'Bitcoin (Native SegWit)',
      address: 'bc1qcp7dy40ecyfaufehgft5c48vluacw7r6unjldd',
    },
    {
      label: 'Solana',
      address: '4kdKbJkZuTnFrkz6GojD3uRYH2SGc1Qo21GNVJuUyfKv',
    },
  ];

  const creatorAddresses = [
    {
      label: 'Ethereum (Personal)',
      address: '0xdf9df71AA92d9fDB58DCfC23b16a6e779776E085',
    },
    {
      label: 'Bitcoin (Native SegWit)',
      address: 'bc1qy27kt9sy2qrevmw5sedgsevnlkt30j4er2nzq7',
    },
    {
      label: 'Solana',
      address: 'BTcS6CnTtLvhv82tnT9BvJwxYmFuq4E2ZaJ4CGT65hJ7',
    },
  ];

  return (
    <section className={styles.donationSection}>
      <div className={styles.donationHeader}>
        <h2>
          <span className={styles.heartIcon}>❤️</span> Support the Mission — Fuel What We&apos;re Building Together
        </h2>
      </div>

      <div className={styles.donationContent}>
        <p className={styles.missionText}>
          Every meaningful project begins with a spark — a belief that people can build something better when they choose to stand together. The foundation exists because of that belief. It&apos;s powered by community, by conviction, and by individuals who see value in strengthening decentralized systems that serve everyone, not just a few.
        </p>

        <p className={styles.missionText}>
          If you choose to contribute, know this:<br />
          <strong>your support doesn&apos;t disappear into a void.</strong><br />
          It becomes momentum. It becomes infrastructure. It becomes the next step forward for a protocol built with transparency, integrity, and purpose.
        </p>

        <p className={styles.introText}>
          Below are the official donation channels for the foundation, followed by optional creator support addresses for those who wish to directly empower the builders behind the work.
        </p>
      </div>

      <div className={styles.addressSection}>
        <h3 className={styles.sectionTitle}>
          <span className={styles.icon}>🌐</span> Foundation Donation Addresses
        </h3>
        <p className={styles.sectionDescription}>
          These contributions go directly toward development, infrastructure, audits, community resources, and long‑term sustainability.
        </p>

        <div className={styles.addressList}>
          {foundationAddresses.map((item) => (
            <div key={item.label} className={styles.addressCard}>
              <div className={styles.addressHeader}>
                <span className={styles.addressLabel}>{item.label}</span>
              </div>
              <div className={styles.addressRow}>
                <code className={styles.addressText}>{item.address}</code>
                <button
                  onClick={() => copyToClipboard(item.address, item.label)}
                  className={styles.copyButton}
                  aria-label={`Copy ${item.label} address`}
                >
                  {copiedAddress === item.label ? (
                    <span className={styles.copiedIcon}>✓</span>
                  ) : (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.addressSection}>
        <h3 className={styles.sectionTitle}>
          <span className={styles.icon}>🤝</span> Creator Support Addresses
        </h3>
        <p className={styles.sectionDescription}>
          For those who want to directly support our creators — the time, energy, and personal commitment behind the protocol&apos;s creation. These contributions help sustain the countless hours of research, development, testing, and community building that make this project possible.
        </p>

        <div className={styles.addressList}>
          {creatorAddresses.map((item) => (
            <div key={item.label} className={styles.addressCard}>
              <div className={styles.addressHeader}>
                <span className={styles.addressLabel}>{item.label}</span>
              </div>
              <div className={styles.addressRow}>
                <code className={styles.addressText}>{item.address}</code>
                <button
                  onClick={() => copyToClipboard(item.address, `creator-${item.label}`)}
                  className={styles.copyButton}
                  aria-label={`Copy ${item.label} address`}
                >
                  {copiedAddress === `creator-${item.label}` ? (
                    <span className={styles.copiedIcon}>✓</span>
                  ) : (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
