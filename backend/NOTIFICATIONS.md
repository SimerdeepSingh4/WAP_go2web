# Notifications

The dashboard uses persistent in-app notifications, live Socket.IO updates and optional browser push. Email notifications are not used.

## Configuration

Run from `backend`:

```powershell
npm run notifications:setup -- contact@example.com
```

This writes VAPID keys and a contact identifier to the ignored `.env` file. Existing keys are preserved. The contact can later be changed with the same command, followed by a backend restart. A public HTTPS contact URL is also accepted. Keep the private key on the server; copy the same key pair to each production instance. Rotating keys requires browsers to subscribe again.

Browser notifications require permission and a supported browser. Production must use HTTPS; localhost can be used for development. On iOS/iPadOS, install the app to the Home Screen. Permission is requested only after the user clicks **Enable on this device** under **Notifications → Notification preferences**.

Push previews contain no private campaign or financial information. Subscriptions are tied to an active login session. Browser ownership is cleared on logout, and the server rechecks the session before delivery. Supported push services are Chrome/FCM, Firefox, Apple and Windows browser push providers.

## Delivery and privacy

- Business model hooks persist an outbox event using the business operation's MongoDB session. Writes outside an existing session use a transaction for the record and its outbox event.
- A background worker claims durable events with expiring leases. It creates one inbox item per event and recipient. Retries and worker restarts do not duplicate inbox items.
- Browser deliveries are persisted per notification and subscription and retried with exponential backoff, up to eight attempts. Expired subscriptions are removed. Failed deliveries appear in the admin notification centre and can be retried there.
- Push alerts are skipped when that device has a visible dashboard, or the notification is already read or archived. In-app history remains available.
- Users see their own notifications. Resellers also see managed users they created and still manage. Admins receive relevant administrative events. Permission is rechecked when reading and before push delivery.
- Low-balance notifications occur when a balance crosses below the owner's configured threshold. A threshold of zero disables this alert. Expiry reminders are deduplicated by expiry date.
- Inbox history lasts 90 days. Completed queue records expire after seven days; failed jobs remain available for inspection and retry.

Browser services, device settings and permissions can delay or prevent OS alerts. The persistent in-app inbox is the authoritative history.

## Verification

```powershell
node --test test-notifications.js test-notification-service-worker.js test-notifications-integration.js
```

The integration suite creates and removes an isolated temporary database. It tests transaction rollback, duplicate protection, privacy, read/archive controls, retry handling and expired subscriptions. Push transport is mocked; it sends no external notifications. A real browser must grant permission to verify OS-level delivery on that device.
