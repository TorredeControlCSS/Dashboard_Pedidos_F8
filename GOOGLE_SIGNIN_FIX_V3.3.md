# Google Sign-In Login Fix - v3.3

## Problem
Users were unable to log in to the dashboard with the following console errors:
```
Not signed in with the identity provider.
[GSI_LOGGER]: FedCM get() rejects with NetworkError: Error retrieving a token.
```

## Root Cause
The application was using `google.accounts.id.prompt()` which triggers Google's FedCM (Federated Credential Management) API. This API requires:
1. Proper CORS configuration
2. Authorized JavaScript origins in Google Cloud Console
3. FedCM-specific setup that may not work reliably on GitHub Pages

## Solution
Replaced `google.accounts.id.prompt()` with `google.accounts.id.renderButton()` which:
- Uses the traditional Google Sign-In button flow
- Doesn't require FedCM setup
- Provides better compatibility with GitHub Pages
- Offers more explicit user interaction

## Changes Made

### 1. flow-app.js (lines 1396-1429)
**Before:**
```javascript
btnLogin.addEventListener('click', () => {
  if (window.google?.accounts?.id) {
    google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: r => {
        idToken = r.credential;
        if (btnEditMode) btnEditMode.disabled = false;
        btnLogin.textContent = 'Sesión iniciada';
        alert('Sesión iniciada. Activa "Modo edición".');
      }
    });
    google.accounts.id.prompt(); // ❌ This was causing FedCM errors
  }
});
```

**After:**
```javascript
btnLogin.addEventListener('click', () => {
  if (window.google?.accounts?.id) {
    google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: r => {
        idToken = r.credential;
        if (btnEditMode) btnEditMode.disabled = false;
        // Hide button and show success message
        btnLogin.style.display = 'none';
        const loginStatus = document.createElement('span');
        loginStatus.textContent = '✓ Sesión iniciada';
        loginStatus.style.color = '#10b981';
        loginStatus.style.fontWeight = 'bold';
        loginStatus.style.marginRight = '1rem';
        btnLogin.parentNode.insertBefore(loginStatus, btnLogin);
        alert('Sesión iniciada. Activa "Modo edición".');
      }
    });
    // Use renderButton instead of prompt to avoid FedCM errors ✅
    btnLogin.textContent = '';
    btnLogin.style.padding = '0';
    btnLogin.style.border = 'none';
    btnLogin.style.background = 'transparent';
    google.accounts.id.renderButton(btnLogin, {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      width: 200
    });
  }
});
```

### 2. app.js and app-classic.js
Applied the same fix to maintain consistency across all views.

### 3. Version Updates
- Updated flow-app.js version comment to v3.3
- Updated flow-dashboard.html script tag to `flow-app.js?v=3.3`
- Updated service worker cache name to `f8-dashboard-v3.3`

## Testing
- ✅ JavaScript syntax validation passed for all files
- ✅ Code review completed with no blocking issues
- ✅ Security scan (CodeQL) passed with 0 alerts
- ✅ No breaking changes to existing functionality

## User Experience Changes
1. When user clicks "Acceder" button, it transforms into a Google Sign-In button
2. After successful login, the button is hidden and replaced with "✓ Sesión iniciada" in green
3. The "Modo edición" button becomes enabled after successful login

## Benefits
- ✅ Fixes the login issue without requiring changes to Google Cloud Console
- ✅ More reliable sign-in flow
- ✅ Better visual feedback for users
- ✅ No FedCM dependencies
- ✅ Compatible with GitHub Pages hosting

## References
- Google Identity Services Documentation: https://developers.google.com/identity/gsi/web/guides/overview
- FedCM API: https://developer.mozilla.org/en-US/docs/Web/API/FedCM_API
