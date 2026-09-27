// Mic -> AudioWorklet (public/mic-processor.js) -> base64 PCM16, 24 kHz mono, 100 ms chunks.
export class Recorder {
  // Construct inside the Talk click handler so the browser lets the context run.
  // Browser default rate; the worklet resamples to 24 kHz.
  private ctx = new AudioContext();
  private stream: MediaStream | null = null;
  private stopped = false;
  private onChunk: (base64: string) => void;
  private onLevel: (rms: number) => void;

  constructor(onChunk: (base64: string) => void, onLevel: (rms: number) => void) {
    this.onChunk = onChunk;
    this.onLevel = onLevel;
  }

  async start() {
    await this.ctx.resume();
    const stream = await navigator.mediaDevices.getUserMedia({
      // Echo cancellation keeps the agent from hearing itself through the speakers.
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    if (this.stopped) {
      // Stop was pressed while the permission prompt was open: don't leave the mic on.
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    await this.ctx.audioWorklet.addModule("/mic-processor.js");
    const node = new AudioWorkletNode(this.ctx, "mic-processor");
    node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
      this.onChunk(toBase64(e.data.pcm));
      this.onLevel(e.data.level);
    };
    this.ctx.createMediaStreamSource(stream).connect(node);
    node.connect(this.ctx.destination); // outputs silence; being connected keeps it running in every browser
  }

  stop() {
    this.stopped = true;
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.ctx.state !== "closed") void this.ctx.close();
  }
}

// btoa needs a binary string. Build it in 8 KB slices, because spreading a huge array overflows the stack.
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(bin);
}
