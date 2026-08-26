import { useCallback, useEffect, useRef, useState } from "react";
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { io } from "socket.io-client";
import { toast } from "sonner";
import {
  FiBell,
  FiBriefcase,
  FiCreditCard,
  FiDollarSign,
  FiHome,
  FiLogOut,
  FiMapPin,
  FiNavigation,
  FiPhone,
  FiPlus,
  FiUser,
  FiX,
  FiCopy,
  FiWifi,
  FiWifiOff,
  FiRefreshCw,
  FiCheck,
  FiSend,
  FiClock,
  FiCalendar,
  FiInfo,
  FiTool,
  FiTrendingUp,
  FiActivity,
  FiStar,
  FiCheckCircle,
  FiAlertCircle,
  FiUploadCloud,
  FiImage,
  FiMenu,
  FiVolume2,
  FiVolumeX,
} from "react-icons/fi";
import * as client from "./api";
import { clearRequestIfMatching } from "./requestState";
import { getAlertPattern } from "./alertSounds";
const tokenKey = "localpintu-technician-token";
const technicianKey = "localpintu-technician";
const alertSettingsKey = "localpintu-technician-alert-settings";
const defaultAlertSettings = { muted: false, language: "en-IN", sound: "classic-bell" };
const money = (v) => `\u20B9${Number(v || 0).toLocaleString("en-IN")}`;
const MAX_JOB_PHOTOS = 8;
const MAX_JOB_PHOTO_DATA_LENGTH = 12 * 1024 * 1024;
const readJobPhotos = async (files) => {
  const selected = [...(files || [])];
  if (!selected.length) return [];
  if (selected.length > MAX_JOB_PHOTOS)
    throw new Error(`You can upload up to ${MAX_JOB_PHOTOS} photos at a time.`);
  if (selected.some((file) => !file.type.startsWith("image/")))
    throw new Error("Only image files can be uploaded.");
  const values = await Promise.all(
    selected.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () =>
            reject(
              new Error(`Unable to read ${file.name || "the selected image"}.`),
            );
          reader.readAsDataURL(file);
        }),
    ),
  );
  if (
    values.reduce((total, value) => total + value.length, 0) >
    MAX_JOB_PHOTO_DATA_LENGTH
  )
    throw new Error(
      "The selected photos are too large. Please choose fewer or smaller images.",
    );
  return values;
};
const PhotoPreviews = ({ photos, label, onRemove }) =>
  photos?.length ? (
    <div className="photo-preview-grid" aria-label={`${label} previews`}>
      {photos.map((photo, index) => (
        <figure className="photo-preview" key={`${label}-${index}`}>
          <img src={photo} alt={`${label} ${index + 1}`} />
          <figcaption>{index + 1}</figcaption>
          {onRemove && (
            <button
              type="button"
              className="photo-remove"
              onClick={() => onRemove(index)}
              aria-label={`Remove ${label} ${index + 1}`}
            >
              <FiX />
            </button>
          )}
        </figure>
      ))}
    </div>
  ) : (
    <div className="photo-empty">
      <FiImage />
      <span>No images yet</span>
    </div>
  );

const StatusBadge = ({ status }) => (
  <span className="status-pill" data-status={status}>
    {status === "Waiting For OTP Verification" ? "Waiting For OTP" : status}
  </span>
);
const PanelSkeleton = ({ cards = 4 }) => (
  <section className="skeleton-grid" aria-label="Loading">
    <span className="sr-only">Loading</span>
    {Array.from({ length: cards }).map((_, index) => (
      <div className="skeleton-card" key={index}>
        <i />
        <b />
        <b />
      </div>
    ))}
  </section>
);
const EmptyState = ({ icon: Icon = FiBriefcase, title, text }) => (
  <div className="empty-state">
    <span className="empty-state-icon">
      <Icon />
    </span>
    <strong>{title}</strong>
    <p>{text}</p>
  </div>
);
const persist = (data, setSession) => {
  localStorage.setItem(technicianKey, JSON.stringify(data));
  setSession((s) => ({ ...s, technician: data }));
};

const MAX_RECONNECT_ATTEMPTS = 10;

function App() {
  const [session, setSession] = useState(() => ({
    token: localStorage.getItem(tokenKey),
    technician: JSON.parse(localStorage.getItem(technicianKey) || "null"),
  }));
  const login = (data) => {
    localStorage.setItem(tokenKey, data.token);
    persist(data.technician, setSession);
    setSession({ token: data.token, technician: data.technician });
  };
  const clear = useCallback(() => {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(technicianKey);
    setSession({ token: null, technician: null });
  }, []);
  useEffect(() => {
    window.addEventListener("localpintu:technician-session-expired", clear);
    if (!session.token) return () => window.removeEventListener("localpintu:technician-session-expired", clear);
    let expiresAt = 0;
    try { expiresAt = Number(JSON.parse(atob(session.token.split(".")[1])).exp) * 1000; } catch { expiresAt = 0; }
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) clear();
    const timer = remaining > 0 ? window.setTimeout(clear, Math.min(remaining, 2147483647)) : null;
    return () => { window.removeEventListener("localpintu:technician-session-expired", clear); if (timer) window.clearTimeout(timer); };
  }, [clear, session.token]);
  return (
    <Routes>
      <Route
        path="/login"
        element={
          session.token ? (
            <Navigate to="/" replace />
          ) : (
            <Login onLogin={login} />
          )
        }
      />
      <Route path="/forgot-password" element={<Forgot />} />
      <Route path="/reset-password/:token" element={<Reset />} />
      <Route
        path="/*"
        element={
          session.token ? (
            <Shell session={session} setSession={setSession} logout={clear} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}

function Login({ onLogin }) {
  const [form, setForm] = useState({ emailOrMobile: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await client.login(form);
      toast.success("Login successful");
      onLogin(result);
    } catch (x) {
      const message = x.message === "Invalid credentials"
        ? "Email/mobile number or password is incorrect."
        : x.message || "Unable to sign in. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <main className="login">
      <form onSubmit={submit}>
        <div className="brand">
          LOCAL<span>PINTU</span>
          <small>TECHNICIAN PORTAL</small>
        </div>
        <h1>Welcome back</h1>
        {error && <div className="error">{error}</div>}
        <label>
          Email or mobile
          <input
            required
            value={form.emailOrMobile}
            onChange={(e) =>
              setForm({ ...form, emailOrMobile: e.target.value })
            }
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <button disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
        <NavLink to="/forgot-password">Forgot password?</NavLink>
      </form>
    </main>
  );
}

function Forgot() {
  const [emailOrMobile, setValue] = useState("");
  const [message, setMessage] = useState("");
  return (
    <main className="login">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const result = await client.forgotPassword({ emailOrMobile });
          setMessage(
            result.resetToken
              ? `Development reset token: ${result.resetToken}`
              : result.message,
          );
        }}
      >
        <h1>Reset password</h1>
        <label>
          Email or mobile
          <input
            required
            value={emailOrMobile}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <button>Request reset</button>
        {message && <p>{message}</p>}
        <NavLink to="/login">Back to sign in</NavLink>
      </form>
    </main>
  );
}

function Reset() {
  const { token } = useParams();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  return (
    <main className="login">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const result = await client.resetPassword(token, password);
          setMessage(result.message);
        }}
      >
        <h1>Choose a password</h1>
        <label>
          New password
          <input
            required
            minLength="8"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button>Save password</button>
        {message && <p>{message}</p>}
      </form>
    </main>
  );
}

