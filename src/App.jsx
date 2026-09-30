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
  FiMessageCircle,
  FiLifeBuoy,
  FiZap,
  FiChevronRight,
  FiChevronLeft,
  FiMap,
  FiArrowRight,
  FiLock,
  FiMail,
  FiShield,
} from "react-icons/fi";
import * as client from "./api";
import JobWork from "./JobWork";
import { clearRequestIfMatching, isRequestExpired, requestExpiryTime } from "./requestState";
import { getAlertPattern } from "./alertSounds";
import "./partnerPlanning.css";
const tokenKey = "localpintu-technician-token";
const technicianKey = "localpintu-technician";
const alertSettingsKey = "localpintu-technician-alert-settings";
const defaultAlertSettings = { muted: false, language: "en-IN", sound: "classic-bell" };
const money = (v) => `\u20B9${Number(v || 0).toLocaleString("en-IN")}`;
const jobValue = (job) => Number(job?.paymentSummary?.payable ?? job?.paymentSummary?.totalAmount ?? job?.servicePlanId?.offerPrice ?? job?.servicePlanId?.price ?? 0);
const firstName = (name) => String(name || "Customer").trim().split(/\s+/)[0] || "Customer";
const TechnicianAvatar = ({ src, name }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const initial = firstName(name).charAt(0).toUpperCase();
  return (
    <span className="technician-avatar" aria-label={`${name || "Partner"} profile photo`}>
      {src && !imageFailed ? (
        <img src={src} alt="" onError={() => setImageFailed(true)} />
      ) : (
        <span className="technician-avatar-fallback" aria-hidden="true">{initial}</span>
      )}
    </span>
  );
};
const distanceKm = (from, to) => {
  if (!Array.isArray(from) || from.length < 2 || !Number.isFinite(Number(to?.latitude)) || !Number.isFinite(Number(to?.longitude))) return null;
  const rad = (value) => (Number(value) * Math.PI) / 180;
  const lat1 = rad(from[1]); const lat2 = rad(to.latitude);
  const latDelta = lat2 - lat1; const lngDelta = rad(to.longitude) - rad(from[0]);
  const unit = Math.sin(latDelta / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(unit), Math.sqrt(1 - unit));
};
const jobDestination = (job) => Number.isFinite(Number(job?.customerLocation?.latitude)) && Number.isFinite(Number(job?.customerLocation?.longitude))
  ? `${job.customerLocation.latitude},${job.customerLocation.longitude}` : String(job?.customer?.address || "").trim();
