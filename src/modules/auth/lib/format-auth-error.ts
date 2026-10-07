export const PORTAL_CUSTOMER_DENIED_MESSAGE =
  'This email is registered as a storefront customer. Sign in through the DHOOM Trading mobile app, or request staff access with a separate email.';

export const PORTAL_ACCESS_DENIED_MESSAGE =
  'This account does not have access to the management portal.';

export const PORTAL_PENDING_VERIFICATION_MESSAGE =
  'Your staff access request is pending approval. An administrator must verify your account before you can sign in.';

export type PortalAuthMode = 'sign-in' | 'request-access';

function readErrorMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export function formatPortalAuthError(
  error: unknown,
  mode: PortalAuthMode = 'sign-in',
): string {
  const message = readErrorMessage(error).trim();

  if (!message) {
    return mode === 'request-access'
      ? 'Unable to submit your access request. Please try again.'
      : 'Unable to sign you in. Please try again.';
  }

  if (
    message === PORTAL_CUSTOMER_DENIED_MESSAGE ||
    message === PORTAL_ACCESS_DENIED_MESSAGE ||
    message === PORTAL_PENDING_VERIFICATION_MESSAGE
  ) {
    return message;
  }

  const lower = message.toLowerCase();

  if (/invalid login credentials|invalid email or password/i.test(lower)) {
    return 'Incorrect email or password. Please check your details and try again.';
  }

  if (/email not confirmed|email address not confirmed/i.test(lower)) {
    return 'Please confirm your email, then sign in again.';
  }

  if (/user already registered|already been registered|already exists/i.test(lower)) {
    return mode === 'request-access'
      ? 'An account with this email already exists. Sign in instead, or use a different email for storefront shopping.'
      : 'An account with this email already exists. Try signing in instead.';
  }

  if (/storefront customer|separate email/i.test(lower)) {
    return message;
  }

  if (/password should be at least|password.*8/i.test(lower)) {
    return 'Password must be at least 8 characters.';
  }

  if (/rate limit|too many requests/i.test(lower)) {
    return 'Too many attempts. Please wait a moment and try again.';
  }

  return message;
}
