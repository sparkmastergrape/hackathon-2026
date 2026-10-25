/**
 * Pre-flight check 3: does the emulated device return the address we expect?
 *
 *   node get-address.cjs
 *
 * Proves the whole lower half of the stack in one run: DMK can reach Speculos,
 * the XRP app is loaded, and the signer kit speaks to it.
 */

const { connect, runAction, describeError, PATH_XRP, SPECULOS_URL } = require("./dmk.cjs");

(async () => {
  console.log(`speculos : ${SPECULOS_URL}`);
  const { signer } = await connect();
  console.log("session  : connected");

  const cfg = await runAction(signer.getAppConfig());
  console.log("app      : XRP", cfg.version ?? JSON.stringify(cfg));

  const addr = await runAction(signer.getAddress(PATH_XRP), {
    onPrompt: (p) => console.log(`  [device] waiting on human: ${p}`),
  });

  const pub = Buffer.from(addr.publicKey, "hex");
  console.log(`path     : ${PATH_XRP}`);
  console.log(`address  : ${addr.address}`);
  // app-xrp compresses to 33 bytes, but the APDU spec describes an uncompressed
  // 65-byte key and says callers should not assume either size. An uncompressed
  // key in SigningPubKey is invalid, so check the width before trusting it.
  console.log(`pubkey   : ${addr.publicKey} (${pub.length} bytes, ${pub.length === 33 ? "compressed - OK" : "UNCOMPRESSED - must fold to 33"})`);
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", describeError(e));
  process.exit(1);
});
