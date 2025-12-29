# Google Authentication Functions

The following snippets capture the Google authentication logic used in the app, including PWA/iOS handling and fallback behavior.

```javascript
function initializeAppLogic() {
    const loginOverlay = document.getElementById('login-overlay');
    const appContent = document.getElementById('app-content');
    const googleLoginBtn = document.getElementById('google-login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userDisplayName = document.getElementById('user-display-name');
    const settingsBtn = document.getElementById('settings-btn'); // defined here for scope

    if (!googleLoginBtn) {
        console.error("Login button not found! Retrying in 500ms...");
        setTimeout(initializeAppLogic, 500);
        return;
    }

    // --- Auth Logic ---
    const provider = new GoogleAuthProvider();
    const isStandaloneDisplay = () => {
        // iOS PWAs don't reliably report standalone mode via a single flag
        // across versions, so check multiple indicators.
        return (
            window.matchMedia('(display-mode: standalone)').matches ||
            window.matchMedia('(display-mode: fullscreen)').matches ||
            window.navigator.standalone === true
        );
    };

    const prefersRedirect = () => {
        const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
        // Force redirect flows for PWAs and iOS devices where popups are blocked
        // (e.g., standalone mode on iOS Safari).
        return isStandaloneDisplay() || isIOS;
    };

    const startRedirectSignIn = () => {
        console.log("Starting redirect sign-in");
        signInWithRedirect(auth, provider).catch((error) => {
            console.error("Redirect login failed:", error);
            alert("Login failed: " + error.message);
        });
    };

    getRedirectResult(auth)
        .then((result) => {
            if (result?.user) {
                console.log("User signed in via redirect:", result.user);
            }
        })
        .catch((error) => {
            console.error("Redirect result error:", error);
            alert("Login failed: " + error.message);
        });

    googleLoginBtn.addEventListener('click', () => {
        console.log("Login button clicked"); // Debug log

        if (prefersRedirect()) {
            startRedirectSignIn();
            return;
        }

        signInWithPopup(auth, provider)
            .then((result) => {
                console.log("User signed in:", result.user);
            }).catch((error) => {
                const popupNotSupported = (
                    error.code === 'auth/operation-not-supported-in-this-environment' ||
                    error.code === 'auth/popup-blocked'
                );

                if (popupNotSupported || prefersRedirect()) {
                    console.warn("Popup sign-in not supported. Falling back to redirect.", error);
                    startRedirectSignIn();
                    return;
                }

                console.error("Login failed:", error);
                alert("Login failed: " + error.message);
            });
    });

    logoutBtn.addEventListener('click', () => {
        signOut(auth).then(() => {
            console.log("User signed out");
            window.location.reload();
        }).catch((error) => {
            console.error("Logout failed:", error);
        });
    });

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            loginOverlay.style.display = 'none';
            appContent.classList.remove('hidden');
            userDisplayName.textContent = user.email;

            if (isConfigured) {
                // Auto-register user if not exists
                const userRef = doc(db, "users", user.email);
                try {
                    const userSnap = await getDoc(userRef);
                    if (!userSnap.exists()) {
                        await setDoc(userRef, {
                            email: user.email,
                            role: 'worker',
                            createdAt: new Date().toISOString()
                        });
                        console.log("New user registered as worker:", user.email);
                    }
                } catch (regErr) {
                    console.error("Error registering user:", regErr);
                }

                checkUserRole(user.email);
                // Note: setupRealtimeListeners is called later within DOMContentLoaded
                // Store email for signature loading; actual load happens when canvas is ready
                pendingUserEmail = user.email;
                if (signaturePadReady && loadCloudSignatureFn) {
                    loadCloudSignatureFn(user.email);
                }
            }
        } else {
            loginOverlay.style.display = 'flex';
            appContent.classList.add('hidden');
            userDisplayName.textContent = '';
        }
    });

    async function checkUserRole(email) {
        try {
            console.log(`Checking role for: ${email}`);
            const userDoc = await getDoc(doc(db, "users", email));
            // Get DOM elements directly to avoid scope issues
            const settingsBtnEl = document.getElementById('settings-btn');
            const reviewReportsBtnEl = document.getElementById('review-reports-btn');

            if (userDoc.exists()) {
                const userData = userDoc.data();
                console.log("User data found:", userData);
                if (userData.role === 'admin') {
                    console.log("User is Admin. Revealing controls.");
                    if (settingsBtnEl) settingsBtnEl.classList.remove('hidden');
                    if (reviewReportsBtnEl) reviewReportsBtnEl.classList.remove('hidden');
                } else {
                    console.log(`User role is '${userData.role}', not 'admin'. Hiding controls.`);
                    if (settingsBtnEl) settingsBtnEl.classList.add('hidden');
                    if (reviewReportsBtnEl) reviewReportsBtnEl.classList.add('hidden');
                }
            } else {
                console.log("No user document found in 'users' collection.");
                if (settingsBtnEl) settingsBtnEl.classList.add('hidden');
                if (reviewReportsBtnEl) reviewReportsBtnEl.classList.add('hidden');
            }
        } catch (error) {
            console.error("Error checking role:", error);
            const settingsBtnEl = document.getElementById('settings-btn');
            const reviewReportsBtnEl = document.getElementById('review-reports-btn');
            if (settingsBtnEl) settingsBtnEl.classList.add('hidden');
            if (reviewReportsBtnEl) reviewReportsBtnEl.classList.add('hidden');
        }
    }
}
```
