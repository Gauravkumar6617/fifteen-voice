// Checks the mic worklet's resampler and PCM16 output without a browser.
// Run from frontend/:  node scripts/mic-processor.check.mjs
import assert from "node:assert/strict";

const posted = [];
let Processor;
globalThis.AudioWorkletProcessor = class {
  port = { postMessage: (msg) => posted.push(msg) };
};
globalThis.registerProcessor = (_name, cls) => (Processor = cls);
globalThis.sampleRate = 48000;
await import("../public/mic-processor.js");

const tone = (n, rate) => 0.5 * Math.sin((2 * Math.PI * 440 * n) / rate);

for (const rate of [48000, 44100]) {
  posted.length = 0;
  globalThis.sampleRate = rate; // read in the constructor
  const p = new Processor();
  for (let start = 0; start < rate; start += 128) {
    // one second of a 440 Hz tone, in 128-sample render blocks like a real AudioWorklet
    p.process([[Float32Array.from({ length: 128 }, (_, i) => tone(start + i, rate))]]);
  }
  assert.ok(posted.length >= 9, `${rate}: ${posted.length} chunks`); // ~24000 samples = ~10 chunks of 2400
  if (rate === 48000) assert.equal(posted.length, 10);
  const out = posted.flatMap((m) => Array.from(new Int16Array(m.pcm)));
  out.forEach((v, n) => assert.ok(Math.abs(v / 32767 - tone(n, 24000)) < 0.01, `${rate}: sample ${n}`));
  assert.ok(Math.abs(posted[0].level - 0.5 / Math.SQRT2) < 0.01, `${rate}: level ${posted[0].level}`);
}
console.log("mic-processor OK");
