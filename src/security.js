import CryptoJS from 'crypto-js';

// In a real production app, this should be in an environment variable (e.g., import.meta.env.VITE_ENCRYPTION_KEY)
// For this MVP, we use a hardcoded key. 
const SECRET_KEY = 'my-secret-activity-tracker-key-2025';

/**
 * Encrypts a string or object.
 * @param {string|object} data - The data to encrypt.
 * @returns {string} The encrypted ciphertext.
 */
export const encryptData = (data) => {
    if (!data) return data;
    try {
        const textToEncrypt = typeof data === 'object' ? JSON.stringify(data) : String(data);
        return CryptoJS.AES.encrypt(textToEncrypt, SECRET_KEY).toString();
    } catch (error) {
        console.error('Encryption failed:', error);
        return data;
    }
};

/**
 * Decrypts a ciphertext.
 * Returns the original text if decryption fails (backward compatibility).
 * @param {string} ciphertext - The encrypted string.
 * @returns {string|object} The decrypted data (parsed as JSON if possible).
 */
export const decryptData = (ciphertext) => {
    if (!ciphertext) return ciphertext;
    if (typeof ciphertext !== 'string') return ciphertext; // Already decrypted or object

    try {
        const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
        const originalText = bytes.toString(CryptoJS.enc.Utf8);

        if (!originalText) {
            // If result is empty, it might not have been encrypted with this key or at all.
            // Return original to be safe (backward compatibility).
            return ciphertext;
        }

        // Try to parse as JSON (in case we encrypted an object)
        try {
            return JSON.parse(originalText);
        } catch {
            return originalText;
        }
    } catch (error) {
        // If decryption throws (e.g. malformed ciphertext), return original
        return ciphertext;
    }
};
