// The Ledger XRP signer documents an UNCOMPRESSED public key (65 bytes, "04" + X + Y).
// XRPL needs the 33-byte compressed form for SigningPubKey of a secp256k1 account.
// Ed25519 keys ("ED" + 32 bytes, 66 hex chars) pass through unchanged.
export function toXrplPublicKey(publicKeyHex) {
  const k = String(publicKeyHex).trim().toUpperCase();
  if (/^ED[0-9A-F]{64}$/.test(k)) return k;
  if (/^(02|03)[0-9A-F]{64}$/.test(k)) return k;
  if (/^04[0-9A-F]{128}$/.test(k)) {
    const x = k.slice(2, 66);
    const lastYByte = parseInt(k.slice(128, 130), 16);
    return (lastYByte % 2 === 0 ? '02' : '03') + x;
  }
  throw new Error('Unrecognised public key format (expected 33-byte compressed or 65-byte uncompressed hex).');
}
