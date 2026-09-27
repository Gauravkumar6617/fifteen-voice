import { useVoiceSession, type Activity, type Status } from "./hooks/useVoiceSession";

// ponytail: same hardcoded store as backend/app/tools/store_status.py; read it from the store in Phase 2.
const STORE_NAME = "Demo Umbrella Co.";

const STATUS_TEXT: Record<Status, string> = {
  idle: "",
  connecting: "Connecting…",
  listening: "Listening",
  speaking: "Fifteen is speaking",
  ended: "Session ended",
  error: "",
};

// What each tool did, in plain words. An unknown tool shows its name.
const TOOL_WORDS: Record<string, string> = {
  get_store_status: "Checked store status",
};

// {product_count: 200} -> "product count: 200"
function describe(result: unknown): string {
  if (!result || typeof result !== "object") return String(result);
  return Object.entries(result)
    .map(([k, v]) => `${k.replaceAll("_", " ")}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join(", ");
}

function ActivityItem({ item }: { item: Activity }) {
  if (item.kind === "error")
    return (
      <li className="loss">
        {item.message}
        {item.detail && <span className="detail">{item.detail}</span>}
      </li>
    );
  const outcome = item.skipped
    ? "not run, you spoke over it"
    : item.result === undefined
      ? "running…"
      : describe(item.result);
  return (
    <li>
      {TOOL_WORDS[item.name] ?? item.name}
      <span className="detail">
        {item.name} · {outcome}
      </span>
    </li>
  );
}

export default function App() {
  const { status, error, level, lines, partial, heard, activity, start, stop } = useVoiceSession();
  const live = status === "connecting" || status === "listening" || status === "speaking";
  const statusText = status === "error" ? error : STATUS_TEXT[status];

  return (
    <div className="app">
      <header>
        <span className="wordmark">Fifteen</span>
        <span className="store">{STORE_NAME}</span>
        <p className="status" role="status" data-status={status}>
          {statusText && (
            <>
              <span className="dot" aria-hidden="true" />
              {statusText}
            </>
          )}
        </p>
      </header>

      <main>
        <section className="stage" aria-label="Talk to Fifteen">
          {/* A new key per utterance remounts the sticker, which replays the stamp. */}
          <div key={heard?.n ?? -1} className={heard ? "sticker stamp" : "sticker"}>
            {heard && <p className="heard">We heard</p>}
            <p className="said">{heard ? `“${heard.text}”` : "Say the sale you want to run."}</p>
          </div>
          <button className="talk" aria-pressed={live} onClick={live ? stop : start}>
            {live ? "Stop" : "Start talking"}
          </button>
          <div className="level" aria-hidden="true">
            <div style={{ width: `${Math.min(1, level * 6) * 100}%` }} />
          </div>
        </section>

        <aside>
          <section aria-labelledby="conversation">
            <h2 id="conversation">Conversation</h2>
            <div className="scroll">
              <div>
                <ol aria-live="polite">
                  {lines.map((l, i) => (
                    <li key={i} className="row">
                      <span className="who">{l.who}</span>
                      <span>
                        {l.text}
                        {l.cutOff && <span className="muted"> (cut off)</span>}
                      </span>
                    </li>
                  ))}
                </ol>
                {/* Outside the live region, so screen readers hear each line once, not every partial. */}
                {partial && (
                  <p className="row muted">
                    <span className="who">You</span>
                    <span>{partial}</span>
                  </p>
                )}
                {!lines.length && !partial && <p className="muted">Nothing said yet.</p>}
              </div>
            </div>
          </section>

          <section aria-labelledby="activity">
            <h2 id="activity">Activity</h2>
            <div className="scroll">
              <div>
                <ol className="activity">
                  {activity.map((a, i) => (
                    <ActivityItem key={i} item={a} />
                  ))}
                </ol>
                {!activity.length && <p className="muted">Store checks and errors show up here.</p>}
              </div>
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}
