// Compile contracts/*.sol with solc-js. No framework: one contract, one file,
// and a build step a judge can read in thirty seconds.
//
//   npm run compile        -> build/MandateRegistry.json  { abi, bytecode }
//
// Deliberately strict: any warning about the contract itself is printed, and
// any error fails the build.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const solc = require("solc");

const SRC_DIR = "contracts";
const OUT_DIR = "build";

const sources = {};
for (const file of readdirSync(SRC_DIR).filter((f) => f.endsWith(".sol"))) {
  sources[file] = { content: readFileSync(`${SRC_DIR}/${file}`, "utf8") };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    // A revocation check is read by a verifier on every payment, so the
    // getters matter more than deployment size.
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "metadata"] } },
  },
};

console.log(`solc ${solc.version()}`);
const out = JSON.parse(solc.compile(JSON.stringify(input)));

let failed = false;
for (const e of out.errors ?? []) {
  console.log(`${e.severity.toUpperCase()}: ${e.formattedMessage.trim()}`);
  if (e.severity === "error") failed = true;
}
if (failed) process.exit(1);

mkdirSync(OUT_DIR, { recursive: true });
for (const [file, contracts] of Object.entries(out.contracts ?? {})) {
  for (const [name, c] of Object.entries(contracts)) {
    const path = `${OUT_DIR}/${name}.json`;
    writeFileSync(
      path,
      JSON.stringify(
        {
          contract: name,
          source: `${SRC_DIR}/${file}`,
          compiler: solc.version(),
          abi: c.abi,
          bytecode: `0x${c.evm.bytecode.object}`,
        },
        null,
        2,
      ) + "\n",
    );
    const size = c.evm.bytecode.object.length / 2;
    console.log(`${name}: ${size} bytes -> ${path}`);
  }
}
