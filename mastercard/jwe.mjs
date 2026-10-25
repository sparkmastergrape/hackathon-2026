// JWE payload encryption for the Mastercard APIs that require it.
//
// Consent Management marks create-consents, start-authentication and
// verify-authentication with `x-mastercard-api-encrypted: true`: the whole
// request body is JWE-encrypted into a single `jweEncryptedData` field, and
// responses come back the same way. The docs call this root-to-root
// encryption, written as "$" -> "$".
//
// Certificates come from the Developer Dashboard, under "Client Encryption
// Keys" (the request encryption certificate) and "Mastercard Encryption Keys"
// (your response decryption key).
//
// With no certificate configured, `maybeEncrypt` passes the body through
// untouched so a dry run can still show what would be sent.

import { JweEncryption } from 'mastercard-client-encryption';

/** Paths whose bodies Mastercard requires to be JWE-encrypted, by service. */
export const ENCRYPTED_CONSENT_PATHS = [
  '/consents',
  '/consents/{card_ref}/start-authentication',
  '/consents/{card_ref}/verify-authentication',
];

export function hasEncryptionConfigured() {
  return Boolean(process.env.MASTERCARD_ENCRYPTION_CERT_PATH);
}

/**
 * Builds a root-to-root JWE config for the given endpoint paths.
 *
 * `paths[].path` is matched by the library against the endpoint string passed
 * to encrypt(), so the patterns here use a regex-ish prefix rather than the
 * templated OpenAPI path.
 */
export function buildJweConfig({
  encryptionCertificate = process.env.MASTERCARD_ENCRYPTION_CERT_PATH,
  privateKey = process.env.MASTERCARD_DECRYPTION_KEY_PATH,
  encryptedValueFieldName = 'jweEncryptedData',
  paths = ['/consents'],
} = {}) {
  if (!encryptionCertificate) {
    throw new Error('Missing MASTERCARD_ENCRYPTION_CERT_PATH in the environment (see .env.example)');
  }
  return {
    mode: 'JWE',
    encryptedValueFieldName,
    encryptionCertificate,
    ...(privateKey ? { privateKey } : {}),
    paths: paths.map((path) => ({
      path,
      toEncrypt: [{ element: '$', obj: '$' }],
      toDecrypt: [{ element: '$', obj: '$' }],
    })),
  };
}

let cachedJwe;

function jweFor(config) {
  if (!cachedJwe) cachedJwe = new JweEncryption(buildJweConfig(config));
  return cachedJwe;
}

/** Only for tests — drops the memoized encrypter. */
export function resetJweCache() {
  cachedJwe = undefined;
}

/**
 * Encrypts `body` if an encryption certificate is configured, otherwise
 * returns it unchanged. Returns `{ body, encrypted }` so callers can report
 * honestly which one happened.
 */
export function maybeEncrypt(endpoint, body, config) {
  if (body === undefined || !hasEncryptionConfigured()) {
    return { body, encrypted: false };
  }
  const encrypted = jweFor(config).encrypt(endpoint, {}, body);
  return { body: encrypted.body ?? encrypted, encrypted: true };
}

/** Decrypts a JWE response body. Requires MASTERCARD_DECRYPTION_KEY_PATH. */
export function decrypt(payload, config) {
  if (!process.env.MASTERCARD_DECRYPTION_KEY_PATH) {
    throw new Error('Missing MASTERCARD_DECRYPTION_KEY_PATH in the environment (see .env.example)');
  }
  return jweFor(config).decrypt(payload);
}
