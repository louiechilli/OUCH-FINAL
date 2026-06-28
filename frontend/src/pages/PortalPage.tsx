import { useCallback, useEffect, useRef, useState } from "react";

interface PortalBooking {
  id: number;
  status: string;
  starts_at: string;
  ends_at: string;
  client_first_name: string;
  client_last_name: string;
  service_name: string;
  artist_display_name: string;
  client_notes: string | null;
}

interface PortalMessage {
  id: number;
  sender_role: "artist" | "client";
  sender_name: string | null;
  body: string | null;
  media_url: string | null;
  created_at: string;
}

interface PortalPageProps {
  token: string;
}

const PORTAL_VIEWPORT = "width=device-width, initial-scale=1";
const EPOS_VIEWPORT =
  "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function PortalPage({ token }: PortalPageProps) {
  const apiBase = `/api/portal/${encodeURIComponent(token)}`;
  const [booking, setBooking] = useState<PortalBooking | null>(null);
  const [messages, setMessages] = useState<PortalMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [pendingMedia, setPendingMedia] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("portal-route");
    document.title = "Your booking — Ouch Tattoo Studio";

    const viewport = document.querySelector('meta[name="viewport"]');
    const previousViewport = viewport?.getAttribute("content") ?? EPOS_VIEWPORT;
    viewport?.setAttribute("content", PORTAL_VIEWPORT);

    return () => {
      document.documentElement.classList.remove("portal-route");
      document.title = "Ouch Tattoo Studio EPOS";
      viewport?.setAttribute("content", previousViewport);
    };
  }, []);

  const loadBooking = useCallback(async () => {
    const res = await fetch(`${apiBase}/booking`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "This portal link is invalid or has expired");
    }
    setBooking(await res.json());
  }, [apiBase]);

  const loadMessages = useCallback(async () => {
    const res = await fetch(`${apiBase}/messages`);
    if (!res.ok) return;
    setMessages(await res.json());
  }, [apiBase]);

  useEffect(() => {
    void loadBooking().catch((err) => setError((err as Error).message));
  }, [loadBooking]);

  useEffect(() => {
    if (error && !booking) return;
    void loadMessages();
    const interval = setInterval(() => void loadMessages(), 10_000);
    return () => clearInterval(interval);
  }, [error, booking, loadMessages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleAttach = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPendingMedia(await fileToDataUrl(file));
    event.target.value = "";
  };

  const sendMessage = async () => {
    if (!messageText.trim() && !pendingMedia) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: messageText.trim() || null,
          mediaUrl: pendingMedia,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not send message");
      }
      setMessageText("");
      setPendingMedia(null);
      await loadMessages();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (error && !booking) {
    return (
      <div className="portal-page portal-page--error">
        <div className="portal-page__shell portal-page__shell--narrow">
          <div className="portal-page__card">
            <p className="portal-page__brand">Ouch Tattoo Studio</p>
            <h1>Booking portal</h1>
            <p className="wizard-error">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const when = booking
    ? new Date(booking.starts_at).toLocaleString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const clientName = booking
    ? `${booking.client_first_name} ${booking.client_last_name}`.trim()
    : "";

  return (
    <div className="portal-page">
      <header className="portal-page__topbar">
        <div className="portal-page__shell portal-page__shell--wide">
          <p className="portal-page__brand">Ouch Tattoo Studio</p>
        </div>
      </header>

      <main className="portal-page__shell portal-page__shell--wide">
        <div className="portal-page__layout">
          <aside className="portal-page__details">
            <p className="portal-page__eyebrow">Your booking</p>
            <h1>{booking?.service_name ?? "Loading…"}</h1>

            {booking && (
              <>
                <dl className="portal-page__meta">
                  <div>
                    <dt>Artist</dt>
                    <dd>{booking.artist_display_name}</dd>
                  </div>
                  <div>
                    <dt>When</dt>
                    <dd>{when}</dd>
                  </div>
                  <div>
                    <dt>Booked for</dt>
                    <dd>{clientName}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd className="portal-page__status">{booking.status}</dd>
                  </div>
                </dl>

                {booking.client_notes ? (
                  <div className="portal-page__notes">
                    <h2>Your notes</h2>
                    <p>{booking.client_notes}</p>
                  </div>
                ) : null}

                <p className="portal-page__intro">
                  Share reference photos, ask questions, and chat with your artist. You'll receive
                  a text message when they reply.
                </p>
              </>
            )}
          </aside>

          <section className="portal-page__conversation" aria-label="Messages">
            <div className="portal-page__conversation-header">
              <h2>Messages</h2>
              <p>Upload reference images and keep everything in one thread.</p>
            </div>

            <div className="portal-page__chat-panel">
              <div className="booking-chat portal-chat">
                {messages === null ? (
                  <p className="wizard-loading">Loading conversation…</p>
                ) : messages.length === 0 ? (
                  <p className="wizard-empty">
                    No messages yet — say hello or upload a reference photo.
                  </p>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`booking-chat__message booking-chat__message--${msg.sender_role === "client" ? "mine" : "theirs"}`}
                    >
                      <div className="booking-chat__bubble">
                        <span className="booking-chat__sender">
                          {msg.sender_role === "client"
                            ? "You"
                            : msg.sender_name ?? booking?.artist_display_name ?? "Artist"}
                        </span>
                        {msg.body && <p>{msg.body}</p>}
                        {msg.media_url && <img src={msg.media_url} alt="Attachment" />}
                        <span className="booking-chat__time">
                          {new Date(msg.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              {pendingMedia && (
                <div className="booking-chat__preview">
                  <img src={pendingMedia} alt="Attachment preview" />
                  <button type="button" onClick={() => setPendingMedia(null)}>
                    Remove
                  </button>
                </div>
              )}

              {error && booking ? <p className="wizard-error">{error}</p> : null}

              <div className="booking-chat__composer portal-chat__composer">
                <button
                  type="button"
                  className="portal-chat__attach"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Add photo
                </button>
                <input
                  type="text"
                  placeholder="Write a message…"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => void handleAttach(e)}
                />
                <button
                  type="button"
                  className="portal-chat__send"
                  onClick={() => void sendMessage()}
                  disabled={sending || (!messageText.trim() && !pendingMedia)}
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default PortalPage;

function getPortalTokenFromPath(): string | null {
  const match = window.location.pathname.match(/^\/portal\/([^/]+)/);
  return match?.[1] ?? null;
}

export { getPortalTokenFromPath };
