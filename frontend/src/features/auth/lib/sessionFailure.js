// Only an explicit authentication rejection should clear a valid local session.
// Login/password validation errors and connection/server failures are not logout events.
export function isSessionRejection(error, authCheck = false) {
  const status = error.response?.status;
  const data = error.response?.data;
  return status === 401 && (authCheck || data?.isLoggedOut === true);
}