const mapsLink = (job) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(jobDestination(job))}`;
const paymentDetails = (job) => {
  const method = String(job?.paymentMethod || "Cash on Service (COD)").trim() || "Cash on Service (COD)";
  const paid = job?.paymentStatus === "Paid";
  const isCod = /cash|cod/i.test(method);
  return {
    method,
    paid,
    label: paid ? `Already paid · ${method}` : (isCod ? "Cash to collect after service (COD)" : `Payment pending · ${method}`),
  };
};
const MAX_JOB_PHOTOS = 8;
const MAX_JOB_PHOTO_DATA_LENGTH = 12 * 1024 * 1024;
const readDocumentImage = (file) => new Promise((resolve, reject) => {
  if (!file?.type?.startsWith("image/")) return reject(new Error("Please choose a JPG, PNG or WebP image."));
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("This document could not be read."));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error("This document image could not be opened."));
    image.onload = () => {
      const limit = 1800;
      const scale = Math.min(1, limit / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});
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
    token: sessionStorage.getItem(tokenKey),
    technician: JSON.parse(localStorage.getItem(technicianKey) || "null"),
  }));
  const login = (data) => {
    sessionStorage.setItem(tokenKey, data.token);
    persist(data.technician, setSession);
    setSession({ token: data.token, technician: data.technician });
  };
  const clear = useCallback(() => {
    sessionStorage.removeItem(tokenKey);
    localStorage.removeItem(technicianKey);
    setSession({ token: null, technician: null });
  }, []);
  useEffect(() => {
    // Tokens saved by older builds were persistent. Remove that legacy copy
    // so closing the browser tab ends the technician session.
    localStorage.removeItem(tokenKey);
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

function AuthFrame({ eyebrow, title, subtitle, children }) {
  return (
    <main className="login auth-experience auth-experience--form-only">
      <section className="auth-form-side">
        <div className="auth-card-shell">
          <div className="auth-mobile-brand">
            <img src="/localpintu-logo-orange.webp" alt="LocalPintu" />
            <div><strong>LOCALPINTU</strong><small>PARTNER</small></div>
          </div>
          <header className="auth-card-heading">
            <span>{eyebrow}</span>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </header>
          {children}
          <footer><FiShield /> Protected partner access</footer>
        </div>
      </section>
    </main>
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
      const result = await client.login({ ...form });
      toast.success("Login successful");
      onLogin(result);
    } catch (x) {
      const message = x.message === "Invalid credentials"
        ? "Email/mobile number or password is incorrect."
        : x.message || "Unable to sign in. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      // Never keep a submitted password in component state after a request.
      setForm((current) => ({ ...current, password: "" }));
      setSubmitting(false);
    }
  };
  return (
    <AuthFrame eyebrow="PARTNER PORTAL" title="Welcome back" subtitle="Sign in to manage your jobs and earnings.">
      <form className="auth-form auth-form--login" onSubmit={submit}>
        {error && <div className="error">{error}</div>}
        <label className="auth-login-field">
          <span>Email or mobile</span>
          <div><FiMail aria-hidden="true" /><input
            required
            autoComplete="username"
            placeholder="Enter email or mobile number"
            value={form.emailOrMobile}
            onChange={(e) =>
              setForm({ ...form, emailOrMobile: e.target.value })
            }
          /></div>
        </label>
        <label className="auth-login-field">
          <span>Password</span>
          <div><FiLock aria-hidden="true" /><input
            type="password"
            required
            autoComplete="current-password"
            placeholder="Enter your password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          /></div>
        </label>
        <button disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in..." : <>Sign in to workspace <FiArrowRight aria-hidden="true" /></>}
        </button>
        
      </form>
    </AuthFrame>
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
  const availabilityChangeRef = useRef(false);
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
  const saveAlertSettings = useCallback((changes) => {
    const next = { ...alertSettingsRef.current, ...changes };
    alertSettingsRef.current = next;
    setAlertSettings(next);
    client.updateMe({ alertPreferences: next })
      .then((technician) => setSession((current) => ({ ...current, technician })))
      .catch((error) => toast.error(error.message || "Could not save alert settings"));
  }, []);

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
  const playNotificationSound = useCallback((options = {}) => {
    try {
      const settings = alertSettingsRef.current;
      if (settings.muted && !options.force) return;
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
      if (options.voice !== false && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const hindi = settings.language === "hi-IN";
        const hinglish = settings.language === "hi-Latn";
        const message = new SpeechSynthesisUtterance(hindi
          ? "आपके पास नई सर्विस रिक्वेस्ट आई है। कृपया रिक्वेस्ट चेक करके स्वीकार करें।"
          : hinglish
            ? "Aapke paas new service request aayi hai. Please check karke accept karein."
            : "You have a new service request. Please check and accept the request.");
        message.lang = hinglish ? "en-IN" : settings.language;
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
      const requestData = { ...data, uiExpiresAt: data.expiresAt || data.technicianRequestExpiresAt || new Date(Date.now() + 30000).toISOString() };
      if (isRequestExpired(requestData)) return;
      setRequest(requestData);
      setCountdown(Math.max(0, Math.ceil((requestExpiryTime(requestData) - Date.now()) / 1000)));
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
      localPanel ? "http://localhost:5031" : (import.meta.env.VITE_SOCKET_URL || "https://localpintu-backend.onrender.com"),
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
      // Only the API interceptor logs out on a real 401.  Logging out here
      // turned a temporary timeout/offline transition into a forced logout.
      .catch((error) => {
        if (error.status !== 401) showNotice("Could not refresh your profile. Your session is still active.");
      });

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
      if (!pending || isRequestExpired(pending)) return;
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
    // Socket delivery is immediate; this is only a recovery path after a
    // phone wakes or reconnects.  Avoid repeatedly loading the full job list
    // on constrained mobile connections.
    const interval = setInterval(syncRequestedJob, 45000);
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
    const bookingId = request._id;
    const expiresAt = requestExpiryTime(request) || Date.now() + 30000;
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0) {
        setRequest((current) => clearRequestIfMatching(current, bookingId));
        if (countdownRef.current) clearInterval(countdownRef.current);
      }
    };
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
    if (availabilityChangeRef.current || status === session.technician?.availabilityStatus) return;
    const previous = session.technician;
    const currentStatus = status === "Available" ? "Online" : status === "Busy" ? "Busy" : "Offline";
    // Reflect a technician's explicit online/offline choice immediately.
    // The request still runs in the background and the old value is restored
    // if it cannot be saved.
    availabilityChangeRef.current = true;
    persist({ ...previous, availabilityStatus: status, currentStatus }, setSession);
    try {
      persist(await client.updateAvailability(status), setSession);
    } catch (e) {
      persist(previous, setSession);
      showNotice(e.message);
    } finally {
      availabilityChangeRef.current = false;
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
      <aside className={mobileNavOpen ? "mobile-open" : ""} aria-label="Partner navigation">
        <button
          type="button"
          className="mobile-menu-close"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation menu"
        >
          <FiX />
        </button>
        <div className="brand">
          <img className="brand-logo" src="/localpintu-logo-orange.webp" alt="LocalPintu logo" />
          <small>PARTNER</small>
        </div>
        <nav>
          {[
            ["/", FiHome, "Dashboard"],
            ["/jobs", FiBriefcase, "Jobs"],
            ["/calendar", FiCalendar, "Calendar"],
            ["/hubs", FiMap, "My hubs"],
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
            <TechnicianAvatar src={session.technician?.profileImage} name={session.technician?.fullName} />
            <p>Good day,</p>
            <h1>{session.technician?.fullName || "Partner"}</h1>
          </div>
          <div className="header-icon-actions">
            <label className="quick-alert-language" title="Spoken request alert language">
              <span className="sr-only">Request alert language</span>
              <select value={alertSettings.language} onChange={(event) => saveAlertSettings({ language: event.target.value })} aria-label="Request alert language">
                <option value="en-IN">English</option>
                <option value="hi-IN">हिन्दी</option>
                <option value="hi-Latn">Hinglish</option>
              </select>
            </label>
            <button
              type="button"
              className={`alert-sound-toggle ${alertSettings.muted ? "is-muted" : ""}`}
              onClick={() => saveAlertSettings({ muted: !alertSettingsRef.current.muted })}
              aria-label={alertSettings.muted ? "Unmute booking request sound" : "Mute booking request sound"}
              aria-pressed={!alertSettings.muted}
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
          <Route index element={<Dashboard technician={session.technician} setAvailability={setAvailability} />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="hubs" element={<Hubs technician={session.technician} />} />
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
                updateAlertSettings={saveAlertSettings}
                testAlertSound={() => playNotificationSound({ voice: false, force: true })}
              />
            }
          />
        </Routes>
      </main>

      <nav className="technician-bottom-nav" aria-label="Mobile partner navigation">
        {[
          ["/", FiHome, "Home"],
          ["/jobs", FiBriefcase, "Jobs"],
          ["/calendar", FiCalendar, "Plan"],
          ["/hubs", FiMap, "Hubs"],
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
              disabled={responding || countdown === 0}
              onClick={() => respond("reject")}
            >
              <FiX /> Reject
            </button>
            <button className="accept-btn" disabled={responding || countdown === 0} onClick={() => respond("accept")}>
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

function Dashboard({ technician, setAvailability }) {
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { client.dashboard().then(setDash).catch((e) => setError(e.message)).finally(() => setLoading(false)); }, []);
  if (loading) return <PanelSkeleton cards={4} />;
  if (error) return <section className="panel"><EmptyState icon={FiAlertCircle} title="Home unavailable" text={error} /></section>;
  const active = dash?.currentJob || null;
  const upcoming = dash?.upcomingJobs || [];
  const zone = technician?.primaryServiceArea?.name || technician?.pincode || technician?.city || "your service zone";
  const km = active && distanceKm(technician?.currentLocation?.coordinates, active.customerLocation);
  return <div className="dashboard-page action-home">
    <section className="action-greeting"><div className="greeting-copy"><span>{new Date().getHours() < 12 ? "GOOD MORNING" : new Date().getHours() < 17 ? "GOOD AFTERNOON" : "GOOD EVENING"}</span><h2>{firstName(technician?.fullName)}, you are {technician?.availabilityStatus === "Available" ? "online" : "currently unavailable"}</h2><p><i /> {technician?.availabilityStatus || "Unavailable"} · {zone}</p></div><div className="greeting-profile">{technician?.profileImage ? <img src={technician.profileImage} alt={`${technician.fullName} profile`} /> : <FiUser />}<small>ADMIN VERIFIED</small></div><button className="availability-quick" onClick={() => setAvailability(technician?.availabilityStatus === "Available" ? "Unavailable" : "Available")}><FiActivity /> {technician?.availabilityStatus === "Available" ? "Go offline" : "Go online"}</button></section>
    <section className="next-priority-card"><div className="eyebrow"><FiZap /> NEXT PRIORITY JOB</div>{active ? <><div className="priority-job-main"><div><h3>{firstName(active.customer?.name)} · {active.applianceServiceId?.title || "Service job"}</h3><p>{active.servicePlanId?.title || "Standard plan"} · {active.timeSlot || "Time to be confirmed"}</p><span>{km == null ? "Route available" : `${km.toFixed(1)} km away`} · ETA {active.technicianEtaMinutes || (km == null ? "—" : `${Math.max(8, Math.round(km * 5))} min`)}</span></div><strong>{money(jobValue(active))}</strong></div><div className="priority-actions"><a className="nav-btn" href={mapsLink(active)} target="_blank" rel="noreferrer"><FiNavigation /> Start navigation</a><NavLink className="secondary route-link" to={`/job/${active._id}`}>View job <FiChevronRight /></NavLink></div></> : <EmptyState icon={FiBriefcase} title="No priority job right now" text="Stay online and share live location to receive nearby work." />}</section>
    <section className="today-strip"><div><small>TODAY</small><strong>{dash?.completedToday || 0} completed</strong></div><div><small>EARNED</small><strong>{money(dash?.todayEarnings)}</strong></div><div><small>PENDING</small><strong>{money(dash?.pendingEarnings)}</strong></div></section>
    <section className="smart-actions"><div className="section-heading"><div><span>SMART ACTIONS</span><h2>Keep your day moving</h2></div></div><div className="smart-action-grid"><button onClick={() => setAvailability("Available")}><FiCheckCircle /> Go online</button><button onClick={() => setAvailability("Unavailable")}><FiClock /> Availability</button><NavLink to="/jobs"><FiMap /> My route</NavLink></div></section>
    <section className="home-two-col"><article className="panel"><div className="section-heading"><div><span>UPCOMING</span><h2>Today’s schedule</h2></div><NavLink to="/jobs">All jobs</NavLink></div>{upcoming.length ? upcoming.map((job) => <NavLink className="upcoming-item" to={`/job/${job._id}`} key={job._id}><span><FiClock /></span><div><strong>{job.timeSlot || new Date(job.bookingDate).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</strong><small>{job.applianceServiceId?.title || "Service job"} · {firstName(job.customer?.name)}</small></div><FiChevronRight /></NavLink>) : <p className="muted-copy">No more assigned jobs today.</p>}</article><article className="panel status-summary"><span>YOUR STATUS</span><div><strong><FiStar /> {Number(dash?.rating || 0).toFixed(1)}</strong><strong>{Math.round(dash?.acceptanceRate || 0)}% acceptance</strong></div><p>{(dash?.rating || 0) >= 4.5 ? "Gold tier" : "Keep completing great work to reach Gold tier"}</p></article></section>
  </div>;
}

function Calendar() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  useEffect(() => { client.schedule().then(setData).catch((requestError) => setError(requestError.message)); }, []);
  if (!data && !error) return <PanelSkeleton cards={4} />;
  const plan = data?.schedule || {};
  const weekdays = ["S", "M", "T", "W", "T", "F", "S"];
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(first); gridStart.setDate(first.getDate() - first.getDay());
  const dates = Array.from({ length: 42 }, (_, index) => { const date = new Date(gridStart); date.setDate(gridStart.getDate() + index); return date; });
  const statusFor = (date) => {
    const key = date.toDateString();
    const jobs = (data?.jobs || []).filter((job) => new Date(job.bookingDate).toDateString() === key);
    const leave = (data?.leaves || []).find((item) => item.status === "Approved" && new Date(item.startDate) <= date && new Date(item.endDate) >= date);
    const weeklyOff = (plan.recurringWeeklyOff || []).includes(date.getDay());
    return { jobs, state: leave ? "leave" : jobs.length ? "booked" : weeklyOff ? "off" : "available" };
  };
  const currentDates = dates.filter((date) => date.getMonth() === month.getMonth());
  const offDays = currentDates.filter((date) => statusFor(date).state === "off").length;
  const availableDays = currentDates.filter((date) => statusFor(date).state === "available").length;
  return <div className="partner-planning-page">
    <section className="partner-month-card">
      <header className="partner-month-top"><button type="button" onClick={() => history.back()} aria-label="Go back"><FiChevronLeft /></button><span>Work calendar</span><button type="button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button></header>
      <div className="partner-month-switch"><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month"><FiChevronLeft /></button><h2>{month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h2><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month"><FiChevronRight /></button></div>
      <div className="partner-weekdays">{weekdays.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="partner-month-grid">{dates.map((date) => { const status = statusFor(date); const outside = date.getMonth() !== month.getMonth(); const today = date.toDateString() === new Date().toDateString(); return <article key={date.toISOString()} data-state={status.state} className={`${outside ? "is-outside" : ""} ${today ? "is-today" : ""}`}><strong>{date.getDate()}</strong><span>{status.state === "booked" ? <FiClock /> : status.state === "available" ? <FiCheck /> : <FiX />}</span>{status.jobs.length > 1 ? <small>{status.jobs.length}</small> : null}</article>; })}</div>
      <button type="button" className="calendar-disclosure" onClick={() => setGlossaryOpen((value) => !value)}>Glossary <FiChevronRight className={glossaryOpen ? "is-open" : ""} /></button>
      {glossaryOpen && <div className="calendar-glossary"><span><i data-state="available"><FiCheck /></i>Available</span><span><i data-state="booked"><FiClock /></i>Booked</span><span><i data-state="off"><FiX /></i>Weekly off</span><span><i data-state="leave"><FiX /></i>Leave</span></div>}
      <div className="break-balance"><span>Monthly availability</span><div><strong>{offDays}<small>Weekly break days</small></strong><strong>{availableDays}<small>Available work days</small></strong></div></div>
      <div className="calendar-primary-actions"><a href="#work-plan">Manage work plan</a><a href="#leave-history">View history</a></div>
    </section>
    {error ? <p className="error">{error}</p> : null}
    <details className="planning-settings" id="work-plan"><summary>Work plan, breaks and leave <FiChevronRight /></summary><LegacyCalendar /></details>
  </div>;
}

function LegacyCalendar() {
  const [data, setData] = useState(null); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [plan, setPlan] = useState({ shiftStart: "09:00", shiftEnd: "18:00", halfDay: "None", recurringWeeklyOff: [], peakHoursOptIn: false });
  const [leave, setLeave] = useState({ startDate: "", endDate: "", leaveType: "Leave", reason: "" });
  const load = () => client.schedule().then((result) => { setData(result); setPlan((current) => ({ ...current, ...(result.schedule || {}) })); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const savePlan = async (event) => { event.preventDefault(); try { await client.updateSchedule(plan); setMessage("Weekly work plan saved."); load(); } catch (e) { setMessage(e.message); } };
  const submitLeave = async (event) => { event.preventDefault(); try { const result = await client.requestLeave(leave); setMessage(result.message); setLeave({ startDate: "", endDate: "", leaveType: "Leave", reason: "" }); load(); } catch (e) { setMessage(e.message); } };
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (!data && !error) return <PanelSkeleton cards={4} />;
  return <div className="calendar-page"><section className="panel"><div className="section-heading"><div><span>WEEKLY WORK PLAN</span><h2>Availability & calendar</h2></div><button className="icon-button" onClick={load}><FiRefreshCw /></button></div><p className="muted-copy">Available, booked and leave periods automatically protect your work plan from new assignments.</p><form className="schedule-form" onSubmit={savePlan}><label>Shift starts<input type="time" value={plan.shiftStart} onChange={(e) => setPlan({ ...plan, shiftStart: e.target.value })} /></label><label>Shift ends<input type="time" value={plan.shiftEnd} onChange={(e) => setPlan({ ...plan, shiftEnd: e.target.value })} /></label><label>Half-day break<select value={plan.halfDay} onChange={(e) => setPlan({ ...plan, halfDay: e.target.value })}><option>None</option><option>Morning</option><option>Afternoon</option></select></label><label className="peak-toggle"><input type="checkbox" checked={Boolean(plan.peakHoursOptIn)} onChange={(e) => setPlan({ ...plan, peakHoursOptIn: e.target.checked })} /> Work 6–9 PM · unlock 1.15× incentive</label><div className="week-off-row"><span>Recurring weekly off</span>{days.map((day, index) => <label key={day}><input type="checkbox" checked={(plan.recurringWeeklyOff || []).includes(index)} onChange={() => setPlan({ ...plan, recurringWeeklyOff: (plan.recurringWeeklyOff || []).includes(index) ? plan.recurringWeeklyOff.filter((value) => value !== index) : [...(plan.recurringWeeklyOff || []), index] })} /> {day}</label>)}</div><button>Save work plan</button></form></section>
    {data?.recommendation && <section className="route-recommendation"><FiNavigation /><div><span>SMART ROUTE FOR TOMORROW</span><strong>You have {data.recommendation.jobCount} jobs across {data.recommendation.routeKm} km.</strong><p>Suggested start: {data.recommendation.suggestedStartTime}. Route can save approximately {data.recommendation.estimatedMinutesSaved} minutes.</p></div></section>}
    <section className="calendar-grid">{Array.from({ length: 7 }, (_, offset) => { const date = new Date(); date.setDate(date.getDate() + offset); const key = date.toDateString(); const jobs = (data?.jobs || []).filter((job) => new Date(job.bookingDate).toDateString() === key); const leaveState = (data?.leaves || []).find((item) => item.status === "Approved" && new Date(item.startDate) <= date && new Date(item.endDate) >= date); const weeklyOff = (plan.recurringWeeklyOff || []).includes(date.getDay()); const unavailable = weeklyOff || plan.halfDay !== "None"; const state = leaveState ? (leaveState.leaveType === "Emergency Leave" ? "emergency" : "leave") : jobs.length ? "booked" : unavailable ? "unavailable" : "available"; return <article className="day-plan" key={key} data-state={state}><span>{date.toLocaleDateString("en-IN", { weekday: "short" })}</span><strong>{date.getDate()}</strong><small>{leaveState ? leaveState.leaveType : jobs.length ? `${jobs.length} booked job${jobs.length > 1 ? "s" : ""}` : weeklyOff ? "Weekly off" : plan.halfDay !== "None" ? `${plan.halfDay} break` : "Available"}</small>{jobs.map((job) => <NavLink to={`/job/${job._id}`} key={job._id}>{job.timeSlot} · {job.applianceServiceId?.title || "Service"}</NavLink>)}{jobs.length > 1 && <em>Travel block · route buffer</em>}</article>; })}</section>
    <section className="panel"><div className="section-heading"><div><span>TIME OFF</span><h2>Request leave</h2></div></div><form className="leave-form" onSubmit={submitLeave}><label>Start<input required type="date" min={new Date().toISOString().slice(0, 10)} value={leave.startDate} onChange={(e) => setLeave({ ...leave, startDate: e.target.value })} /></label><label>End<input required type="date" min={leave.startDate || new Date().toISOString().slice(0, 10)} value={leave.endDate} onChange={(e) => setLeave({ ...leave, endDate: e.target.value })} /></label><label>Type<select value={leave.leaveType} onChange={(e) => setLeave({ ...leave, leaveType: e.target.value })}><option>Leave</option><option>Emergency Leave</option></select></label><label className="wide">Reason<textarea required minLength="3" value={leave.reason} onChange={(e) => setLeave({ ...leave, reason: e.target.value })} /></label><button>Request leave</button></form>{message && <p className="schedule-message">{message}</p>}<div className="leave-list">{(data?.leaves || []).slice().reverse().map((item) => <div key={item._id}><strong>{item.leaveType} · {item.status}</strong><span>{new Date(item.startDate).toLocaleDateString("en-IN")} – {new Date(item.endDate).toLocaleDateString("en-IN")}</span><small>{item.reason}</small></div>)}</div></section></div>;
}

function Hubs({ technician }) {
  const services = (technician?.skills || []).filter(Boolean);
  const [service, setService] = useState(services[0] || "Home services");
  const city = technician?.city || "Your city";
  const pincode = technician?.pincode || "Pincode pending";
  const mapQuery = encodeURIComponent([city, /^\d{6}$/.test(pincode) ? pincode : "", technician?.state || "India"].filter(Boolean).join(", "));
  const namedAreas = [technician?.primaryServiceArea, ...(technician?.secondaryServiceAreas || [])]
    .map((area) => typeof area === "object" ? area?.name : "")
    .filter(Boolean);
  const hubs = namedAreas.length ? namedAreas : [`${city} · ${pincode}`];
  const isAvailable = technician?.availabilityStatus === "Available" || technician?.isAvailable === true;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
  return <div className="partner-hubs-page"><section className="hub-shell">
    <header><div><span>MY SERVICE NETWORK</span><h2>My hubs</h2></div><label><span className="sr-only">Service</span><select value={service} onChange={(event) => setService(event.target.value)}>{(services.length ? services : ["Home services"]).map((item) => <option key={item}>{item}</option>)}</select></label></header>
    <div className="hub-tabs">{hubs.map((hub, index) => <button type="button" className={index === 0 ? "active" : ""} key={hub}>{hub}</button>)}</div>
    <div className="hub-status-row"><span className={isAvailable ? "is-live" : "is-paused"}><i />{isAvailable ? "Available for leads" : "Lead matching paused"}</span><strong>{hubs.length} coverage {hubs.length === 1 ? "area" : "areas"}</strong></div>
    <div className="hub-map hub-real-map"><iframe title={`Service coverage map for ${city} ${pincode}`} src={`https://www.google.com/maps?q=${mapQuery}&z=13&output=embed`} loading="eager" referrerPolicy="no-referrer-when-downgrade" allowFullScreen/><div className="hub-map-label"><small>ACTIVE COVERAGE</small><strong>{city}</strong><span>{pincode} · {service}</span></div><a className="hub-open-map" href={mapsUrl} target="_blank" rel="noreferrer"><FiNavigation/>Open full map</a></div>
    <div className="hub-summary"><article><FiMapPin/><div><small>Primary city</small><strong>{city}</strong></div></article><article><FiNavigation/><div><small>Active pincode</small><strong>{pincode}</strong></div></article><article><FiBriefcase/><div><small>Service</small><strong>{service}</strong></div></article></div>
    <section className="hub-match-flow"><span>HOW LEADS REACH YOU</span><div><article><b>1</b><strong>Customer location</strong><small>Booking pincode is checked.</small></article><article><b>2</b><strong>Skill match</strong><small>{service} is matched to your profile.</small></article><article><b>3</b><strong>Live request</strong><small>You receive the request when available.</small></article></div></section>
    <section className="hub-help"><span>NEED HELP?</span><h3>Understanding your hub</h3><details><summary>What is a hub?<FiChevronRight/></summary><p>Your hub is the city and pincode coverage configured for your profile. Matching jobs from this service network can reach you when you are available.</p></details><details><summary>Why am I receiving leads outside my hub?<FiChevronRight/></summary><p>Nearby jobs may appear when your assigned area overlaps another active pincode or when admin dispatches a suitable job manually.</p></details><details><summary>How can I change my coverage?<FiChevronRight/></summary><p>Update your city and pincode in Profile. Admin assigned areas continue to appear here automatically.</p></details></section>
  </section></div>;
}

