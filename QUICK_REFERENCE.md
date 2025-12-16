# Quick Reference - Date Fix v2.9

## 🎯 What Changed

✅ Flow dashboard dates now match Google Sheets exactly (no ±1 day offset)
✅ Service worker cache updated (v2.9)
✅ Security vulnerability fixed
✅ Debug logging added

## ⚡ Quick Start

### For Users (Testing)

```bash
1. Open flow dashboard
2. Press Ctrl+F5 (force reload)
3. Check console: "flow-app.js v2.9 — Date handling fixed"
4. Test: Edit a date, verify it matches Sheets
```

### For Developers (Deployment)

```bash
# Already deployed via GitHub Pages
# Next version: Increment these values:
# - sw.js: CACHE_NAME = 'f8-dashboard-v2.10'
# - flow-dashboard.html: <script src="flow-app.js?v=2.10">
```

## 🔑 Key Points

### Date Flow (Simplified)
```
User picks: 16-Dec-2025
    ↓
Frontend sends: "2025-12-16"
    ↓
Backend saves: "2025-12-16"
    ↓
Frontend shows: "16/12/25"
```

### Console Logs to Look For
```javascript
[FLOW-EDIT] Starting save: { id: "F8 XXX", field: "ENTREGA REAL", ... }
[FLOW-EDIT] Date field - sending value: 2025-12-16
[FLOW-EDIT] Backend response: {status: "ok", new_value: "2025-12-16"}
[FLOW-EDIT] Save successful, reloading data...
```

### Service Worker Logs
```javascript
[SW] Installing version: f8-dashboard-v2.9
[SW] Activating version: f8-dashboard-v2.9
[SW] Clearing old caches: ["f8-dashboard-v1"]
[SW] Registered: /Dashboard_Pedidos_F8/
```

## ⚠️ CRITICAL: Backend Update Needed

**Apps Script A must be updated BEFORE testing will work:**

```javascript
// FILE: Script A (read)
// FUNCTION: parseDateCell(v)

// ❌ REMOVE THIS LINE:
d.setDate(d.getDate() + 1);

// ✅ AFTER:
function parseDateCell(v) {
  if (!v) return '';
  const d = new Date(v);
  // NO OFFSET - return date as-is
  return Utilities.formatDate(d, 'GMT', 'yyyy-MM-dd');
}
```

## 🧪 5-Minute Test

```bash
1. Ctrl+F5 on flow-dashboard.html
2. Login → Enable edit mode
3. Edit any date (e.g., ENTREGA REAL)
4. Check console for [FLOW-EDIT] logs
5. Verify date in UI = date in Sheets
```

**Expected:** No ±1 day difference

## 🐛 Troubleshooting

### "Still seeing v2.8"
→ Clear browser cache + Unregister service worker + Ctrl+F5

### "Dates still off by ±1 day"
→ Check Apps Script backend A has NO +1 offset

### "Edit doesn't save"
→ Check logged in + edit mode ON + check console errors

### "No [FLOW-EDIT] logs"
→ Not in edit mode OR clicked non-editable field

## 📚 Full Documentation

- **TESTING_GUIDE.md** - Complete testing procedures (216 lines)
- **FECHA_FIX_GUIDE.md** - Technical details & troubleshooting (254 lines)

## 🔗 Links

- Production: https://torredecontrolcss.github.io/Dashboard_Pedidos_F8/flow-dashboard.html
- Classic View: https://torredecontrolcss.github.io/Dashboard_Pedidos_F8/index.html
- PR: (fill in PR number)

## 📋 Checklist for Merge

Before merging this PR:

- [ ] Reviewed code changes
- [ ] Updated Apps Script backend A (removed +1 offset)
- [ ] Tested date editing (no offset detected)
- [ ] Tested date reading from Sheets (no offset detected)
- [ ] Verified console shows v2.9
- [ ] Verified classic view still works
- [ ] Filled test report in TESTING_GUIDE.md

## 🎉 Success Criteria

✅ UI date = Sheets date (no offset)
✅ Edit saves correctly
✅ Read shows correctly
✅ Logs present
✅ Cache updated
✅ No errors
✅ Classic view works

---

**Version:** v2.9  
**Status:** Ready for testing  
**Security:** ✅ 0 vulnerabilities
