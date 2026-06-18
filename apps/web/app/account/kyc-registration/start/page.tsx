"use client";

import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useUser } from "../../../src/contexts/UserContext";
import styles from "./KycForm.module.css";

export default function KycStartPage() {
  const { address, isConnected } = useAccount();
  const { user } = useUser();
  const { signMessageAsync } = useSignMessage();

  // Form fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [country, setCountry] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [idType, setIdType] = useState("passport");
  
  const [selectedFiles, setSelectedFiles] = useState<File[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);

  const validateStep1 = () => {
    if (!firstName.trim() || !lastName.trim() || !dateOfBirth) {
      setFeedback("Please fill in all required personal information fields.");
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!address1.trim() || !city.trim() || !country.trim()) {
      setFeedback("Please fill in all required address fields.");
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    if (!idType || !idNumber.trim()) {
      setFeedback("Please provide your identification information.");
      return false;
    }
    return true;
  };

  const handleNext = () => {
    setFeedback(null);
    if (currentStep === 1 && validateStep1()) {
      setCurrentStep(2);
    } else if (currentStep === 2 && validateStep2()) {
      setCurrentStep(3);
    }
  };

  const handleBack = () => {
    setFeedback(null);
    setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    if (!isConnected || !address) {
      setFeedback("Please connect your wallet first.");
      return;
    }

    if (!validateStep1() || !validateStep2() || !validateStep3()) {
      return;
    }

    try {
      setLoading(true);
      setFeedback(null);

      // Build identity data object
      const identityData: any = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        dob: dateOfBirth,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        address: {
          line1: address1.trim(),
          line2: address2.trim() || undefined,
          city: city.trim(),
          state: state.trim() || undefined,
          zip: zipCode.trim() || undefined,
          country: country.trim(),
        },
        identification: {
          type: idType,
          number: idNumber.trim(),
        },
      };

      // Attach files as base64 if any
      if (selectedFiles && selectedFiles.length > 0) {
        const maxBytes = 5 * 1024 * 1024; // 5MB per file
        const filePromises = Array.from(selectedFiles).map((f) => {
          if (f.size > maxBytes) throw new Error(`File ${f.name} exceeds 5MB limit`);
          return new Promise<any>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              const base64 = result.split(",")[1] || "";
              resolve({ filename: f.name, type: f.type, content_base64: base64 });
            };
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(f);
          });
        });

        const filesArr = await Promise.all(filePromises);
        identityData.files = filesArr;
      }

      const messagePayload = JSON.stringify({
        action: "KYC_REGISTRATION",
        wallet_address: address?.toLowerCase(),
        timestamp: Math.floor(Date.now() / 1000),
      });

      const signature = await signMessageAsync({ message: messagePayload });

      const res = await fetch("/api/onboarding/kyc/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: address,
          identity_data: identityData,
          message: messagePayload,
          signature,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Registration failed");
      
      setFeedback(`✅ Success! KYC Status: ${json.status || "submitted"}. ${json.message || ""}`);
      
      // Reset form on success
      if (json.success) {
        setTimeout(() => {
          window.location.href = "/account/competency-test";
        }, 2000);
      }
    } catch (err: any) {
      setFeedback(`❌ Error: ${err?.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h1 className={styles.title}>🔐 KYC Registration</h1>
          <p className={styles.subtitle}>Please connect your wallet to begin the KYC process</p>
          <div className={styles.connectPrompt}>
            <p>👆 Click "Connect Wallet" in the header to get started</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>🔐 KYC Registration</h1>
        <p className={styles.subtitle}>Complete your identity verification</p>

        {/* Progress Indicator */}
        <div className={styles.progressBar}>
          <div className={`${styles.step} ${currentStep >= 1 ? styles.active : ""}`}>
            <div className={styles.stepNumber}>1</div>
            <div className={styles.stepLabel}>Personal Info</div>
          </div>
          <div className={`${styles.stepLine} ${currentStep >= 2 ? styles.active : ""}`} />
          <div className={`${styles.step} ${currentStep >= 2 ? styles.active : ""}`}>
            <div className={styles.stepNumber}>2</div>
            <div className={styles.stepLabel}>Address</div>
          </div>
          <div className={`${styles.stepLine} ${currentStep >= 3 ? styles.active : ""}`} />
          <div className={`${styles.step} ${currentStep >= 3 ? styles.active : ""}`}>
            <div className={styles.stepNumber}>3</div>
            <div className={styles.stepLabel}>Identification</div>
          </div>
        </div>

        {/* Step 1: Personal Information */}
        {currentStep === 1 && (
          <div className={styles.formSection}>
            <h2 className={styles.sectionTitle}>Personal Information</h2>
            
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  First Name <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={styles.input}
                  placeholder="John"
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Last Name <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={styles.input}
                  placeholder="Doe"
                  required
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>
                Date of Birth <span className={styles.required}>*</span>
              </label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className={styles.input}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Email (Optional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.input}
                placeholder="john.doe@example.com"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Phone (Optional)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={styles.input}
                placeholder="+1 (555) 123-4567"
              />
            </div>
          </div>
        )}

        {/* Step 2: Address */}
        {currentStep === 2 && (
          <div className={styles.formSection}>
            <h2 className={styles.sectionTitle}>Address Information</h2>

            <div className={styles.formGroup}>
              <label className={styles.label}>
                Address Line 1 <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                value={address1}
                onChange={(e) => setAddress1(e.target.value)}
                className={styles.input}
                placeholder="123 Main Street"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Address Line 2 (Optional)</label>
              <input
                type="text"
                value={address2}
                onChange={(e) => setAddress2(e.target.value)}
                className={styles.input}
                placeholder="Apt 4B"
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  City <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={styles.input}
                  placeholder="New York"
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>State/Province (Optional)</label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className={styles.input}
                  placeholder="NY"
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>ZIP/Postal Code (Optional)</label>
                <input
                  type="text"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value)}
                  className={styles.input}
                  placeholder="10001"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Country <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={styles.input}
                  placeholder="United States"
                  required
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Identification */}
        {currentStep === 3 && (
          <div className={styles.formSection}>
            <h2 className={styles.sectionTitle}>Identification</h2>

            <div className={styles.formGroup}>
              <label className={styles.label}>
                ID Type <span className={styles.required}>*</span>
              </label>
              <select
                value={idType}
                onChange={(e) => setIdType(e.target.value)}
                className={styles.select}
                required
              >
                <option value="passport">Passport</option>
                <option value="drivers_license">Driver's License</option>
                <option value="national_id">National ID Card</option>
                <option value="other">Other Government ID</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>
                ID Number <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                className={styles.input}
                placeholder="Enter your ID number"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Upload ID Documents (Optional, max 5MB each)</label>
              <input
                type="file"
                multiple
                accept="image/*,.pdf"
                onChange={(e) => setSelectedFiles(e.target.files ? Array.from(e.target.files) : null)}
                className={styles.fileInput}
              />
              {selectedFiles && selectedFiles.length > 0 && (
                <div className={styles.fileList}>
                  {selectedFiles.map((f) => (
                    <div key={f.name} className={styles.fileItem}>
                      📄 {f.name} ({Math.round(f.size / 1024)} KB)
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.infoBox}>
              <p><strong>📋 What happens next:</strong></p>
              <ul>
                <li>Your data will be encrypted and securely stored</li>
                <li>Duplicate identities are flagged for admin review</li>
                <li>Once verified, you can proceed to the competency test</li>
              </ul>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className={styles.buttonGroup}>
          {currentStep > 1 && (
            <button onClick={handleBack} className={styles.backButton} disabled={loading}>
              ← Back
            </button>
          )}
          
          {currentStep < 3 ? (
            <button onClick={handleNext} className={styles.nextButton}>
              Next →
            </button>
          ) : (
            <button onClick={handleSubmit} className={styles.submitButton} disabled={loading}>
              {loading ? "Submitting..." : "Submit KYC"}
            </button>
          )}
        </div>

        {/* Feedback */}
        {feedback && (
          <div className={feedback.includes("✅") ? styles.successMessage : styles.errorMessage}>
            {feedback}
          </div>
        )}

        {/* Wallet Info */}
        <div className={styles.walletInfo}>
          Connected wallet: <code>{address}</code>
        </div>
      </div>
    </div>
  );
}
