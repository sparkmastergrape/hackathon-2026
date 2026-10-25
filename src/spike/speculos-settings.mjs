// Walks the Speculos Ethereum app menu and prints every screen, so we can see
// the real setting labels instead of guessing them.
const SPECULOS = process.env.SPECULOS_URL ?? "http://localhost:5010";
const screen = async () => {
  const r = await fetch(`${SPECULOS}/events?currentscreenonly=true`);
  return ((await r.json()).events ?? []).map((e) => e.text).join(" | ");
};
const press = async (k) => {
  await fetch(`${SPECULOS}/button/${k}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "press-and-release" }),
  });
  await new Promise((r) => setTimeout(r, 200));
};
const seq = process.argv[2] ? process.argv[2].split(",") : [];
console.log(`start: ${await screen()}`);
for (const [i, k] of seq.entries()) {
  await press(k.trim());
  console.log(`${String(i + 1).padStart(2, "0")} ${k.trim().padEnd(5)} -> ${await screen()}`);
}
