// AudioWorklet: mic Float32 at the context's rate -> PCM16 at 24 kHz mono.
// Posts { pcm: ArrayBuffer, level: RMS 0..1 } every 100 ms (2400 samples).
const TARGET_RATE = 24000;
const CHUNK = 2400;

class MicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / TARGET_RATE; // input samples per output sample (`sampleRate` is a worklet global)
    this.t = 0; // read position in the current block; -1 means the previous block's last sample
    this.prev = 0;
    this.out = new Int16Array(CHUNK);
    this.n = 0;
    this.sumSq = 0;
  }

  process(inputs) {
    const input = inputs[0][0];
    if (!input) return true;
    const at = (i) => (i < 0 ? this.prev : input[i]);
    // Linear interpolation between the two input samples around each output position.
    while (this.t < input.length - 1) {
      const i = Math.floor(this.t);
      const frac = this.t - i;
      this.push(at(i) + (at(i + 1) - at(i)) * frac);
      this.t += this.step;
    }
    this.t -= input.length;
    this.prev = input[input.length - 1];
    return true;
  }

  push(v) {
    const s = Math.max(-1, Math.min(1, v));
    this.out[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    this.sumSq += s * s;
    if (this.n === CHUNK) {
      const level = Math.sqrt(this.sumSq / CHUNK);
      this.port.postMessage({ pcm: this.out.buffer, level }, [this.out.buffer]);
      this.out = new Int16Array(CHUNK);
      this.n = 0;
      this.sumSq = 0;
    }
  }
}

registerProcessor("mic-processor", MicProcessor);