function Shell({ session, setSession, logout }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const nav = useNavigate();
  const [request, setRequest] = useState(null);
  const [responding, setResponding] = useState(false);
  const [notice, setNotice] = useState("");
  const [notifList, setNotifList] = useState([]);
  const [showNotif, setShowNotif] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [locationDenied, setLocationDenied] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locationRetry, setLocationRetry] = useState(0);
  // Connection state: null = connecting, true = connected, false = disconnected
  const [connected, setConnected] = useState(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [countdown, setCountdown] = useState(30);
  const countdownRef = useRef(null);
  const socketRef = useRef(null);
  const noticeTimerRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const lastLocationSentRef = useRef(null);
  const audioContextRef = useRef(null);
  const [alertSettings, setAlertSettings] = useState(() => {
    try { return { ...defaultAlertSettings, ...JSON.parse(localStorage.getItem(alertSettingsKey) || "{}") }; }
    catch { return defaultAlertSettings; }
  });
  const alertSettingsRef = useRef(alertSettings);
  useEffect(() => {
    alertSettingsRef.current = alertSettings;
    localStorage.setItem(alertSettingsKey, JSON.stringify(alertSettings));
  }, [alertSettings]);
  useEffect(() => {
    const assigned = session.technician?.alertPreferences;
    if (assigned) setAlertSettings((current) => ({ ...current, ...assigned }));
  }, [session.technician?.alertPreferences?.muted, session.technician?.alertPreferences?.sound, session.technician?.alertPreferences?.language]);

  const showNotice = useCallback((msg) => {
    setNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(""), 5000);
  }, []);

  const loadNotifs = useCallback(() => {
    client
      .notifications()
      .then((list) => {
        setNotifList(list);
        setUnreadCount(list.filter((n) => !n.readAt).length);
      })
      .catch(() => {});
  }, []);

  // Play notification sound
  const playNotificationSound = useCallback(() => {
    try {
      const settings = alertSettingsRef.current;
      if (settings.muted) return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        const ctx = audioContextRef.current || new AudioContextClass();
        audioContextRef.current = ctx;
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        const start = ctx.currentTime;
        getAlertPattern(settings.sound).forEach(([frequency, offset, duration]) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.frequency.setValueAtTime(frequency, start + offset);
          gain.gain.setValueAtTime(0.0001, start + offset);
          gain.gain.exponentialRampToValueAtTime(0.32, start + offset + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + duration);
          osc.start(start + offset); osc.stop(start + offset + duration + 0.02);
        });
      }
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const hindi = settings.language === "hi-IN";
        const message = new SpeechSynthesisUtterance(hindi
          ? "Aapke paas nayi service request aayi hai. Kripya request check karke accept karein."
          : "You have a new service request. Please check and accept the request.");
        message.lang = settings.language;
        message.rate = 0.92;
        message.volume = 1;
        window.speechSynthesis.speak(message);
      }
    } catch (e) {
      /* Audio not supported */
    }
  }, []);

  // Browsers block sound until the user interacts with the page. Unlock and
  // retain one AudioContext so later socket/poll notifications can always ring.
  useEffect(() => {
    const unlockAudio = () => {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        const ctx = audioContextRef.current || new AudioContextClass();
        audioContextRef.current = ctx;
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
      } catch { /* audio is optional */ }
    };
    window.addEventListener("pointerdown", unlockAudio, { once: true, passive: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  // Network status detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      setConnected(false);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Stable set of event handlers that don't change per render
  const socketHandlers = useRef({
    connect: () => {
      setConnected(true);
      setReconnectAttempt(0);
    },
    disconnect: (reason) => {
      setConnected(false);
    },
    connect_error: () => {
      setConnected(false);
    },
    reconnect_attempt: (attempt) => {
      setReconnectAttempt(attempt);
    },
    reconnect: () => {
      setConnected(true);
      setReconnectAttempt(0);
    },
    reconnect_error: () => {
      setConnected(false);
    },
    reconnect_failed: () => {
      setConnected(false);
    },
    "booking:request": (data) => {
      setRequest(data);
      setCountdown(Math.max(0, Math.ceil((new Date(data.expiresAt || Date.now() + 120000).getTime() - Date.now()) / 1000)));
      showNotice(
        `New booking request from ${data.customer?.name || "customer"}`,
      );
      toast.info("New booking request", {
        description: `${data.applianceServiceId?.title || "Service job"} is waiting for your response.`,
        duration: 10000,
      });
      playNotificationSound();
    },
    "booking:timeout": (data) => {
      setRequest((current) => {
        const next = clearRequestIfMatching(current, data?.bookingId);
        if (!next) setCountdown(30);
        return next;
      });
      showNotice("Booking request timed out.");
    },
    "wallet:update": () => {
      showNotice("Your wallet was updated.");
      loadNotifs();
    },
    notification: (notification) => {
      loadNotifs();
      if (notification?.message) {
        showNotice(notification.message);
        toast.info(notification.title || "New notification", {
          description: notification.message,
        });
      }
    },
  });

  // Socket connection with proper reconnection handling
  const connectSocket = useCallback(() => {
    if (!session.token) return;

    if (socketRef.current) {
      // Cleanup existing socket - only remove our listeners before disconnect
      const events = [
        "connect",
        "disconnect",
        "connect_error",
        "reconnect_attempt",
        "reconnect",
        "reconnect_error",
        "reconnect_failed",
        "booking:request",
        "booking:timeout",
        "wallet:update",
        "notification",
      ];
      events.forEach((evt) => socketRef.current.off(evt));
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setConnected(null);
    setReconnectAttempt(0);

    const localPanel = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const socket = io(
      localPanel ? "http://localhost:8000" : (import.meta.env.VITE_SOCKET_URL || "https://localpintu-backend.onrender.com"),
      {
        auth: { token: session.token },
        reconnection: true,
        reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        timeout: 10000,
      },
    );
    socketRef.current = socket;

    const handlers = socketHandlers.current;
    socket.on("connect", handlers.connect);
    socket.on("disconnect", handlers.disconnect);
    socket.on("connect_error", handlers.connect_error);
    socket.on("reconnect_attempt", handlers.reconnect_attempt);
    socket.on("reconnect", handlers.reconnect);
    socket.on("reconnect_error", handlers.reconnect_error);
    socket.on("reconnect_failed", handlers.reconnect_failed);
    socket.on("booking:request", handlers["booking:request"]);
    socket.on("booking:timeout", handlers["booking:timeout"]);
    socket.on("wallet:update", handlers["wallet:update"]);
    socket.on("notification", handlers["notification"]);
    socket.on("alert-preferences:update", (preferences) => {
      setAlertSettings((current) => ({ ...current, ...preferences }));
      setSession((current) => ({ ...current, technician: { ...current.technician, alertPreferences: preferences } }));
      showNotice(preferences?.muted ? "Request alerts muted by admin" : "Request alert settings updated by admin");
    });

    return socket;
  }, [session.token]);

  // Initialize socket connection - runs only when token changes (login/logout)
  useEffect(() => {
    if (!session.token) return;
    client
      .getMe()
      .then((t) => persist(t, setSession))
      .catch(logout);

    const socket = connectSocket();
    loadNotifs();

    return () => {
      if (socket) {
        // Only remove our specific listeners, not any listeners added by other code
        const events = [
          "connect",
          "disconnect",
          "connect_error",
          "reconnect_attempt",
          "reconnect",
          "reconnect_error",
          "reconnect_failed",
          "booking:request",
          "booking:timeout",
          "wallet:update",
          "notification",
          "alert-preferences:update",
        ];
        events.forEach((evt) => socket.off(evt));
        socket.disconnect();
      }
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      socketRef.current = null;
    };
  }, [session.token, logout, loadNotifs, connectSocket]);

  // Socket delivery can be missed while a phone is sleeping or reconnecting.
  // Polling keeps the persisted assignment visible without creating duplicates.
  useEffect(() => {
    if (!session.token) return undefined;
    let active = true;
    const syncRequestedJob = () => client.jobs().then((jobs) => {
      if (!active) return;
      const pending = jobs.find((job) => job.technicianAssignmentStatus === "Requested");
      if (!pending) return;
      setRequest((current) => {
        if (String(current?._id) === String(pending._id)) return current;
        setCountdown(Math.max(0, Math.ceil((new Date(pending.technicianRequestExpiresAt || Date.now() + 30000).getTime() - Date.now()) / 1000)));
        toast.info("New booking request", {
          description: `${pending.applianceServiceId?.title || "Service job"} is waiting for your response.`,
          duration: 10000,
        });
        playNotificationSound();
        return pending;
      });
    }).catch(() => {});
    syncRequestedJob();
    const interval = setInterval(syncRequestedJob, 15000);
    return () => { active = false; clearInterval(interval); };
  }, [session.token, playNotificationSound]);

  // Manual reconnect handler
  const handleReconnect = useCallback(() => {
    connectSocket();
  }, [connectSocket]);

  // Countdown timer for booking request
  useEffect(() => {
    if (!request) {
      setCountdown(30);
      return;
    }
    const expiresAt = new Date(request.expiresAt || request.technicianRequestExpiresAt || Date.now() + 30000).getTime();
    const updateCountdown = () => setCountdown(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    updateCountdown();
    countdownRef.current = setInterval(() => {
      updateCountdown();
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [request]);

  // Geolocation
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationDenied(true);
      setLocationError("Live location is not supported by this browser.");
      return;
    }
    let active = true;
    const distanceMeters = (from, to) => {
      if (!from) return Number.POSITIVE_INFINITY;
      const radians = (value) => (value * Math.PI) / 180;
      const dLat = radians(to.latitude - from.latitude);
      const dLng = radians(to.longitude - from.longitude);
      const value = Math.sin(dLat / 2) ** 2
        + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLng / 2) ** 2;
      return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
    };
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (!active) return;
        const accuracy = Number(p.coords.accuracy);
        if (Number.isFinite(accuracy) && accuracy > 1000) {
          setLocationDenied(true);
          setLocationError(`GPS accuracy is too low (about ${Math.round(accuracy)} metres). Enable precise location and try again.`);
          return;
        }
        setLocationDenied(false);
        setLocationError("");
        const next = { latitude: p.coords.latitude, longitude: p.coords.longitude, sentAt: Date.now() };
        const previous = lastLocationSentRef.current;
        if (previous && distanceMeters(previous, next) < 15 && Date.now() - previous.sentAt < 30000) return;
        lastLocationSentRef.current = next;
        client
          .updateLocation(
            p.coords.latitude,
            p.coords.longitude,
            p.coords.speed,
            p.coords.heading,
            accuracy,
          )
          .catch((error) => {
            if (active) {
              setLocationDenied(true);
              setLocationError(error.message || "Live location could not be updated.");
            }
          });
      },
      (err) => {
        if (!active) return;
        setLocationDenied(true);
        setLocationError(
          err.code === 1
            ? "Location permission is blocked. Allow it in browser site settings, then try again."
            : err.code === 2
              ? "Current GPS position is unavailable. Turn on device location and try again."
              : err.code === 3
                ? "Location request timed out. Move near a window and try again."
                : "Live location could not be detected.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    return () => {
      active = false;
      navigator.geolocation.clearWatch(id);
    };
  }, [locationRetry]);

  const setAvailability = async (status) => {
    try {
      persist(await client.updateAvailability(status), setSession);
    } catch (e) {
      showNotice(e.message);
    }
  };

  const respond = useCallback(
    async (action) => {
      if (!request || responding) return;
      try {
        setResponding(true);
        const bookingId = request._id;
        await client.jobAction(bookingId, action);
        setRequest((current) => {
          const next = clearRequestIfMatching(current, bookingId);
          if (!next) setCountdown(30);
          return next;
        });
        if (action === "accept") nav(`/job/${bookingId}`);
        // Refresh technician state after response
        const updated = await client.getMe();
        persist(updated, setSession);
      } catch (e) {
        showNotice(e.message);
      } finally {
        setResponding(false);
      }
    },
    [request, responding, nav, showNotice],
  );

  const currentStatus = session.technician?.availabilityStatus || "Offline";
  const serviceName =
    request?.applianceServiceId?.title || request?.servicePlanId?.title || "";
  const planTitle = request?.servicePlanId?.title || "";
  const amount =
    request?.servicePlanId?.offerPrice || request?.servicePlanId?.price || 0;

  // Determine connection status message
  const getConnectionMessage = () => {
    if (connected === null) {
      return {
        icon: FiWifiOff,
        text: "Connecting...",
        className: "connecting",
      };
    }
    if (connected === true) return null;
    if (!isOnline)
      return {
        icon: FiWifiOff,
        text: "No internet connection",
        className: "offline",
      };
    if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      return {
        icon: FiWifiOff,
        text: "Connection lost - Click to retry",
        className: "failed",
        action: handleReconnect,
      };
    }
    return {
      icon: FiWifiOff,
      text: `Reconnecting... (${reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS})`,
      className: "reconnecting",
    };
  };

  const connectionMsg = getConnectionMessage();

  return (
    <div className="app">
      {/* Connection status bar */}
      {connectionMsg && (
        <div
          className={`connection-bar ${connectionMsg.className}`}
          onClick={connectionMsg.action}
          style={connectionMsg.action ? { cursor: "pointer" } : {}}
        >
          <connectionMsg.icon /> {connectionMsg.text}
          {connectionMsg.action && <FiRefreshCw style={{ marginLeft: 8 }} />}
        </div>
      )}

      {mobileNavOpen && (
        <button
          type="button"
          className="mobile-nav-backdrop"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation menu"
        />
      )}
      <aside className={mobileNavOpen ? "mobile-open" : ""} aria-label="Technician navigation">
        <button
          type="button"
          className="mobile-menu-close"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation menu"
        >
          <FiX />
        </button>
        <div className="brand">
          LOCAL<span>PINTU</span>
          <small>TECHNICIAN</small>
        </div>
        <nav>
          {[
            ["/", FiHome, "Dashboard"],
            ["/jobs", FiBriefcase, "Jobs"],
            ["/wallet", FiCreditCard, "Wallet"],
            ["/expenses", FiDollarSign, "Expenses"],
            ["/profile", FiUser, "Profile"],
          ].map(([to, Icon, label]) => (
            <NavLink end={to === "/"} to={to} key={to} onClick={() => setMobileNavOpen(false)}>
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          className="logout"
          onClick={async () => {
            await client.logout().catch(() => {});
            logout();
          }}
        >
          <FiLogOut /> Logout
        </button>
      </aside>
      <main>
        <header>
          <button
            type="button"
            className="mobile-menu-toggle"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={mobileNavOpen}
          >
            <FiMenu />
          </button>
          <div className="technician-identity">
            <p>Good day,</p>
            <h1>{session.technician?.fullName || "Technician"}</h1>
          </div>
          <div className="header-icon-actions">
            <label className="quick-alert-language" title="Spoken request alert language">
              <span className="sr-only">Request alert language</span>
              <select value={alertSettings.language} onChange={(event) => setAlertSettings((current) => ({ ...current, language: event.target.value }))} aria-label="Request alert language">
                <option value="en-IN">English</option>
                <option value="hi-IN">हिन्दी</option>
              </select>
            </label>
            <button
              type="button"
              className={`alert-sound-toggle ${alertSettings.muted ? "is-muted" : ""}`}
              onClick={() => setAlertSettings((current) => ({ ...current, muted: !current.muted }))}
              aria-label={alertSettings.muted ? "Unmute booking request sound" : "Mute booking request sound"}
              title={alertSettings.muted ? "Sound muted — click to unmute" : "Sound on — click to mute"}
            >
              {alertSettings.muted ? <FiVolumeX /> : <FiVolume2 />}
            </button>
            {/* Connection indicator */}
            <span
              className={`connection-dot ${connected === true ? "online" : connected === null ? "connecting" : "offline"}`}
              title={
                connected === true
                  ? "Connected"
                  : connected === null
                    ? "Connecting..."
                    : "Disconnected"
              }
            >
              {connected === true ? <FiWifi /> : <FiWifiOff />}
            </span>
            <button
              className="notif-btn"
              onClick={() => setShowNotif(!showNotif)}
              aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
              aria-expanded={showNotif}
            >
              <FiBell />
              {unreadCount > 0 && (
                <span className="notif-badge">{unreadCount}</span>
              )}
            </button>
          </div>
          <div className="availability-group">
              <button
                className={`availability-btn ${currentStatus === "Available" ? "active available" : ""}`}
                onClick={() => setAvailability("Available")}
                title="Available for bookings"
              >
                <span aria-hidden="true">●</span> Available
              </button>
              <button
                className={`availability-btn ${currentStatus === "Busy" ? "active busy" : ""}`}
                onClick={() => setAvailability("Busy")}
                title="Busy - no new bookings"
                disabled={currentStatus === "Busy"}
              >
                <span aria-hidden="true">●</span> Busy
              </button>
              <button
                className={`availability-btn ${currentStatus === "Unavailable" ? "active offline" : ""}`}
                onClick={() => setAvailability("Unavailable")}
                title="Offline - hidden from assignment"
              >
                <span aria-hidden="true">●</span> Offline
              </button>
          </div>
        </header>
        {locationDenied && (
          <div className="error">
            {locationError || "Live location is required to receive nearby bookings."}
            <button type="button" onClick={() => { lastLocationSentRef.current = null; setLocationRetry((value) => value + 1); }}>
              Try location again
            </button>
          </div>
        )}
        {notice && (
          <div className="notice" onClick={() => setNotice("")}>
            {notice}
          </div>
        )}
        {showNotif && (
          <NotifDropdown
            list={notifList}
            onClose={() => setShowNotif(false)}
            onRead={async (id) => {
              try {
                await client.markNotificationRead(id);
                loadNotifs();
              } catch (e) {}
            }}
            onReadAll={async () => {
              try {
                await client.markAllNotificationsRead();
                loadNotifs();
              } catch (e) {}
            }}
          />
        )}
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="job/:id" element={<ActiveJob />} />
          <Route path="wallet" element={<Wallet />} />
          <Route path="expenses" element={<Expenses />} />
          <Route
            path="profile"
            element={
              <Profile
                technician={session.technician}
                update={(t) => persist(t, setSession)}
                alertSettings={alertSettings}
                updateAlertSettings={setAlertSettings}
              />
            }
          />
        </Routes>
      </main>

      <nav className="technician-bottom-nav" aria-label="Mobile technician navigation">
        {[
          ["/", FiHome, "Home"],
          ["/jobs", FiBriefcase, "Jobs"],
          ["/wallet", FiCreditCard, "Wallet"],
          ["/profile", FiUser, "Profile"],
        ].map(([to, Icon, label]) => (
          <NavLink end={to === "/"} to={to} key={to}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Premium booking request popup */}
      {request && (
        <section className="request-premium">
          <div className="request-premium-header">
            <span className="request-badge">NEW REQUEST</span>
            <div className="request-timer">
              <svg className="timer-ring" viewBox="0 0 36 36">
                <path
                  className="timer-bg"
                  d="M18 2a16 16 0 1 1 0 32 16 16 0 0 1 0-32"
                />
                <path
                  className="timer-progress"
                  strokeDasharray={`${(countdown / 30) * 100}, 100`}
                  d="M18 2a16 16 0 1 1 0 32 16 16 0 0 1 0-32"
                />
              </svg>
              <span className="timer-text">{countdown}s</span>
            </div>
          </div>
          <div className="request-premium-body">
            <h2>{request.customer?.name || "Customer"}</h2>
            <p className="request-address">
              <FiMapPin />{" "}
              {request.customer?.address || "Address not available"}
            </p>
            {request.distanceMeters ? (
              <p className="request-distance">
                {(request.distanceMeters / 1000).toFixed(1)} km away
              </p>
            ) : (
              <p className="request-distance">Distance updating</p>
            )}
            <div className="request-summary">
              {serviceName && (
                <div className="request-summary-item">
                  <span>Service</span>
                  <strong>{serviceName}</strong>
                </div>
              )}
              {planTitle && (
                <div className="request-summary-item">
                  <span>Plan</span>
                  <strong>{planTitle}</strong>
                </div>
              )}
              {amount > 0 && (
                <div className="request-summary-item">
                  <span>Amount</span>
                  <strong className="amount">{money(amount)}</strong>
                </div>
              )}
              {request.customer?.mobileNumber && (
                <div className="request-summary-item">
                  <span>Contact</span>
                  <strong>
                    <a href={`tel:${request.customer.mobileNumber}`}>
                      {request.customer.mobileNumber}
                    </a>
                  </strong>
                </div>
              )}
            </div>
          </div>
          <div className="request-premium-actions">
            <button
              className="secondary reject-btn"
              disabled={responding || (countdown === 0 && request.technicianAssignmentStatus !== "Manual")}
              onClick={() => respond("reject")}
            >
              <FiX /> Reject
            </button>
            <button className="accept-btn" disabled={responding || (countdown === 0 && request.technicianAssignmentStatus !== "Manual")} onClick={() => respond("accept")}>
              {responding ? "Please wait…" : "Accept job"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function NotifDropdown({ list, onClose, onRead, onReadAll }) {
  return (
    <div className="notif-dropdown" role="dialog" aria-label="Notifications">
      <div className="notif-header">
        <strong>Notifications</strong>
        <div>
          {list.some((n) => !n.readAt) && (
            <button onClick={onReadAll}>Mark all read</button>
          )}
          <button onClick={onClose} aria-label="Close notifications">
            <FiX />
          </button>
        </div>
      </div>
      <div className="notif-list">
        {list.length === 0 ? (
          <EmptyState
            icon={FiBell}
            title="All caught up"
            text="New updates will appear here."
          />
        ) : (
          list.map((n) => (
            <div
              className={`notif-item${!n.readAt ? " unread" : ""}`}
              key={n._id}
              onClick={() => {
                if (!n.readAt) onRead(n._id);
              }}
            >
              <strong>{n.title}</strong>
              {n.message && <p>{n.message}</p>}
              <small>{new Date(n.createdAt).toLocaleString()}</small>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const Stat = ({
  label,
  value,
  icon: Icon = FiActivity,
  tone = "navy",
  helper,
}) => (
  <article className="metric-card" data-tone={tone}>
    <span className="metric-icon">
      <Icon />
    </span>
    <div>
      <span>{label}</span>
      <strong>{Array.isArray(value) ? value.length : (value && typeof value === "object" ? "—" : (value ?? "—"))}</strong>
      {helper && <small>{helper}</small>}
    </div>
  </article>
);

function Dashboard() {
  const [jobs, setJobs] = useState([]);
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([client.dashboard(), client.jobs()])
      .then(([summary, nextJobs]) => {
        setDash(summary);
        setJobs(nextJobs);
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <PanelSkeleton cards={8} />;
  if (error)
    return (
      <section className="panel">
        <EmptyState
          icon={FiAlertCircle}
          title="Dashboard unavailable"
          text={error}
        />
      </section>
    );

  const now = new Date();
  const todayKey = now.toDateString();
  const month = now.getMonth();
  const year = now.getFullYear();
  const todayJobs = jobs.filter(
    (job) => new Date(job.bookingDate).toDateString() === todayKey,
  );
  const activeJobs = jobs.filter((job) =>
    [
      "Assigned",
      "In Progress",
      "Paused",
      "Waiting For OTP Verification",
    ].includes(job.status),
  );
  const completed =
    dash?.completedJobs ??
    jobs.filter((job) => job.status === "Completed").length;
  const cancelled =
    dash?.cancelledJobs ??
    jobs.filter((job) => job.status === "Cancelled").length;
  const completionRateValue =
    completed + cancelled
      ? Math.round((completed / (completed + cancelled)) * 100)
      : 0;
  const todayEarnings = dash?.todayEarnings || 0;
  const monthlyEarnings = dash?.monthlyEarnings || 0;
  const ratingScore = Math.min(100, Number(dash?.rating || 0) * 20);
  const performanceScore = Math.round(
    (Number(dash?.acceptanceRate || 0) + completionRateValue + ratingScore) / 3,
  );
  const recent = jobs;
  const weekly = (dash?.weeklyJobs || []).map((day) => ({
    label: new Date(day.date + "T00:00:00")
      .toLocaleDateString("en-IN", { weekday: "short" })
      .slice(0, 1),
    count: day.count,
  }));
  const weeklyMax = Math.max(1, ...weekly.map((day) => day.count));
  const active = dash?.currentJob;

  return (
    <div className="dashboard-page">
      <section className="hero dashboard-hero">
        <div>
          <span>LIVE WORKSPACE</span>
          <h2>
            {active
              ? `Current job: ${active.bookingNumber}`
              : "You're ready for your next job"}
          </h2>
          <p>
            {active?.customer?.address ||
              "Keep your availability and location sharing on to receive nearby work."}
          </p>
        </div>
        {active && (
          <NavLink className="route" to={`/job/${active._id}`}>
            <FiBriefcase /> Open active job
          </NavLink>
        )}
      </section>
      <section className="metrics-grid" aria-label="Performance overview">
        <Stat
          label="Today's jobs"
          value={todayJobs.length}
          icon={FiCalendar}
          tone="blue"
        />
        <Stat
          label="Pending jobs"
          value={dash?.pendingJobs || 0}
          icon={FiClock}
          tone="amber"
        />
        <Stat
          label="Active jobs"
          value={activeJobs.length}
          icon={FiActivity}
          tone="orange"
        />
        <Stat
          label="Completed jobs"
          value={completed}
          icon={FiCheckCircle}
          tone="green"
        />
        <Stat label="Cancelled jobs" value={cancelled} icon={FiX} tone="red" />
        <Stat
          label="Today's earnings"
          value={money(todayEarnings)}
          icon={FiDollarSign}
          tone="green"
        />
        <Stat
          label="Monthly earnings"
          value={money(monthlyEarnings)}
          icon={FiTrendingUp}
          tone="blue"
        />
        <Stat
          label="Wallet balance"
          value={money(dash?.walletBalance)}
          icon={FiCreditCard}
          tone="navy"
        />
        <Stat
          label="Performance score"
          value={`${performanceScore}%`}
          icon={FiActivity}
          tone="orange"
          helper="Acceptance, completion and rating"
        />
        <Stat
          label="Average rating"
          value={`${dash?.rating || 0}/5`}
          icon={FiStar}
          tone="amber"
        />
        <Stat
          label="Completion rate"
          value={`${completionRateValue}%`}
          icon={FiCheckCircle}
          tone="green"
        />
        <Stat
          label="Response time"
          value="Live"
          icon={FiClock}
          tone="blue"
          helper="30 second request window"
        />
      </section>
      <section className="dashboard-lower-grid">
        <article className="panel weekly-card">
          <div className="section-heading">
            <div>
              <span>LAST 7 DAYS</span>
              <h2>Weekly summary</h2>
            </div>
            <strong>
              {weekly.reduce((sum, day) => sum + day.count, 0)} jobs
            </strong>
          </div>
          <div className="weekly-chart">
            {weekly.map((day, index) => (
              <div className="weekly-day" key={index}>
                <span>{day.count}</span>
                <i
                  style={{
                    height: `${Math.max(10, (day.count / weeklyMax) * 100)}%`,
                  }}
                />
                <small>{day.label}</small>
              </div>
            ))}
          </div>
        </article>
        <article className="panel activity-card">
          <div className="section-heading">
            <div>
              <span>LATEST UPDATES</span>
              <h2>Recent activity</h2>
            </div>
            <NavLink to="/jobs">View all</NavLink>
          </div>
          {recent.length ? (
            <div className="activity-list">
              {recent.map((job) => (
                <NavLink
                  to={`/job/${job._id}`}
                  className="activity-item"
                  key={job._id}
                >
                  <span className="activity-dot" data-status={job.status} />
                  <div>
                    <strong>{job.bookingNumber}</strong>
                    <small>
                      {job.applianceServiceId?.title || "Service job"} ·{" "}
                      {new Date(job.updatedAt).toLocaleDateString("en-IN")}
                    </small>
                  </div>
                  <StatusBadge status={job.status} />
                </NavLink>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No recent activity"
              text="New job updates will appear here."
            />
          )}
        </article>
      </section>
    </div>
  );
}
function Jobs() {
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState("");
  const [otp, setOtp] = useState({});
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);;
  const [otpTimers, setOtpTimers] = useState({});
  const load = () => {
    setLoading(true);
    setError("");
    client
      .jobs()
      .then(setJobs)
      .catch((requestError) => setError(requestError.message || "Could not load your jobs."))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);
  const act = async (job, action, payload = {}) => {
    try {
      await client.jobAction(job._id, action, payload);
      load();
    } catch (e) {
      alert(e.message);
    }
  };
  const requestComp = async (job) => {
    try {
      const result = await client.requestCompletion(job._id);
      load();
    } catch (e) {
      alert(e.message);
    }
  };
  const verifyOtp = async (job) => {
    try {
      const result = await client.verifyOtp(job._id, otp[job._id]);
      load();
    } catch (e) {
      alert(e.message);
    }
  };
  const resendOtp = async (job) => {
    try {
      const result = await client.resendOtp(job._id);
      alert(result.message || "OTP resent");
      load();
    } catch (e) {
      alert(e.message);
    }
  };
  const photos = async (job, field, files) => {
    if (!files?.length) return;
    try {
      const values = await readJobPhotos(files);
      await act(job, "photos", { [field]: values });
    } catch (e) {
      alert(e.message);
    }
  };
  const copyPhone = (phone) => {
    navigator.clipboard
      ?.writeText(phone)
      .then(() => alert("Phone number copied!"))
      .catch(() => {});
  };
  if (loading) return <PanelSkeleton cards={5} />;
  if (error) return <section className="panel"><EmptyState title="Jobs could not be loaded" text={error} /></section>;
  if (jobs.length === 0)
    return (
      <section className="panel">
        <EmptyState
          title="No jobs assigned yet"
          text="Keep your availability and live location on. New requests will appear here."
        />
      </section>
    );
  return (
    <section className="panel">
      <h2>My jobs ({jobs.length})</h2>
      {jobs.map((j) => {
        const showPhone =
          j.technicianAssignmentStatus === "Accepted" ||
          !["Requested", null].includes(j.technicianAssignmentStatus);
        const isRequested = j.technicianAssignmentStatus === "Requested";
        const isAccepted =
          j.status === "Assigned" &&
          ["Accepted", "Manual"].includes(j.technicianAssignmentStatus);
        const isInProgress = j.status === "In Progress";
        const isPaused = j.status === "Paused";
        const isWaitingConfirm = j.status === "Waiting For OTP Verification";
        const isActive = [
          "Assigned",
          "In Progress",
          "Paused",
          "Waiting For OTP Verification",
        ].includes(j.status);
        const canUploadPhotos = ["Assigned", "In Progress", "Paused"].includes(
          j.status,
        );
        const hasCoordinates = Number.isFinite(Number(j.customerLocation?.latitude)) && Number.isFinite(Number(j.customerLocation?.longitude));
        const locationDestination = hasCoordinates
          ? `${j.customerLocation.latitude},${j.customerLocation.longitude}`
          : String(j.customer?.address || "").trim();
        return (
          <div className="job" key={j._id}>
            <div>
              <div className="job-header">
                <div>
                  <strong>{j.bookingNumber}</strong>
                  <StatusBadge status={j.status} />
                </div>
                <span className="tag">
                  {money(
                    j.servicePlanId?.offerPrice || j.servicePlanId?.price || 0,
                  )}
                </span>
              </div>
              <p>
                {j.applianceServiceId?.title} - {j.servicePlanId?.title}
              </p>
              <small>{j.customer?.address}</small>
              {j.customer?.mobileNumber && showPhone && (
                <div className="customer-phone">
                  <FiPhone />{" "}
                  <a href={`tel:${j.customer.mobileNumber}`}>
                    {j.customer.mobileNumber}
                  </a>
                  <button
                    className="copy-btn"
                    onClick={() => copyPhone(j.customer.mobileNumber)}
                    title="Copy number"
                  >
                    <FiCopy />
                  </button>
                </div>
              )}
            </div>
            <div className="actions">
              {showPhone && locationDestination && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(locationDestination)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="nav-btn"
                  title="Open customer location in Google Maps"
                >
                  <FiNavigation /> Open location
                </a>
              )}
              {isRequested && (
                <>
                  <button className="secondary" onClick={() => act(j, "hold")}>
                    Hold
                  </button>
                  <button
                    className="secondary"
                    onClick={() => act(j, "reject")}
                  >
                    Reject
                  </button>
                  <button onClick={() => act(j, "accept")}>Accept</button>
                </>
              )}
              {isAccepted && (
                <>
                  <button onClick={() => act(j, "start")}>Start job</button>
                </>
              )}
              {isActive && showPhone && (
                <>
                  <a
                    href={`tel:${j.customer?.mobileNumber}`}
                    className="call-btn"
                    title="Call customer"
                  >
                    <FiPhone />
                  </a>
                </>
              )}
              {isInProgress && (
                <>
                  <button className="secondary" onClick={() => act(j, "pause")}>
                    Pause
                  </button>
                  {j.beforePhotos?.length > 0 && j.afterPhotos?.length > 0 && (
                    <button className="primary" onClick={() => requestComp(j)}>
                      DONE
                    </button>
                  )}
                </>
              )}
              {
              isWaitingConfirm && (
                <>
                  <div className="otp-verify-section">
                    <input
                      placeholder="Enter OTP from customer"
                      className="otp-input"
                      value={otp[j._id] || ""}
                      onChange={(e) =>
                        setOtp({
                          ...otp,
                          [j._id]: e.target.value
                            .replace(/\D/g, "")
                            .slice(0, 6),
                        })
                      }
                      maxLength={6}
                    />
                    <button
                      onClick={() => verifyOtp(j)}
                      disabled={!otp[j._id] || otp[j._id].length < 6}
                    >
                      Verify OTP
                    </button>
                  </div>
                  <button className="secondary" onClick={() => resendOtp(j)}>
                    Resend OTP
                  </button>
                </>
              )}
              {isPaused && (
                <button onClick={() => act(j, "resume")}>Resume</button>
              )}
              {isActive && !isRequested && !isWaitingConfirm && (
                <button
                  className="danger"
                  onClick={() =>
                    act(j, "cancel", {
                      reason: window.prompt("Cancellation reason") || "",
                    })
                  }
                >
                  Cancel
                </button>
              )}
            </div>
            {canUploadPhotos && (
              <div className="job-flow">
                <textarea
                  placeholder="Job notes"
                  value={notes[j._id] ?? j.jobNotes ?? ""}
                  onChange={(e) =>
                    setNotes({ ...notes, [j._id]: e.target.value })
                  }
                />
                <button
                  className="secondary"
                  onClick={() =>
                    act(j, "notes", { notes: notes[j._id] ?? j.jobNotes ?? "" })
                  }
                >
                  Save notes
                </button>
                <label className="file-label">
                  Before photos{" "}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => photos(j, "beforePhotos", e.target.files)}
                  />
                </label>
                <label className="file-label">
                  After photos{" "}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => photos(j, "afterPhotos", e.target.files)}
                  />
                </label>
                <PhotoPreviews photos={j.beforePhotos} label="Before photo" />
                <PhotoPreviews photos={j.afterPhotos} label="After photo" />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function Wallet() {
  const [data, setData] = useState(null);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    setError("");
    client
      .wallet()
      .then(setData)
      .catch((requestError) => setError(requestError.message || "Could not load wallet details."))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);
  const withdraw = async (e) => {
    e.preventDefault();
    try {
      await client.requestWithdrawal({ amount: Number(amount) });
      setAmount("");
      setMessage("Withdrawal request submitted.");
      load();
    } catch (error) {
      setMessage(error.message);
    }
  };
  if (loading) return <PanelSkeleton cards={4} />;
  if (error) return <section className="panel"><EmptyState title="Wallet could not be loaded" text={error} /></section>;
  return (
    <>
      <section className="stats">
        <Stat label="Available" value={money(data?.wallet?.balance)} />
        <Stat
          label="Pending settlement"
          value={money(data?.wallet?.pendingAmount)}
        />
      </section>
      <section className="panel">
        <h2>Withdraw funds</h2>
        <form className="grid-form" onSubmit={withdraw}>
          <input
            required
            min="1"
            type="number"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button>Request withdrawal</button>
        </form>
        {message && <p>{message}</p>}
      </section>
      <section className="panel">
        <h2>Transaction history</h2>
        {data?.transactions?.map((x) => (
          <div className="job" key={x._id}>
            <strong>{x.type}</strong>
            <span>
              {money(x.amount)} - {x.status}
              {x.rejectionReason ? ` - ${x.rejectionReason}` : ""}
            </span>
          </div>
        ))}
      </section>
    </>
  );
}

function Expenses() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({
    category: "Fuel",
    title: "",
    amount: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    receiptUrl: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = () => {
    setLoading(true);
    setError("");
    client
      .expenses()
      .then(setList)
      .catch((requestError) => setError(requestError.message || "Could not load expenses."))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);
  if (loading) return <PanelSkeleton cards={5} />;
  if (error) return <section className="panel"><EmptyState title="Expenses could not be loaded" text={error} /></section>;
  return (
    <>
      <section className="panel">
        <h2>Add expense</h2>
        <form
          className="grid-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await client.addExpense(form);
              setForm({ ...form, title: "", amount: "" });
              load();
            } catch (requestError) {
              setError(requestError.message || "Could not save this expense.");
            }
          }}
        >
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {[
              "Fuel",
              "Travel",
              "Parking",
              "Tools",
              "Parts",
              "Food",
              "Miscellaneous",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <input
            required
            placeholder="Expense title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <input
            required
            min="0"
            type="number"
            placeholder="Amount"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          <input
            required
            type="date"
            value={form.expenseDate}
            onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
          />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const r = new FileReader();
              r.onload = () => setForm({ ...form, receiptUrl: r.result });
              r.readAsDataURL(f);
            }}
          />
          <button>
            <FiPlus /> Add expense
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>Expense history</h2>
        {list.map((x) => (
          <div className="job" key={x._id}>
            <strong>{x.title}</strong>
            <span>
              {money(x.amount)} - {x.status}
            </span>
          </div>
        ))}
      </section>
    </>
  );
}

function Profile({ technician, update, alertSettings, updateAlertSettings }) {
  const [form, setForm] = useState(technician || {});
  const [message, setMessage] = useState("");
  useEffect(() => setForm(technician || {}), [technician]);
  const saveProfile = async () => {
    try {
      const next = await client.updateMe({
        fullName: form.fullName,
        address: form.address,
        state: form.state,
        city: form.city,
        pincode: form.pincode,
        skills: form.skills,
        experience: form.experience,
        upiId: form.upiId,
        bankAccount: form.bankAccount,
        profileImage: form.profileImage,
      });
      setForm(next);
      update(next);
      setMessage("Profile updated successfully.");
    } catch (error) {
      setMessage(error.message);
    }
    setTimeout(() => setMessage(""), 5000);
  };
  const readFile = (file, key) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const documents = { ...(form.documents || {}), [key]: reader.result };
        const next = await client.updateMe({ documents });
        setForm(next);
        update(next);
        setMessage(`${key} uploaded for verification.`);
      } catch (error) {
        setMessage(error.message);
      }
    };
    reader.readAsDataURL(file);
  };
  const docs = [
    { key: "aadhaarFront", label: "Aadhaar (Front)" },
    { key: "aadhaarBack", label: "Aadhaar (Back)" },
    { key: "pan", label: "PAN Card" },
    { key: "drivingLicense", label: "Driving License" },
    { key: "policeVerification", label: "Police Verification" },
  ];
  return (
    <section className="panel">
      <h2>My Profile</h2>
      {message && (
        <div
          className={
            message.includes("error") || message.includes("Error")
              ? "error"
              : "notice"
          }
        >
          {message}
        </div>
      )}
      <div className="grid-form">
        <input
          placeholder="Full name"
          value={form.fullName || ""}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        />
        <input placeholder="Email" value={form.email || ""} disabled />
        <input placeholder="Mobile" value={form.mobileNumber || ""} disabled />
        <input
          placeholder="Address"
          value={form.address || ""}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        <input
          placeholder="State"
          value={form.state || ""}
          onChange={(e) => setForm({ ...form, state: e.target.value })}
        />
        <input
          placeholder="City"
          value={form.city || ""}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
        />
        <input
          placeholder="Pincode"
          value={form.pincode || ""}
          onChange={(e) => setForm({ ...form, pincode: e.target.value })}
        />
        <input
          placeholder="Skills (comma separated)"
          value={
            Array.isArray(form.skills)
              ? form.skills.join(", ")
              : form.skills || ""
          }
          onChange={(e) => setForm({ ...form, skills: e.target.value })}
        />
        <input
          placeholder="Experience (years)"
          type="number"
          min="0"
          value={form.experience || 0}
          onChange={(e) => setForm({ ...form, experience: e.target.value })}
        />
        <input
          placeholder="UPI ID"
          value={form.upiId || ""}
          onChange={(e) => setForm({ ...form, upiId: e.target.value })}
        />
        <input
          placeholder="Bank account holder"
          value={form.bankAccount?.accountHolder || ""}
          onChange={(e) =>
            setForm({
              ...form,
              bankAccount: {
                ...form.bankAccount,
                accountHolder: e.target.value,
              },
            })
          }
        />
        <input
          placeholder="Bank account number"
          value={form.bankAccount?.accountNumber || ""}
          onChange={(e) =>
            setForm({
              ...form,
              bankAccount: {
                ...form.bankAccount,
                accountNumber: e.target.value,
              },
            })
          }
        />
        <input
          placeholder="IFSC code"
          value={form.bankAccount?.ifsc || ""}
          onChange={(e) =>
            setForm({
              ...form,
              bankAccount: { ...form.bankAccount, ifsc: e.target.value },
            })
          }
        />
        <input
          placeholder="Bank name"
          value={form.bankAccount?.bankName || ""}
          onChange={(e) =>
            setForm({
              ...form,
              bankAccount: { ...form.bankAccount, bankName: e.target.value },
            })
          }
        />
      </div>
      <button onClick={saveProfile} style={{ marginTop: 14 }}>
        Save profile
      </button>

      <h2 className="section-title">New request alerts</h2>
      <div className="alert-preferences">
        <label>
          Spoken alert language
          <select value={alertSettings.language} onChange={(event) => updateAlertSettings((current) => ({ ...current, language: event.target.value }))}>
            <option value="en-IN">English</option>
            <option value="hi-IN">Hindi</option>
          </select>
        </label>
        <label className="alert-mute-toggle">
          <input type="checkbox" checked={alertSettings.muted} onChange={(event) => updateAlertSettings((current) => ({ ...current, muted: event.target.checked }))} />
          <span>{alertSettings.muted ? "Request sound and voice muted" : "Request sound and voice enabled"}</span>
        </label>
      </div>

      <h2 className="section-title">Documents</h2>
      <div className="document-grid">
        {docs.map(({ key, label }) => (
          <div className="document-card" key={key}>
            <strong>{label}</strong>
            {form.documents?.[key] ? (
              <a href={form.documents[key]} target="_blank" rel="noreferrer">
                View uploaded
              </a>
            ) : (
              <span>Not uploaded</span>
            )}
            <span>
              {form.documentVerification?.[
                key.replace(/Front|Back/, "").toLowerCase()
              ]?.status ||
                form.verificationStatus ||
                "Pending"}
            </span>
            <label className="file-label">
              Upload
              <input
                type="file"
                accept="image/*"
                onChange={(e) => readFile(e.target.files?.[0], key)}
              />
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActiveJob() {
  const { id } = useParams();
  const nav = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [otpVal, setOtpVal] = useState("");
  const [slideComplete, setSlideComplete] = useState(false);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = () => {
    client
      .job(id)
      .then((item) => {
        setJob(item);
        setLoading(false);
      })
      .catch((requestError) => {
        setError(requestError.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, [id]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const act = async (action, payload = {}) => {
    try {
      setBusyAction(action);
      await client.jobAction(id, action, payload);
      setError("");
      load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyAction("");
    }
  };

  if (loading) return <PanelSkeleton cards={5} />;
  if (!job)
    return (
      <section className="panel">
        <EmptyState
          icon={FiAlertCircle}
          title="Job not found"
          text={error || "This job is no longer available."}
        />
      </section>
    );

  const isInProgress = job.status === "In Progress";
  const isWaiting = job.status === "Waiting For OTP Verification";
  const isCompleted = job.status === "Completed";
  const isPaused = job.status === "Paused";
  const customerDestination = Number.isFinite(Number(job.customerLocation?.latitude)) && Number.isFinite(Number(job.customerLocation?.longitude))
    ? `${job.customerLocation.latitude},${job.customerLocation.longitude}`
    : String(job.customer?.address || "").trim();
  const isStartable =
    job.status === "Assigned" &&
    ["Accepted", "Manual"].includes(job.technicianAssignmentStatus);
  const canUploadPhotos = ["Assigned", "In Progress", "Paused"].includes(
    job.status,
  );
  const hasRequiredPhotos =
    job.beforePhotos?.length > 0 && job.afterPhotos?.length > 0;
  const otpRemaining = job.completionOtpExpiresAt
    ? Math.max(0, new Date(job.completionOtpExpiresAt).getTime() - now)
    : 0;
  const otpTime = `${Math.floor(otpRemaining / 60000)
    .toString()
    .padStart(2, "0")}:${Math.floor((otpRemaining % 60000) / 1000)
    .toString()
    .padStart(2, "0")}`;
  const timeline = [
    ["Booking created", job.createdAt, true],
    ["Technician assigned", job.assignedAt, Boolean(job.assignedAt)],
    [
      "Job accepted",
      job.startedAt,
      [
        "In Progress",
        "Paused",
        "Waiting For OTP Verification",
        "Completed",
      ].includes(job.status),
    ],
    ["Service started", job.startedAt, Boolean(job.startedAt)],
    ["Before images uploaded", null, Boolean(job.beforePhotos?.length)],
    ["After images uploaded", null, Boolean(job.afterPhotos?.length)],
    ["Waiting for OTP", job.completionOtpRequestedAt, isWaiting || isCompleted],
    ["Job completed", job.completedAt, isCompleted],
  ];
  const uploadPhotos = async (field, files) => {
    try {
      await act("photos", { [field]: await readJobPhotos(files) });
    } catch (requestError) {
      setError(requestError.message);
    }
  };
  const removePhoto = (field, index) =>
    act("photos", { removePhoto: { field, index } });

  return (
    <div className="active-job-page">
      <section className="active-job-topbar">
        <div>
          <button
            className="icon-back"
            onClick={() => nav("/jobs")}
            aria-label="Back to jobs"
          >
            ←
          </button>
          <div>
            <span>ACTIVE SERVICE</span>
            <h2>{job.bookingNumber}</h2>
          </div>
        </div>
        <StatusBadge status={job.status} />
      </section>

      {error && (
        <div className="toast-message toast-error" role="alert">
          <FiAlertCircle />
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss">
            <FiX />
          </button>
        </div>
      )}

      <div className="job-layout">
        <main className="job-main-column">
          <section className="job-info-grid">
            <article className="job-detail-card customer-card">
              <div className="card-title">
                <span>
                  <FiUser />
                </span>
                <div>
                  <small>CUSTOMER</small>
                  <h3>Customer information</h3>
                </div>
              </div>
              <strong>{job.customer?.name || "Customer"}</strong>
              <p>{job.customer?.mobileNumber || "Phone unavailable"}</p>
              {job.customer?.mobileNumber && (
                <a
                  className="call-btn"
                  href={`tel:${job.customer.mobileNumber}`}
                >
                  <FiPhone /> Call customer
                </a>
              )}
            </article>
            <article className="job-detail-card service-card">
              <div className="card-title">
                <span>
                  <FiTool />
                </span>
                <div>
                  <small>SERVICE</small>
                  <h3>Service information</h3>
                </div>
              </div>
              <strong>{job.applianceServiceId?.title || "Service"}</strong>
              <p>{job.servicePlanId?.title || "Standard plan"}</p>
              <span className="service-price">
                {money(
                  job.servicePlanId?.offerPrice ||
                    job.servicePlanId?.price ||
                    0,
                )}
              </span>
            </article>
            <article className="job-detail-card address-card">
              <div className="card-title">
                <span>
                  <FiMapPin />
                </span>
                <div>
                  <small>LOCATION</small>
                  <h3>Service address</h3>
                </div>
              </div>
              <strong>{job.customer?.address || "Address unavailable"}</strong>
              <p>
                {new Date(job.bookingDate).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}{" "}
                · {job.timeSlot}
              </p>
              <a
                className="nav-btn"
                  href={job.customerLocationLink || `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(customerDestination)}`}
                target="_blank"
                rel="noreferrer"
              >
                <FiNavigation /> Navigate
              </a>
            </article>
            <article className="job-detail-card problem-card">
              <div className="card-title">
                <span>
                  <FiInfo />
                </span>
                <div>
                  <small>JOB BRIEF</small>
                  <h3>Problem description</h3>
                </div>
              </div>
              <p>
                {job.customer?.problemDescription ||
                  "No additional details were provided."}
              </p>
              <label className="notes-field">
                <span>Technician notes</span>
                <textarea
                  defaultValue={job.jobNotes || ""}
                  placeholder="Add service notes…"
                  onBlur={(event) =>
                    act("notes", { notes: event.target.value })
                  }
                />
              </label>
            </article>
          </section>

          <section className="job-section images-section">
            <div className="section-heading">
              <div>
                <span>WORK PROOF</span>
                <h2>Service images</h2>
                <p>Upload clear photos before and after completing the work.</p>
              </div>
              <strong>
                {(job.beforePhotos?.length || 0) +
                  (job.afterPhotos?.length || 0)}
                /16
              </strong>
            </div>
            <div className="upload-grid">
              {[
                ["beforePhotos", "Before service", job.beforePhotos],
                ["afterPhotos", "After service", job.afterPhotos],
              ].map(([field, title, photos]) => (
                <article
                  className="upload-card"
                  key={field}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (canUploadPhotos)
                      uploadPhotos(field, event.dataTransfer.files);
                  }}
                >
                  <div className="upload-card-head">
                    <div>
                      <strong>{title}</strong>
                      <small>{photos?.length || 0} of 8 images</small>
                    </div>
                    {photos?.length > 0 && (
                      <span className="upload-success">
                        <FiCheck /> Saved
                      </span>
                    )}
                  </div>
                  {canUploadPhotos && (
                    <label
                      className={`upload-dropzone ${busyAction === "photos" ? "is-uploading" : ""}`}
                    >
                      <FiUploadCloud />
                      <strong>
                        {busyAction === "photos"
                          ? "Uploading images…"
                          : "Drop images here"}
                      </strong>
                      <span>or tap to browse · PNG, JPG, WEBP</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(event) =>
                          uploadPhotos(field, event.target.files)
                        }
                      />
                    </label>
                  )}
                  <PhotoPreviews
                    photos={photos}
                    label={title}
                    onRemove={
                      canUploadPhotos
                        ? (index) => removePhoto(field, index)
                        : null
                    }
                  />
                </article>
              ))}
            </div>
          </section>

          {isWaiting && (
            <section className="otp-premium-card">
              <div className="otp-card-icon">
                <FiCheckCircle />
              </div>
              <div className="otp-card-copy">
                <span>SECURE COMPLETION</span>
                <h2>Verify customer OTP</h2>
                <p>
                  Ask the customer for the 6-digit code sent to their registered
                  mobile number.
                </p>
              </div>
              <div className="otp-entry">
                <input
                  autoFocus
                  inputMode="numeric"
                  aria-label="Six digit verification code"
                  placeholder="000000"
                  value={otpVal}
                  onChange={(event) =>
                    setOtpVal(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  maxLength={6}
                />
                <small>
                  <FiClock /> Code expires in {otpTime}
                </small>
              </div>
              <div className="otp-actions">
                <button
                  onClick={() => act("verify-otp", { otp: otpVal })}
                  disabled={otpVal.length < 6 || busyAction === "verify-otp"}
                >
                  {busyAction === "verify-otp" ? (
                    <>
                      <span className="button-spinner" /> Verifying…
                    </>
                  ) : (
                    <>
                      <FiCheck /> Verify & complete
                    </>
                  )}
                </button>
                <button
                  className="secondary"
                  onClick={() => act("resend-otp")}
                  disabled={busyAction === "resend-otp"}
                >
                  {busyAction === "resend-otp" ? "Sending…" : "Resend code"}
                </button>
              </div>
            </section>
          )}

          {isCompleted && (
            <div className="completed-banner">
              <span>
                <FiCheck />
              </span>
              <div>
                <strong>Job completed successfully</strong>
                <p>
                  The customer OTP was verified and this service is now closed.
                </p>
              </div>
            </div>
          )}
        </main>

        <aside className="job-side-column">
          <section className="timeline-card">
            <div className="section-heading">
              <div>
                <span>PROGRESS</span>
                <h2>Job timeline</h2>
              </div>
            </div>
            <ol>
              {timeline.map(([label, date, done], index) => (
                <li className={done ? "is-done" : ""} key={label}>
                  <i>{done ? <FiCheck /> : index + 1}</i>
                  <div>
                    <strong>{label}</strong>
                    <small>
                      {date
                        ? new Date(date).toLocaleString("en-IN", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : done
                          ? "Complete"
                          : "Pending"}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <section className="status-card">
            <span>CURRENT STATUS</span>
            <StatusBadge status={job.status} />
            <p>
              {hasRequiredPhotos
                ? "Required service images are complete."
                : "Upload before and after images to unlock completion."}
            </p>
          </section>
        </aside>
      </div>

      {(isStartable || isInProgress || isPaused) && (
        <section className="sticky-job-actions">
          <div>
            <strong>
              {isStartable
                ? "Ready to start"
                : hasRequiredPhotos
                  ? "Ready for completion"
                  : "Service in progress"}
            </strong>
            <small>
              {isStartable
                ? "Start this assigned job to continue the completion workflow."
                : hasRequiredPhotos
                  ? "All required images have been saved."
                  : "Before and after photos are required."}
            </small>
          </div>
          <div>
            {isStartable ? (
              <button
                onClick={() => act("start")}
                disabled={busyAction === "start"}
              >
                <FiActivity />{" "}
                {busyAction === "start" ? "Starting…" : "Start job"}
              </button>
            ) : isPaused ? (
              <button
                onClick={() => act("resume")}
                disabled={busyAction === "resume"}
              >
                <FiClock /> Resume work
              </button>
            ) : (
              <button
                className="secondary"
                onClick={() => act("pause")}
                disabled={busyAction === "pause"}
              >
                <FiClock /> Pause
              </button>
            )}
            {isInProgress && hasRequiredPhotos && (
              <button
                className="complete-action"
                onClick={() => {
                  if (!slideComplete) {
                    setSlideComplete(true);
                    setTimeout(() => {
                      act("done");
                      setSlideComplete(false);
                    }, 400);
                  }
                }}
                disabled={busyAction === "done"}
              >
                <FiSend />{" "}
                {slideComplete || busyAction === "done"
                  ? "Requesting OTP…"
                  : "Complete job"}
              </button>
            )}
            <button
              className="danger outline-danger"
              onClick={() => {
                const reason = window.prompt("Cancellation reason");
                if (reason) act("cancel", { reason });
              }}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
export default App;
