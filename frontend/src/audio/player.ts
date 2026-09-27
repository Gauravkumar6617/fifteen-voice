// Plays 24 kHz PCM16 chunks back to back with no gaps. flush() is barge-in: silence now, drop the queue.
export class Player {
  // Construct inside the Talk click handler so the browser allows sound.
  private ctx = new AudioContext({ sampleRate: 24000 });
  private nextStart = 0;
  private sources = new Set<AudioBufferSourceNode>();

  resume() {
    return this.ctx.resume();
  }

  enqueue(base64: string) {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1); // little-endian, like every browser platform
    if (!pcm.length) return;
    const buffer = this.ctx.createBuffer(1, pcm.length, 24000);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) samples[i] = pcm[i] / 32768;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.ctx.destination);
    // Start where the previous chunk ends, or now if the queue ran dry.
    const at = Math.max(this.ctx.currentTime, this.nextStart);
    src.start(at);
    this.nextStart = at + buffer.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  flush() {
    for (const src of this.sources) src.stop();
    this.sources.clear();
    this.nextStart = 0;
  }

  close() {
    this.flush();
    if (this.ctx.state !== "closed") void this.ctx.close();
  }
}
