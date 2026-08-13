# Building the Android app

The build runs on **EAS Build**, Expo's hosted service. No Android Studio, no
Android SDK, no JDK on anyone's machine — including the CI runner, which only
uploads the project and waits.

## The preview build

A `preview` build is a plain APK with internal distribution: install it by
scanning the QR code on the build page, no Play Store involved. That is the
artefact to hand to SLAM for a walkthrough.

### Through GitHub Actions (the intended path)

**Actions → EAS Android build → Run workflow.**

| Input | Meaning |
| --- | --- |
| `profile` | `preview` for an APK, `production` for a Play Store AAB |
| `api_url` | The API this build talks to. Required. |
| `wait` | Block the job until the build finishes. Off by default. |

The workflow refuses to start if any of these is true, rather than burning
build minutes or producing an APK that cannot work:

- `EXPO_TOKEN` is not configured
- `api_url` is not an absolute http(s) URL
- `api_url` points at `localhost`, `127.0.0.1` or `10.0.2.2` — a phone cannot
  reach any of those
- `app.json` still carries the placeholder EAS project id

It then bundles the app locally as a preflight, so a broken import fails in
about a minute instead of twenty.

### From a terminal

```bash
cd apps/mobile
npx eas-cli login
EXPO_PUBLIC_API_URL=https://your-api.example npx eas-cli build \
  --platform android --profile preview
```

## ACTION REQUIRED before the first build

**What:** an Expo account, an EAS project, and an access token.
**Why:** EAS Build cannot run anonymously, and the Android keystore is
generated and held per-project.
**Exact values/access needed:**

1. An Expo account, and an organisation if SLAM should own the project rather
   than an individual
2. `cd apps/mobile && npx eas-cli init` — this writes the real project id into
   `app.json`. Commit that change; `00000000-0000-0000-0000-000000000000` is a
   placeholder and the workflow rejects it.
3. An access token from <https://expo.dev/settings/access-tokens>, added to the
   repository as the secret `EXPO_TOKEN`
   (Settings → Secrets and variables → Actions)
4. A publicly reachable API URL. For a demo, a Codespace with port 8000 set to
   public is enough — see [CODESPACES.md](CODESPACES.md). For anything real,
   see [DEPLOYMENT.md](DEPLOYMENT.md).

On the first Android build EAS offers to generate a keystore. Say yes and let
EAS keep it, unless SLAM already has a signing key to preserve — a Play Store
listing is permanently tied to whichever key signs the first upload.

## Why the API URL is a build input

`EXPO_PUBLIC_*` values are compiled into the JavaScript bundle. An APK cannot
be re-pointed at a different server afterwards, so the URL has to be chosen at
build time — which is why the workflow asks for it rather than defaulting.

A build made without one does **not** silently fall back to a development
address. `resolveBaseUrl()` returns nothing in a release build, and every
request fails immediately with *"This build has no GymFlow server configured"*.
That is deliberate: a preview APK quietly pointing at `10.0.2.2` looks like a
server outage to whoever is holding the phone.

## A note on `expo prebuild`

`npm run prebuild:android` generates the native `android/` directory. It also
**rewrites `package.json`**, swapping the `android` and `ios` scripts from
`expo start --…` to `expo run:…`. Those variants compile locally and therefore
need an Android SDK, which this project deliberately does not require.

If you run prebuild, check `git diff package.json` afterwards and revert that
part unless you actually intend to build locally. `android/` itself is
gitignored and regenerable.

## App config and the SDK schema

`npm run validate:config` checks `app.json` against the app-config types of the
*installed* SDK, and CI runs it on every pull request.

This exists because an SDK periodically drops a config key once its behaviour
becomes the default — SDK 57 no longer accepts `newArchEnabled`, a top-level
`splash` block, or `android.edgeToEdgeEnabled`. `expo-doctor` reports these,
but only by downloading the schema, so it is silent on a restricted network.

When the check fails, read the SDK release notes before deleting the key: the
behaviour it asked for usually still needs to exist somewhere, either as the
new default or in a config plugin. Splash configuration, for instance, moved
into the `expo-splash-screen` plugin.

## Profiles

| Profile | Output | Distribution |
| --- | --- | --- |
| `development` | APK with the dev client | internal, for debugging |
| `preview` | APK | internal, install from a QR code |
| `production` | AAB | Play Store |

Defined in `apps/mobile/eas.json`. `preview` and `production` carry no
`EXPO_PUBLIC_API_URL` of their own — the workflow writes the one you chose into
the profile before building, so no fake domain can be shipped by accident.

## iOS

The same profiles cover iOS and the app bundles cleanly for it. Producing an
`.ipa` additionally needs an Apple Developer Program membership; add the
platform to the same workflow once that exists.
