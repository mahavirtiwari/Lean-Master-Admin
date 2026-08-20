# MSME LEAN Scheme — applicant mobile app

The registration wizard and applicant sign-in from the web portal, as a React
Native app that keeps working without a connection.

- **React Native 0.86** on **Expo SDK 57**, TypeScript throughout.
- Same API as the web portal (`/api/registration`, `/api/auth/login`) — no
  separate backend, and nothing to keep in step.
- Same screens and the same rules: plant already registered, sector not
  covered, SPOC e-mail capped at three, ten-digit mobile, OTP by e-mail.

## Running it

```bash
cd mobile
npm install
npx expo start
```

Then press `a` for an Android emulator, or scan the QR code with Expo Go on a
phone. `npx expo start --tunnel` if the phone is not on the same network.

### Pointing it at the API

A phone cannot reach the desktop's `localhost`. Set the host the device can
actually see:

| Where it runs | What to use |
| --- | --- |
| Android emulator | `http://10.0.2.2:5199` (the default) |
| Physical phone, same Wi‑Fi | `http://<your-machine-ip>:5199` |
| Deployed | the public origin |

Either edit `expo.extra.apiBaseUrl` in `app.json`, or override per run:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.29.19:5199 npx expo start
```

The API must be listening on more than loopback for a physical phone to reach
it — start it with `ASPNETCORE_URLS=http://0.0.0.0:5199`.

## Building an installable app

Expo builds in the cloud, so no local Android SDK is needed:

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview   # APK for sideloading
eas build --platform android --profile production # AAB for Play Store
```

To build locally instead you need JDK 17 and the Android SDK, then:

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

## How offline works

The point is that nothing an applicant types is ever lost, and that the app is
honest about the two steps that genuinely need a network.

**Saved locally, always.** Every step writes the draft to SQLite
(`src/offline/db.ts`). Force-quit the app, lose signal, come back tomorrow —
the wizard resumes where it stopped, and the landing screen offers to continue.

**Queued and replayed.** Steps that only record a choice — the unit and
activity, the SPOC details, the final submission — go to an outbox when the
server cannot be reached, and are replayed in order when connectivity returns
(`src/offline/sync.ts`). Order matters: the SPOC details are meaningless before
a unit has been chosen, so the first entry that cannot be sent stops the run.

A request the server *refuses* is dropped rather than retried. A 409 on a plant
that is already registered will be refused every time; a queue that never
drains is worse than losing the entry, and the applicant is told either way.

**Cached for reading.** Awareness programmes and the registration guide keep
their last good copy, so those lists are populated with no signal instead of
looking broken.

**What cannot work offline, and says so.** Udyam validation reads the
Government registry, and the OTP is an e-mail. Neither can be faked locally, so
those screens explain the position and keep the entries rather than failing
silently. The final submission *can* be queued — the LEAN ID is issued by the
server, so the completion screen says the registration is pending rather than
inventing an ID.

## Layout

```
src/
  api/         client (offline-aware fetch) and the registration endpoints
  offline/     SQLite draft, outbox and cache; the replay loop
  state/       session, connectivity and the draft, in one context
  components/  card, field, choice card, dialog, offline banner
  screens/     sign-in, dashboard, and the wizard R1–R9
  theme/       the portal's palette and scale
```

## Not built yet

Applying for a certification level, uploading evidence and tracking an
assessment are still web-only. They are server-driven flows that do not exist
on the applicant side of the portal either, so there was nothing to mirror.
