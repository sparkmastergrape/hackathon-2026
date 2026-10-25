// OAuth 1.0a request signing for Mastercard APIs.
//
// Most Mastercard Developers APIs (Send/Move, Account Validation, BIN Lookup,
// Business Payment Controls, Currency Conversion, MDES, ...) authenticate with
// OAuth 1.0a: an RSA-SHA256 signature over the request, sent in the
// Authorization header. There is no token exchange and no refresh — every
// request is signed on its own.
//
// Credentials come from the project you create at
// https://developer.mastercard.com/dashboard:
//   MASTERCARD_CONSUMER_KEY  — shown on the project page
//   MASTERCARD_P12_PATH      — the .p12 keystore you downloaded
//   MASTERCARD_P12_PASSWORD  — keystore password (usually "keystorepassword")
//   MASTERCARD_KEY_ALIAS     — key alias (usually "keyalias")
//
// Sandbox base URL is https://sandbox.api.mastercard.com — sandbox credentials
// only work against sandbox hosts, production credentials only against
// production ones.

import fs from 'node:fs';
import forge from 'node-forge';
import oauth from 'mastercard-oauth1-signer';

export const SANDBOX_BASE_URL = 'https://sandbox.api.mastercard.com';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in the environment (see .env.example)`);
  return value;
}

/** Extracts the PEM private key from the .p12 keystore Mastercard hands out. */
export function loadSigningKey({
  p12Path = required('MASTERCARD_P12_PATH'),
  password = required('MASTERCARD_P12_PASSWORD'),
  alias = process.env.MASTERCARD_KEY_ALIAS || 'keyalias',
} = {}) {
  const p12Content = fs.readFileSync(p12Path, 'binary');
  const p12Asn1 = forge.asn1.fromDer(p12Content, false);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
  const bags = p12.getBags({ friendlyName: alias, bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyObj = bags.friendlyName?.[0];
  if (!keyObj) {
    throw new Error(`No key with alias "${alias}" in ${p12Path}. Check MASTERCARD_KEY_ALIAS.`);
  }
  return forge.pki.privateKeyToPem(keyObj.key);
}

/**
 * fetch() for Mastercard APIs, with the OAuth 1.0a Authorization header added.
 *
 *   const res = await mastercardFetch('/bin-lookup/v1/lookups', { method: 'POST', body: {...} });
 *
 * `path` may be a full URL or a path relative to `baseUrl`. A plain-object
 * `body` is JSON-encoded. Signing covers the exact body bytes sent, so the
 * payload is serialized once and reused.
 */
export async function mastercardFetch(path, { method = 'GET', body, headers = {}, baseUrl = SANDBOX_BASE_URL, signingKey, consumerKey } = {}) {
  const url = path.startsWith('http') ? path : new URL(path, baseUrl).toString();
  const key = signingKey ?? loadSigningKey();
  const consumer = consumerKey ?? required('MASTERCARD_CONSUMER_KEY');

  const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
  const authHeader = oauth.getAuthorizationHeader(url, method, payload, consumer, key);

  return fetch(url, {
    method,
    body: payload,
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
  });
}
