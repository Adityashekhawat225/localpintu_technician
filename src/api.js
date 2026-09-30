import axios from "axios";
const LOCAL_BASE = "http://localhost:5031/api";
const PRODUCTION_BASE = "https://localpintu-backend.onrender.com/api";
const isLocalHost = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
const LIVE_BASE = isLocalHost ? LOCAL_BASE : (import.meta.env.VITE_API_BASE_URL || PRODUCTION_BASE);
// Mobile data and a waking production server can legitimately take longer
// than 15 seconds.  A timeout is a connection problem, not an expired login.
export const api = axios.create({ baseURL: LIVE_BASE, timeout: 30000 });
api.interceptors.request.use((config) => { const token = sessionStorage.getItem("localpintu-technician-token"); if (token) config.headers.Authorization = `Bearer ${token}`; return config; });
api.interceptors.response.use((r) => r, async (e) => {
  if (e.response?.status === 401) {
    sessionStorage.removeItem("localpintu-technician-token");
    localStorage.removeItem("localpintu-technician");
    window.dispatchEvent(new CustomEvent("localpintu:technician-session-expired"));
  }
  return Promise.reject(Object.assign(new Error(e.response?.data?.message || e.message || "Request failed"), {
    code: e.response?.data?.code,
    status: e.response?.status,
  }));
});
export const login = (payload) => api.post("/technicians/login", payload).then((r) => r.data);
export const getMe = () => api.get("/technicians/me").then((r) => r.data.technician);
export const updateMe = (payload) => api.put("/technicians/me", payload).then((r) => r.data.technician);
export const logout = () => api.post("/technicians/logout");
const withPhotoUrls = (job) => { const photoUrl = (field, index) => api.getUri({ url: `/technicians/me/jobs/${job._id}/photos/${field}/${index}` }); return { ...job, beforePhotos: Array.from({ length: job.beforePhotoCount || 0 }, (_, index) => photoUrl("beforePhotos", index)), afterPhotos: Array.from({ length: job.afterPhotoCount || 0 }, (_, index) => photoUrl("afterPhotos", index)) }; };
export const jobs = () => api.get("/technicians/me/jobs").then((r) => (r.data.jobs || []).map(withPhotoUrls));
export const job = (id) => api.get(`/technicians/me/jobs/${id}`).then((r) => withPhotoUrls(r.data.job));
export const jobPhoto = (url, signal) => api.get(url, { responseType: "blob", signal }).then((r) => r.data);
export const jobAction = (id, action, payload = {}) => api.patch(`/technicians/me/jobs/${id}/${action}`, payload).then((r) => r.data);
export const jobProducts = (id) => api.get(`/technicians/me/jobs/${id}/products`).then((r) => r.data.products);
export const addJobFault = (id, payload) => api.post(`/technicians/me/jobs/${id}/additional-faults`, payload).then((r) => r.data);
export const jobVendors = (id) => api.get(`/technicians/me/jobs/${id}/vendors`).then((r) => r.data.vendors);
export const lookupJobVendor = (id, params) => api.get(`/technicians/me/jobs/${id}/vendor-lookup`, { params }).then((r) => r.data.vendors);
export const addJobVendor = (id, payload) => api.post(`/technicians/me/jobs/${id}/vendors`, payload).then((r) => r.data.vendor);
export const updateJobVendor = (id, vendorId, workStatus) => api.patch(`/technicians/me/jobs/${id}/vendors/${vendorId}`, { workStatus }).then((r) => r.data.vendor);
export const updateLocation = (latitude, longitude, speed, heading, accuracy) => api.post("/technicians/me/location", { latitude, longitude, speed, heading, accuracy });
export const updateAvailability = (availabilityStatus) => api.patch("/technicians/me/availability", { availabilityStatus }).then((r) => r.data.technician);
export const schedule = () => api.get("/technicians/me/schedule").then((r) => r.data);
export const updateSchedule = (payload) => api.put("/technicians/me/schedule", payload).then((r) => r.data);
export const requestLeave = (payload) => api.post("/technicians/me/leaves", payload).then((r) => r.data);
export const dashboard = () => api.get("/technicians/me/dashboard").then((r) => r.data.summary);
export const wallet = () => api.get("/technicians/me/wallet").then((r) => r.data);
export const creditWallet = () => api.get("/technician-credits/me/wallet").then((r) => r.data);
export const creditLeads = () => api.get("/technician-credits/me/leads").then((r) => r.data.leads || []);
export const unlockCreditLead = (id) => api.post(`/technician-credits/me/leads/${id}/unlock`).then((r) => r.data);
export const createCreditRazorpayOrder = (packageId) => api.post("/technician-credits/me/payments/razorpay/order", { packageId }).then((r) => r.data);
export const verifyCreditRazorpayPayment = (payload) => api.post("/technician-credits/me/payments/razorpay/verify", payload).then((r) => r.data);
export const expenses = () => api.get("/technicians/me/expenses").then((r) => r.data.expenses || []);
export const requestWithdrawal = (payload) => api.post("/technicians/me/wallet/withdrawals", payload).then((r) => r.data);
export const addExpense = (payload) => api.post("/technicians/me/expenses", payload).then((r) => r.data.expense);
export const notifications = () => api.get("/notifications/me").then((r) => r.data.notifications || []);
export const markNotificationRead = (id) => api.patch(`/notifications/me/${id}/read`).then((r) => r.data.notification);
export const markAllNotificationsRead = () => api.patch("/notifications/me/read-all").then((r) => r.data);

// Customer verification OTP workflow
export const requestCompletion = (bookingId) => api.patch(`/technicians/me/jobs/${bookingId}/done`).then((r) => r.data);
export const verifyOtp = (bookingId, otp) => api.patch(`/technicians/me/jobs/${bookingId}/verify-otp`, { otp }).then((r) => r.data);
export const resendOtp = (bookingId) => api.patch(`/technicians/me/jobs/${bookingId}/resend-otp`).then((r) => r.data);
