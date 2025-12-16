# Testing Guide - Flow Dashboard Date Fix v2.9

## ✅ What Was Fixed

This PR fixes the date offset issue where the flow dashboard (`flow-dashboard.html`) showed dates ±1 day different from Google Sheets.

### Root Causes Identified and Fixed:

1. **Date Offset in Frontend** - `flow-app.js` was applying unnecessary date adjustments
2. **Stale Cache** - Service worker was serving old JS/CSS files
3. **Security Issue** - Service worker URL filtering had a vulnerability

## 🧪 How to Test

### Prerequisites
- Access to the GitHub Pages deployment
- Access to Google Sheets backend
- Login credentials for the dashboard

### Test Scenario 1: Edit Date Field

1. **Open the flow dashboard:**
   ```
   https://torredecontrolcss.github.io/Dashboard_Pedidos_F8/flow-dashboard.html
   ```

2. **Force clear cache:**
   - Press `Ctrl + F5` (Windows) or `Cmd + Shift + R` (Mac)
   - You should see in console: `flow-app.js v2.9 — Date handling fixed`

3. **Login:**
   - Click "Acceder" button
   - Sign in with Google account
   - Button should change to "Sesión iniciada"

4. **Enable edit mode:**
   - Click "Modo edición: OFF"
   - Button should change to "Modo edición: ON"
   - Button should have green highlight

5. **Select a day:**
   - Click on any day in the calendar that has requisitions (shows a red badge)
   - Left panel should show list of requisitions for that day

6. **Edit a date:**
   - Find a requisition with an "ENTREGA REAL" field
   - Click on the date value (or "—" if empty)
   - An `<input type="date">` should appear
   - Select a specific date (e.g., December 16, 2025)
   - Press Enter or click outside the input

7. **Check console logs:**
   Open browser console (F12) and look for:
   ```
   [FLOW-EDIT] Starting save: { id: "F8 XXX", field: "ENTREGA REAL", oldRaw: "...", newValue: "2025-12-16", rowIndex: X }
   [FLOW-EDIT] Date field - sending value: 2025-12-16
   [FLOW-EDIT] Backend response: {status: "ok", new_value: "2025-12-16"}
   [FLOW-EDIT] Save successful, reloading data...
   ```

8. **Verify in UI:**
   - The date should now display as `16/12/25` (DD/MM/YY format)
   - The requisition list should reload with the updated date
   - The calendar should highlight day 16

9. **Verify in Google Sheets:**
   - Open the requisitions spreadsheet
   - Find the row with the edited F8 SALMI
   - Check the "ENTREGA REAL" column
   - Should show `16-dic-25` or `2025-12-16` (depending on Sheets format)
   - **CRITICAL:** Date in Sheets MUST match what you selected

### Test Scenario 2: Read Date from Sheets

1. **Edit date directly in Google Sheets:**
   - Open the requisitions spreadsheet
   - Find any row and change "ENTREGA REAL" to `17-dic-25`
   - Save the sheet

2. **Reload flow dashboard:**
   - Go back to the dashboard
   - Press `Ctrl + F5` to force reload
   - Click on day 17 in the calendar

3. **Verify display:**
   - The requisition should appear in the list for day 17
   - The date should display as `17/12/25`
   - Calendar day 17 should have a badge indicating requisitions

4. **Check for consistency:**
   - No ±1 day offset
   - Date in dashboard = Date in Sheets

### Test Scenario 3: Service Worker Update

1. **Check service worker version:**
   - Open console (F12)
   - Look for: `[SW] Installing version: f8-dashboard-v2.9`
   - Look for: `[SW] Activating version: f8-dashboard-v2.9`

2. **Verify cache clearing:**
   - Should see: `[SW] Clearing old caches: ["f8-dashboard-v1"]` (or similar)

3. **Test cache busting:**
   - Reload the page normally (F5)
   - JS and CSS should be fetched from network (network-first strategy)
   - Check Network tab: `flow-app.js?v=2.9` should have status 200

## ✅ Expected Results

### ✓ Dates Display Correctly
- UI shows DD/MM/YY format (e.g., `16/12/25`)
- Sheets shows dd-mmm-yy format (e.g., `16-dic-25`)
- **No ±1 day offset between UI and Sheets**

### ✓ Date Editing Works
- Selecting December 16 in UI → Saves as `2025-12-16` to backend
- Backend saves to Sheets as `16-dic-25`
- Dashboard displays as `16/12/25`
- Calendar highlights day 16

### ✓ Console Logs Present
```
[FLOW-EDIT] logs show the full edit flow
[SW] logs show service worker lifecycle
```

### ✓ Cache Busting Works
- Ctrl+F5 loads new version (v2.9)
- Old caches are cleared
- JS/CSS files are fetched from network

