import { useCallback, useEffect, useRef, useState } from "react";
import { Player } from "../audio/player";
import { Recorder } from "../audio/recorder";

const WS_URL = import.meta.env.VITE_BACKEND_WS_URL ?? "ws://localhost:8000/ws/voice";

export type Status = "idle" | "connecting" | "listening" | "speaking" | "ended" | "error";
export type Line = { who: "You" | "Fifteen"; text: string; cutOff?: boolean };
export type Activity =
  | { kind: "tool"; id: string; name: string; result?: unknown; skipped?: boolean }
  | { kind: "error"; message: string; detail?: string };

// The fields we read from relay events. Everything else is ignored.
type ServerEvent = {
  type: string;
  data?: string; // reply.audio
  text?: string; // transcripts
  interrupted?: boolean; // transcript.agent
  status?: string; // reply.done
  call_id?: string; // tool.call, tool.result.sent
  name?: string;
  result?: unknown; // tool.result.sent
  code?: string; // errors
  message?: string;
};

type Session = {
  ws: WebSocket;
  recorder: Recorder;
  player: Player;
  opened: boolean; // the backend socket connected at least once
  ending: boolean; // Stop pressed or a fatal error; ignore further events
  failed: boolean; // ended by an error that should stay on screen
};

const addError = (message: string, detail?: string) => (a: Activity[]): Activity[] => [
  ...a,
  { kind: "error", message, detail },
];

export function useVoiceSession() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [partial, setPartial] = useState(""); // live user words, replaced by the final line
  const [activity, setActivity] = useState<Activity[]>([]);
  const current = useRef<Session | null>(null);

  // Ends the live session. The relay answers session.end by closing the socket; ws.onclose tidies up.
  const end = useCallback((why?: string) => {
    const s = current.current;
    if (!s || s.ending) return;
    s.ending = true;
    if (why) {
      s.failed = true;
      setError(why);
      setStatus("error");
      setActivity(addError(why));
    }
    s.recorder.stop();
    s.player.flush();
    if (s.ws.readyState === WebSocket.OPEN) s.ws.send(JSON.stringify({ type: "session.end" }));
    else s.ws.close();
  }, []);

  const start = useCallback(async () => {
    if (current.current) return;
    setError(null);
    setStatus("connecting");
    setLines([]);
    setPartial("");
    setActivity([]);

    const ws = new WebSocket(WS_URL);
    // Both AudioContexts are created here, inside the click, so autoplay rules let them run.
    const player = new Player();
    const recorder = new Recorder((audio) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input.audio", audio }));
    }, setLevel);
    const s: Session = { ws, recorder, player, opened: false, ending: false, failed: false };
    current.current = s;

    ws.onopen = () => {
      s.opened = true;
    };
    ws.onmessage = (msg) => {
      if (s.ending) return;
      const e: ServerEvent = JSON.parse(msg.data);
      const { text, call_id } = e;
      switch (e.type) {
        case "session.ready":
          setStatus("listening");
          break;
        case "reply.started":
          setStatus("speaking");
          break;
        case "reply.audio":
          player.enqueue(e.data ?? "");
          break;
        case "reply.done":
          setStatus("listening");
          // The relay drops tool calls from an interrupted reply without running them.
          if (e.status === "interrupted")
            setActivity((a) => a.map((x) => (x.kind === "tool" && x.result === undefined ? { ...x, skipped: true } : x)));
          break;
        case "input.speech.started":
          player.flush(); // barge-in: the agent goes quiet the moment the user talks
          break;
        case "transcript.user.delta":
          setPartial(text ?? "");
          break;
        case "transcript.user":
          setPartial("");
          if (text) setLines((l) => [...l, { who: "You", text }]);
          break;
        case "transcript.agent":
          if (text) setLines((l) => [...l, { who: "Fifteen", text, cutOff: e.interrupted }]);
          break;
        case "tool.call":
          setActivity((a) => [...a, { kind: "tool", id: call_id ?? "", name: e.name ?? "" }]);
          break;
        case "tool.result.sent":
          setActivity((a) => a.map((x) => (x.kind === "tool" && x.id === call_id ? { ...x, result: e.result } : x)));
          break;
        case "relay.error":
          end(e.message ?? "The voice service failed. Try again.");
          break;
        case "session.error":
        case "error":
          setActivity(addError(e.message ?? "The voice service reported an error.", e.code));
          break;
      }
    };
    ws.onclose = () => {
      recorder.stop();
      player.close();
      setLevel(0);
      setPartial("");
      current.current = null;
      if (s.failed) return; // keep the error on screen
      if (!s.opened && !s.ending) {
        const why = "Can't reach the Fifteen server. Start the backend, then try again.";
        setError(why);
        setStatus("error");
        setActivity(addError(why));
      } else {
        setStatus("ended");
      }
    };

    try {
      await Promise.all([player.resume(), recorder.start()]);
    } catch (err) {
      const blocked = err instanceof DOMException && err.name === "NotAllowedError";
      end(
        blocked
          ? "Microphone blocked. Allow microphone access for this site, then press Start talking."
          : `Couldn't start the microphone (${String(err)}). Check your mic, then press Start talking.`,
      );
    }
  }, [end]);

  const stop = useCallback(() => end(), [end]);

  useEffect(() => stop, [stop]); // end the session if the component unmounts

  // The sticker shows the last thing the merchant said. n changes per utterance, so it can re-stamp.
  const heardAt = lines.findLastIndex((l) => l.who === "You");
  const heard = heardAt < 0 ? null : { n: heardAt, text: lines[heardAt].text };

  return { status, error, level, lines, partial, heard, activity, start, stop };
}
