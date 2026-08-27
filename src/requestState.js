export const clearRequestIfMatching = (currentRequest, completedBookingId) => {
  if (!currentRequest) return null;
  if (completedBookingId && String(currentRequest._id) !== String(completedBookingId)) return currentRequest;
  return null;
};

export const requestExpiryTime = (request) => {
  if (!request) return null;
  const value = request.uiExpiresAt || request.expiresAt || request.technicianRequestExpiresAt;
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const isRequestExpired = (request, now = Date.now()) => {
  const expiresAt = requestExpiryTime(request);
  return expiresAt !== null && expiresAt <= now;
};