## ❌ Common Issues and Solutions

### Issue: "Still seeing old version (v2.8)"
**Solution:**
1. Clear browser cache completely:
   - Chrome: Settings → Privacy → Clear browsing data → Cached images and files
2. Unregister old service worker:
   - Chrome DevTools → Application → Service Workers → Unregister
3. Hard reload: Ctrl+F5

### Issue: "Dates still off by ±1 day"
**Solution:**
1. Check Apps Script backend A has NO offset in `parseDateCell()`
2. Check console logs show correct date being sent
3. Verify backend response shows correct `new_value`
4. Check Google Sheets raw cell value

### Issue: "Edit doesn't save"
**Solution:**
1. Check you're logged in ("Sesión iniciada")
2. Check edit mode is ON (green button)
3. Check console for errors
4. Verify idToken is valid
5. Check backend B is responding

### Issue: "Console shows no [FLOW-EDIT] logs"
**Solution:**
1. You're not in edit mode - enable it
2. You clicked on a non-editable field
3. The field type is not in DATE_FIELDS array
4. JavaScript error prevented execution - check console

## 🔧 Developer Testing

### Test Date Utilities

Open console and run:

```javascript
// Test parseIsoDate
const d = window.__FLOW_APP_LOADED__ && parseIsoDate('2025-12-16');
console.log('Parsed:', d); // Should be Mon Dec 16 2025 00:00:00 GMT

// Test formatDateShort
const formatted = formatDateShort('2025-12-16');
console.log('Formatted:', formatted); // Should be "16/12/25"

// Test formatDateInput
const inputValue = formatDateInput('2025-12-16');
console.log('Input value:', inputValue); // Should be "2025-12-16"
```

### Test Service Worker

```javascript
// Check active service worker
navigator.serviceWorker.getRegistration().then(reg => {
  console.log('SW version:', reg.active.scriptURL);
  console.log('SW state:', reg.active.state);
});

// Check cache
caches.keys().then(keys => {
  console.log('Cache names:', keys);
  // Should include 'f8-dashboard-v2.9'
});
```

### Test Data Loading

```javascript
// Check loaded data
console.log('Current rows:', window.__DEBUG_LAST_ROWS);
console.log('Current day filter:', currentDayFilter);

// Check calendar data
console.log('Calendar data:', window.__CAL_DATA__);
```

## 📋 Test Report Template

Copy this and fill it out after testing:

```markdown
## Test Report - Flow Dashboard Date Fix v2.9

**Date:** ___________
**Tester:** ___________
**Browser:** ___________ (Chrome/Firefox/Edge)
**Version:** ___________

### Test Results

- [ ] Test 1: Cache cleared, v2.9 loaded
  - Console shows: `flow-app.js v2.9 — Date handling fixed`
  
- [ ] Test 2: Date editing works
  - Selected date: ___________
  - Date displayed in UI: ___________
  - Date in Sheets: ___________
  - Offset detected: YES / NO
  
- [ ] Test 3: Date reading works
  - Changed date in Sheets to: ___________
  - Date displayed in dashboard: ___________
  - Offset detected: YES / NO
  
- [ ] Test 4: Service worker updated
  - Old cache cleared: YES / NO
  - New version active: YES / NO

### Issues Found

(List any issues or unexpected behavior)

### Console Logs

(Paste relevant console logs, especially [FLOW-EDIT] and [SW] logs)

### Screenshots

(Attach screenshots of:)
- [ ] Calendar showing highlighted date
- [ ] Requisition list with edited date
- [ ] Google Sheets cell with saved date
- [ ] Console logs showing [FLOW-EDIT] messages
```

## 🎯 Success Criteria

All of these must be true:

1. ✅ **No date offset:** UI date = Sheets date
2. ✅ **Edit works:** Selecting date saves correctly
3. ✅ **Read works:** Changing date in Sheets reflects in UI
4. ✅ **Logs present:** [FLOW-EDIT] logs show in console
5. ✅ **Cache updated:** v2.9 is active
6. ✅ **No errors:** No JavaScript errors in console
7. ✅ **Classic view unaffected:** index.html still works

## 📞 Support

If you encounter issues:

1. Check **FECHA_FIX_GUIDE.md** for detailed troubleshooting
2. Review console logs for errors
3. Verify Apps Script backends A and B are updated
4. Check GitHub Actions for deployment status

## 🔗 Resources

- **PR:** https://github.com/TorredeControlCSS/Dashboard_Pedidos_F8/pull/XXX
- **Guide:** FECHA_FIX_GUIDE.md
- **Production:** https://torredecontrolcss.github.io/Dashboard_Pedidos_F8/flow-dashboard.html
- **Classic View:** https://torredecontrolcss.github.io/Dashboard_Pedidos_F8/index.html
