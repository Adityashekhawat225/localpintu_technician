export const clearRequestIfMatching = (currentRequest, completedBookingId) => {
  if (!currentRequest) return null;
  if (completedBookingId && String(currentRequest._id) !== String(completedBookingId)) return currentRequest;
  return null;
};
