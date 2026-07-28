/**
 * Everything static lives in app.json. This file exists for one reason: to stop
 * a release build that has quietly lost its Supabase credentials.
 *
 * `EXPO_PUBLIC_*` values are inlined when the bundle is built, and `.env` is
 * gitignored, so it never reaches an EAS worker. A build without them is not a
 * broken app, which is the trap: it is a perfectly working local-only app with
 * no sign in screen and no sync, and it ships to the store looking fine. That
 * cost us a build cycle once. Now it fails here instead.
 *
 * Local development is untouched. Running with no credentials on your own
 * machine is still the supported local-first path.
 */

const PLACEHOLDERS = ['your-project', 'YOUR_'];

const missing = (value) => {
  const trimmed = (value ?? '').trim();
  return trimmed === '' || PLACEHOLDERS.some((p) => trimmed.includes(p));
};

module.exports = ({ config }) => {
  const onEasBuild = process.env.EAS_BUILD === 'true';
  const optedOut = process.env.GARAGE_ALLOW_NO_BACKEND === '1';

  if (onEasBuild && !optedOut) {
    const absent = [
      ['EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL],
      ['EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY],
    ]
      .filter(([, value]) => missing(value))
      .map(([name]) => name);

    if (absent.length > 0) {
      const profile = process.env.EAS_BUILD_PROFILE ?? 'unknown';
      throw new Error(
        `Refusing to build profile "${profile}" without a backend.\n\n` +
          `Missing: ${absent.join(', ')}\n\n` +
          'This build would install with no sign in screen, no accounts and no sync, ' +
          'because those values are inlined at bundle time and .env is never uploaded ' +
          'to EAS.\n\n' +
          'They are stored as EAS environment variables. Check them with:\n' +
          `  eas env:list ${profile}\n` +
          'and confirm eas.json points this profile at that environment.\n\n' +
          'To build the local-only app on purpose, set GARAGE_ALLOW_NO_BACKEND=1.'
      );
    }
  }

  return config;
};
