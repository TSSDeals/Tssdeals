## Packages
(none needed)

## Notes
Uses existing Replit Auth client hook at client/src/hooks/use-auth.ts (added by integration). Logged-out users should see landing page with CTA to /api/login.
All fetches include credentials: "include" (cookie auth).
Push subscribe UI uses Web Push APIs; will only work on HTTPS + with service worker + VAPID key on backend.
