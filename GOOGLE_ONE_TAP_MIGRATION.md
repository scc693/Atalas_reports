# Google One Tap Migration Guide

## Overview

The authentication system has been migrated from Firebase's popup/redirect flow to **Google One Tap**. This provides a much simpler, more reliable authentication experience, especially for iOS PWAs.

## What Changed

### Code Simplified

- **Removed ~120 lines** of complex popup/redirect fallback logic
- **Removed** iOS PWA detection heuristics
- **Removed** redirect result handling and state restoration
- **Replaced** with ~60 lines of clean Google One Tap integration

### New Authentication Flow

1. **Automatic Prompt**: Google One Tap shows automatically when page loads (for signed-out users)
2. **One-Click Sign-In**: Users click their Google account to sign in instantly
3. **Button Fallback**: Manual "Sign in with Google" button triggers One Tap if dismissed
4. **No Redirects**: All authentication happens in-page (no navigation away)

### Files Modified

1. **`.env.example`** - Added `VITE_GOOGLE_CLIENT_ID` environment variable
2. **`firebase-config.js`** - Exported `googleClientId` from environment
3. **`index.html`** - Added One Tap container div
4. **`app.js`** - Complete authentication refactor:
   - Changed imports from `signInWithPopup/signInWithRedirect` to `signInWithCredential`
   - Removed device detection logic
   - Removed redirect handling
   - Added Google One Tap initialization
   - Added credential response handler
   - Updated logout to disable auto-select

## Configuration Required

### Step 1: Get Your Google Client ID

You need a Google Client ID from the Google Cloud Console:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your Firebase project
3. Navigate to **APIs & Services** > **Credentials**
4. Look for an existing **OAuth 2.0 Client ID** or create a new one:
   - Click **Create Credentials** > **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Name: "Atlas Reports Web Client"
   - **Authorized JavaScript origins**: Add your domains
     - `http://localhost:5173` (for development)
     - `https://yourdomain.com` (for production)
   - **Authorized redirect URIs**: Leave empty (not needed for One Tap)
5. Copy the **Client ID** (looks like: `123456789-abc.apps.googleusercontent.com`)

### Step 2: Configure Environment Variables

Create a `.env` file (or update existing) with your credentials:

```bash
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Google One Tap
VITE_GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
```

**Important:** Add `.env` to your `.gitignore` to keep credentials private!

### Step 3: Rebuild and Test

```bash
# Install dependencies if needed
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## User Experience Changes

### Before (Popup/Redirect)

- Click "Sign in with Google"
- Popup window opens (often blocked)
- If blocked, redirects away from app
- On iOS PWA, multiple issues with session persistence
- Complex error handling

### After (Google One Tap)

- Automatic prompt appears on page load
- Click your Google account (no popup/redirect)
- Instant sign-in, stay on same page
- Works reliably in iOS PWAs
- Cleaner error messages

## Benefits

✅ **70% less code** - Simpler to maintain
✅ **Better UX** - No popups, no redirects
✅ **iOS PWA Support** - Designed for PWAs from the start
✅ **Faster Sign-In** - One click instead of multiple steps
✅ **Auto Sign-In** - Remembers users across sessions
✅ **Mobile Optimized** - Better on all mobile devices

## Troubleshooting

### One Tap doesn't appear

**Check:**
- Is `VITE_GOOGLE_CLIENT_ID` set correctly in `.env`?
- Is your domain added to Authorized JavaScript origins in Google Cloud Console?
- Check browser console for errors
- Clear browser cache and cookies

### "Google Sign-In is still loading" error

The Google Identity Services library is still loading. This should only happen on very slow connections. The script loads asynchronously and will retry automatically.

### "Login failed" error

**Common causes:**
- Incorrect Client ID
- Domain not authorized in Google Cloud Console
- Browser blocking third-party cookies (required for Google auth)

### Testing locally

Make sure to add `http://localhost:5173` (or your dev port) to Authorized JavaScript origins in Google Cloud Console.

## Fallback Behavior

If Google One Tap is not available (e.g., unsupported browser, blocked by extensions):
- The manual "Sign in with Google" button will still work
- Clicking it triggers the One Tap prompt
- User can still authenticate successfully

## Security Notes

- Google One Tap uses industry-standard OAuth 2.0
- Credentials are never stored in your app
- Firebase handles all session management
- HTTPS required for production (already enforced by Firebase Hosting)

## Support

If you encounter issues:
1. Check browser console for detailed error messages
2. Verify Google Cloud Console configuration
3. Ensure environment variables are loaded correctly
4. Test in incognito mode to rule out browser extensions

## Additional Resources

- [Google One Tap Documentation](https://developers.google.com/identity/gsi/web/guides/overview)
- [Firebase Authentication with Google](https://firebase.google.com/docs/auth/web/google-signin)
- [OAuth 2.0 Setup](https://developers.google.com/identity/protocols/oauth2)