function LegacyDashboard() {
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
  const [tab, setTab] = useState("Today");
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
  const reportLate = async (job) => {
    const newEtaMinutes = Number(window.prompt("New ETA in minutes", String(job.technicianEtaMinutes || 20)));
    if (!newEtaMinutes) return;
    const reason = window.prompt("Reason for the delay (shared with customer)");
    if (!reason) return;
    await act(job, "late", { newEtaMinutes, reason });
  };
  const requestSupport = async (job) => {
    const category = window.prompt("Support type: Customer, Payment, Parts, Safety, Technical or Other", "Other") || "Other";
    const message = window.prompt("Describe what you need help with");
    if (!message) return;
    await act(job, "support", { category, message });
    alert("Support request sent to LocalPintu operations.");
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
  const isToday = (job) => new Date(job.bookingDate).toDateString() === new Date().toDateString();
  const tabDefinitions = [
    ["New requests", (job) => job.technicianAssignmentStatus === "Requested"],
    ["Today", (job) => isToday(job) && !["Completed", "Cancelled"].includes(job.status)],
    ["In progress", (job) => ["In Progress", "Paused", "Waiting For OTP Verification"].includes(job.status)],
    ["Follow-up", (job) => job.status === "Paused" || Boolean(job.technicianLateNotice?.notifiedAt) || (job.supportRequests || []).some((request) => request.status === "Open")],
    ["Completed", (job) => job.status === "Completed"],
    ["Cancelled", (job) => job.status === "Cancelled"],
  ];
  const visibleJobs = jobs.filter(tabDefinitions.find(([name]) => name === tab)?.[1] || (() => true));
  return (
    <section className="panel">
      <div className="section-heading"><div><span>MY WORK</span><h2>Jobs ({visibleJobs.length})</h2></div><button className="icon-button" onClick={load} title="Refresh jobs"><FiRefreshCw /></button></div>
      <div className="job-tabs" role="tablist" aria-label="Filter jobs">{tabDefinitions.map(([name, predicate]) => <button key={name} role="tab" aria-selected={tab === name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}>{name}<b>{jobs.filter(predicate).length}</b></button>)}</div>
      {visibleJobs.length === 0 ? <EmptyState title={`No ${tab.toLowerCase()} jobs`} text="New work and updates will appear here." /> : visibleJobs.map((j) => {
        const payment = paymentDetails(j);
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
              <p>{firstName(j.customer?.name)} · {j.applianceServiceId?.title} - {j.servicePlanId?.title}</p>
              <div className="job-operation-row"><span data-urgency={j.urgency || "Normal"}><FiZap /> {j.urgency || "Normal"}</span><span><FiMapPin /> {Number.isFinite(Number(j.distanceMeters)) ? `${(Number(j.distanceMeters) / 1000).toFixed(1)} km · ` : ""}{j.technicianEtaMinutes ? `ETA ${j.technicianEtaMinutes} min` : j.timeSlot}</span><span>Expected earning {money(jobValue(j))}</span></div>
              <div className={`job-payment ${payment.paid ? "is-paid" : "is-due"}`}>
                <FiCreditCard />
                <span>{payment.paid ? "Paid online" : (/cash|cod/i.test(j.paymentMethod || "") ? `Collect ${money(jobValue(j))} cash` : "Payment pending")}</span>
              </div>
              {j.customer?.problemDescription && <p className="issue-summary"><FiInfo /> {j.customer.problemDescription}</p>}
              {(j.requiredTools?.length || j.sparePartsHint) && <p className="tools-hint"><FiTool /> {j.requiredTools?.join(", ") || "Tools to confirm"}{j.sparePartsHint ? ` · Parts: ${j.sparePartsHint}` : ""}</p>}
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
              {showPhone && j.customer?.mobileNumber && <a className="call-btn" href={`https://wa.me/91${String(j.customer.mobileNumber).replace(/\D/g, "").replace(/^91/, "")}`} target="_blank" rel="noreferrer" title="WhatsApp customer"><FiMessageCircle /></a>}
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
                  <NavLink className="secondary" to={`/job/${j._id}#job-pause`}>Pause with reason</NavLink>
                  <NavLink className="primary route-link" to={`/job/${j._id}`}>Open completion <FiChevronRight /></NavLink>
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
                <><button className="secondary" onClick={() => reportLate(j)}><FiClock /> I will be late</button><button className="secondary" onClick={() => requestSupport(j)}><FiLifeBuoy /> Need support</button><button className="danger" onClick={() => act(j, "cancel", { reason: window.prompt("Cancellation reason") || "" })}>Cancel</button></>
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
    <div className="wallet-page-premium">
      <header className="wallet-page-title"><div><span>PARTNER FINANCE</span><h2>Wallet & credits</h2><p>Track earnings, lead credits and settlements in one place.</p></div><FiCreditCard /></header>
      <section className="stats wallet-balance-stats">
        <Stat label="Available" value={money(data?.wallet?.balance)} />
        <Stat
          label="Pending settlement"
          value={money(data?.wallet?.pendingAmount)}
        />
      </section>
      <CreditWallet />
      <section className="panel wallet-withdraw-panel">
        <div className="wallet-section-title"><div><span>EARNINGS</span><h2>Withdraw funds</h2><p>Transfer available earnings to your registered payout account.</p></div><FiSend /></div>
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
      <section className="panel wallet-transaction-panel">
        <div className="wallet-section-title"><div><span>ACTIVITY</span><h2>Transaction history</h2></div><FiActivity /></div>
        {data?.transactions?.length ? data.transactions.map((x) => (
          <div className="job" key={x._id}>
            <strong>{x.type}</strong>
            <span>
              {money(x.amount)} - {x.status}
              {x.rejectionReason ? ` - ${x.rejectionReason}` : ""}
            </span>
          </div>
        )) : <p className="wallet-empty-state">No earnings transactions yet.</p>}
      </section>
    </div>
  );
}

const razorpayReady = () => new Promise((resolve, reject) => {
  if (window.Razorpay) return resolve();
  const script = document.createElement("script"); script.src = "https://checkout.razorpay.com/v1/checkout.js"; script.async = true; script.onload = resolve; script.onerror = () => reject(new Error("Razorpay could not load.")); document.head.appendChild(script);
});
function CreditWallet() {
  const [data, setData] = useState(null); const [leads, setLeads] = useState([]); const [error, setError] = useState(""); const [busy, setBusy] = useState("");
  const load = useCallback(async () => { try { const [walletData, leadData] = await Promise.all([client.creditWallet(), client.creditLeads()]); setData(walletData); setLeads(leadData); setError(""); } catch (requestError) { setError(requestError.message || "Could not load credits."); } }, []);
  useEffect(() => { load(); }, [load]);
  const buy = async (pkg) => { try { setBusy(`buy-${pkg._id}`); const order = await client.createCreditRazorpayOrder(pkg._id); await razorpayReady(); new window.Razorpay({ key: order.key, amount: order.amount, currency: order.currency, name: "LocalPintu Credits", description: `${pkg.credits} lead credits`, order_id: order.orderId, theme: { color: "#50345c" }, handler: async (response) => { try { await client.verifyCreditRazorpayPayment({ paymentId: order.paymentId, ...response }); toast.success(`${pkg.credits} credits added securely.`); load(); } catch (verificationError) { toast.error(verificationError.message || "Payment verification is pending."); } finally { setBusy(""); } }, modal: { ondismiss: () => setBusy("") } }).open(); } catch (requestError) { toast.error(requestError.message || "Could not start credit payment."); setBusy(""); } };
  const unlock = async (lead) => { try { setBusy(`lead-${lead._id}`); const result = await client.unlockCreditLead(lead._id); toast.success(`Lead unlocked. ${result.balance} credits remain.`); load(); } catch (requestError) { toast.error(requestError.message); } finally { setBusy(""); } };
  if (!data?.wallet?.creditSystemEnabled) return <section className="credit-wallet credit-wallet-disabled"><div className="credit-disabled-icon"><FiCreditCard /></div><div><span>LOCALPINTU CREDITS</span><h2>Credit leads are not active yet</h2><p>Your account is currently on direct job assignment, so no credit pack is needed. Ask your admin to enable Credit-Based Lead System if you want to receive paid unlockable leads here.</p></div><span className="credit-disabled-status"><FiCheckCircle /> Direct assignment active</span></section>;
  const availableLeads = leads.filter((lead) => lead.status === "Available");
  return <section className="panel credit-wallet-panel">
    <div className="credit-wallet-head"><div><span>LOCALPINTU CREDITS</span><h2>Lead wallet</h2><p>Use credits only when you choose to unlock a matched service lead. Your earnings remain separate and protected.</p><div className="credit-wallet-pills"><small><FiShield /> Secure payments</small><small><FiZap /> Instant credit update</small></div></div><strong>{Number(data.wallet.balance || 0)} <small>credits available</small></strong></div>
    {error && <p className="credit-wallet-error">{error}</p>}
    <div className="credit-secure-strip"><FiShield /><span><strong>Secure credit checkout</strong><small>UPI · PhonePe · Google Pay · Paytm · Cards · Netbanking</small></span></div>
    {(data.packages || []).length ? <div className="credit-package-grid">{data.packages.map((pkg) => <article key={pkg._id}><small>CREDIT PACK</small><strong>{pkg.credits} credits</strong><span>{money(pkg.price)}</span><button onClick={() => buy(pkg)} disabled={busy === `buy-${pkg._id}`}>{busy === `buy-${pkg._id}` ? "Opening checkout…" : "Buy securely"}</button></article>)}</div> : <div className="credit-pack-empty"><FiCreditCard /><div><strong>No credit packs available</strong><span>Admin can publish credit packs when paid leads are enabled.</span></div></div>}
    <div className="credit-lead-heading"><div><span>AVAILABLE LEADS</span><h3>Matched service requests</h3><p>{availableLeads.length} lead{availableLeads.length === 1 ? "" : "s"} ready to review</p></div><button className="secondary" onClick={load}><FiRefreshCw /> Refresh</button></div>
    {availableLeads.length ? <div className="credit-lead-list">{availableLeads.map((lead) => <article key={lead._id}><div><strong>{lead.bookingId?.childServiceId?.title || lead.bookingId?.applianceServiceId?.title || "Service request"}</strong><span>{lead.bookingId?.bookingDate ? new Date(lead.bookingId.bookingDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "New request"} · {lead.bookingId?.timeSlot || "Time to be confirmed"}</span><small>Unlock to view customer contact and exact address.</small></div><aside><b>{lead.creditCost} credits</b><button onClick={() => unlock(lead)} disabled={busy === `lead-${lead._id}`}>{busy === `lead-${lead._id}` ? "Unlocking…" : "Unlock lead"}</button></aside></article>)}</div> : <p className="credit-empty"><FiCheckCircle /> You are all caught up. New matched leads will appear here.</p>}
    <h3 className="credit-history-title">Credit history</h3><div className="credit-history">{(data.transactions || []).length ? data.transactions.slice(0, 8).map((transaction) => <div key={transaction._id}><span><strong>{transaction.type}</strong><small>{new Date(transaction.createdAt).toLocaleString("en-IN")}{transaction.bookingId?.bookingNumber ? ` · ${transaction.bookingId.bookingNumber}` : ""}</small></span><b className={transaction.direction === "Credit" ? "is-credit" : "is-debit"}>{transaction.direction === "Credit" ? "+" : "−"}{transaction.credits}</b></div>) : <p className="wallet-empty-state">Credit activity will appear here.</p>}</div>
  </section>;
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

function Profile({ technician, update, alertSettings, updateAlertSettings, testAlertSound }) {
  const [form, setForm] = useState(technician || {});
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(null);
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
    readDocumentImage(file).then(async (documentImage) => {
      const documents = { ...(form.documents || {}), [key]: documentImage };
      const next = await client.updateMe({ documents });
      setForm(next);
      update(next);
      setMessage(`${key} uploaded and ready for verification.`);
    }).catch((error) => setMessage(error.message));
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
          <select value={alertSettings.language} onChange={(event) => updateAlertSettings({ language: event.target.value })}>
            <option value="en-IN">English</option>
            <option value="hi-IN">Hindi</option>
            <option value="hi-Latn">Hinglish</option>
          </select>
        </label>
        <label className="alert-sound-field">
          Request sound
          <span className="alert-sound-control"><select value={alertSettings.sound} onChange={(event) => updateAlertSettings({ sound: event.target.value })}>
              <option value="classic-bell">Classic bell</option>
              <option value="double-chime">Double chime</option>
              <option value="urgent-pulse">Urgent pulse</option>
              <option value="soft-chime">Soft chime</option>
              <option value="ring-ring">Loud Ring Ring</option>
            </select><button type="button" onClick={testAlertSound} title="Play selected sound" aria-label="Test selected request sound"><FiVolume2 /> Test sound</button></span>
        </label>
        <label className="alert-mute-toggle">
          <input type="checkbox" checked={alertSettings.muted} onChange={(event) => updateAlertSettings({ muted: event.target.checked })} />
          <span>{alertSettings.muted ? "Request sound and voice muted" : "Request sound and voice enabled"}</span>
        </label>
      </div>

      <h2 className="section-title">Documents</h2>
      <div className="document-grid">
        {docs.map(({ key, label }) => (
          <div className="document-card" key={key}>
            <strong>{label}</strong>
            {form.documents?.[key] ? (
              <><button type="button" className="document-preview-button" onClick={() => setPreview({ src: form.documents[key], label })}><img className="document-preview" src={form.documents[key]} alt={`${label} preview`} /><span>Preview document</span></button></>
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
      {preview ? <div className="document-lightbox" role="dialog" aria-modal="true" aria-label={`${preview.label} preview`} onClick={() => setPreview(null)}><div onClick={(event) => event.stopPropagation()}><button type="button" aria-label="Close document preview" onClick={() => setPreview(null)}><FiX /></button><strong>{preview.label}</strong><img src={preview.src} alt={preview.label} /></div></div> : null}
    </section>
  );
}

function SwipeComplete({ disabled, onComplete }) {
  const [progress, setProgress] = useState(0); const startRef = useRef(null); const doneRef = useRef(false);
  const move = (event) => { if (startRef.current == null) return; const width = event.currentTarget.clientWidth - 58; const next = Math.max(0, Math.min(1, (event.clientX - startRef.current) / Math.max(1, width))); setProgress(next); if (next >= .92 && !doneRef.current) { doneRef.current = true; setProgress(1); onComplete(); } };
  const release = () => { if (!doneRef.current) setProgress(0); startRef.current = null; };
  return <div className={`swipe-complete ${disabled ? "is-disabled" : ""}`} style={{ "--swipe-progress": progress }} onPointerDown={(event) => { if (!disabled) { startRef.current = event.clientX; event.currentTarget.setPointerCapture?.(event.pointerId); } }} onPointerMove={move} onPointerUp={release} onPointerCancel={release} role="button" tabIndex={disabled ? -1 : 0} aria-label="Slide to request customer OTP"><span><FiSend /></span><strong>{disabled ? "Requesting OTP…" : "Slide to request customer OTP"}</strong><FiChevronRight /></div>;
}

function ActiveJob() {
  const { id } = useParams();
  const nav = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [otpVal, setOtpVal] = useState("");
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = () => {
    return client
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
      // A completion OTP can be created but rejected by the SMS provider.
      // Reload to show the Waiting for OTP state and its retry action instead
      // of leaving the technician on an out-of-date In Progress screen.
      load();
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
  const payment = paymentDetails(job);
  const customerDestination = Number.isFinite(Number(job.customerLocation?.latitude)) && Number.isFinite(Number(job.customerLocation?.longitude))
    ? `${job.customerLocation.latitude},${job.customerLocation.longitude}`
    : String(job.customer?.address || "").trim();
  const isStartable =
    job.status === "Assigned" &&
    ["Accepted", "Manual"].includes(job.technicianAssignmentStatus);
  const canUploadPhotos = ["Assigned", "In Progress", "Paused"].includes(
    job.status,
  );
  const hasRequiredPhotos = Boolean(job.technicianCompletionPhoto);
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
    ["Partner assigned", job.assignedAt, Boolean(job.assignedAt)],
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
    ["Partner completion selfie", null, Boolean(job.technicianCompletionPhoto)],
    ["Waiting for OTP", job.completionOtpRequestedAt, isWaiting || isCompleted],
    ["Job completed", job.completedAt, isCompleted],
  ];
  const uploadPhotos = async (field, files) => {
    try {
      const photos = await readJobPhotos(files);
      await act("photos", field === "technicianCompletionPhoto" ? { technicianCompletionPhoto: photos[0] } : { [field]: photos });
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
            <article className={`job-detail-card payment-card ${payment.paid ? "is-paid" : "is-due"}`}>
              <div className="card-title">
                <span><FiCreditCard /></span>
                <div>
                  <small>PAYMENT</small>
                  <h3>{payment.paid ? "Payment received" : "Payment to collect"}</h3>
                </div>
              </div>
              <strong>{payment.paid ? "Already paid" : "Cash due after service"}</strong>
              <p>{payment.method}</p>
              <span className="service-price">{money(Math.max(0, jobValue(job) - (payment.paid ? 0 : Number(job.amountPreviouslyPaid || 0))))}</span>
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
                <span>Partner notes</span>
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

          <JobWork key={job._id} job={job} onChanged={load} />
          {false && <section className="job-section images-section">
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
          </section>}

          <section className="job-section completion-proof-card">
            <div className="section-heading"><div><span>FINAL VERIFICATION</span><h2>Partner completion selfie</h2><p>Your verified profile photo cannot be changed. Capture a fresh selfie at the service location to close this job.</p></div>{job.technicianCompletionPhoto && <span className="upload-success"><FiCheck /> Captured</span>}</div>
            {job.technicianCompletionPhoto ? <img className="completion-selfie" src={job.technicianCompletionPhoto} alt="Partner completion selfie" /> : canUploadPhotos ? <label className="completion-selfie-capture"><FiUser /><strong>Capture completion selfie</strong><span>Use camera or choose one clear photo</span><input type="file" accept="image/*" capture="user" onChange={(event) => uploadPhotos("technicianCompletionPhoto", event.target.files)} /></label> : <p className="muted-copy">Start the job to capture your completion selfie.</p>}
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
                  : "Completion selfie is required."}
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
                onClick={() => document.getElementById("job-pause")?.scrollIntoView({ behavior: "smooth" })}
                disabled={busyAction === "pause"}
              >
                <FiClock /> Pause
              </button>
            )}
            {isInProgress && hasRequiredPhotos && <SwipeComplete disabled={busyAction === "done"} onComplete={() => act("done")} />}
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
