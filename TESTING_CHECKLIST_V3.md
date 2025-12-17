# Manual Testing Checklist for Edit Mode Fix (v3.0)

## Pre-requisites
- [ ] Changes deployed to GitHub Pages
- [ ] Browser open at: https://torredecontrolcss.github.io/Dashboard_Pedidos_F8/flow-dashboard.html
- [ ] Press Ctrl+F5 to force reload and clear cache
- [ ] Open browser console (F12)

## Step 1: Verify Version
- [ ] Check console for: `flow-app.js v3.0 — Edit mode fixed with stable identifiers`
- [ ] Check console for: `[SW] Activating version: f8-dashboard-v3.0`

## Step 2: Login and Enable Edit Mode
- [ ] Click "Acceder" button
- [ ] Login with Google account
- [ ] Verify button changes to show user email
- [ ] Click "Modo edición: OFF" button
- [ ] Verify button text changes to "Modo edición: ON"
- [ ] Verify button style changes (should have .edit-on class)

## Step 3: Select a Day with Data
- [ ] Click on any day in the calendar that has highlighted dates
- [ ] Verify left panel shows requisitions for that day
- [ ] Verify title shows "Requisiciones del [date]"
- [ ] Verify requisitions are displayed as cards

## Step 4: Test Date Field Editing

### Test Case 4.1: Edit Existing Date
- [ ] Find a requisition with an existing date (e.g., "ASIGNACIÓN: 15/12/25")
- [ ] Hover over the date field - should show yellow highlight
- [ ] Click on the date field
- [ ] Verify `<input type="date">` appears
- [ ] Verify input shows the current date value (e.g., "2025-12-15")
- [ ] Change the date to a different value
- [ ] Press Enter or click outside
- [ ] Verify "Guardando..." message appears briefly
- [ ] Verify the list reloads
- [ ] Verify the new date is displayed

### Test Case 4.2: Edit Empty Date
- [ ] Find a requisition with an empty date field (showing "—")
- [ ] Click on the empty date field
- [ ] Verify `<input type="date">` appears
- [ ] Verify input is empty (no value)
- [ ] Select a date
- [ ] Press Enter
- [ ] Verify the date is saved and displayed

### Test Case 4.3: Edit Multiple Different Requisitions
- [ ] Click on a date in the FIRST requisition card, note its F8 SALMI id
- [ ] Change the date
- [ ] Click on a date in the THIRD requisition card (different F8 SALMI)
- [ ] Verify the input shows the correct date for the THIRD requisition
- [ ] Change the date
- [ ] Reload the page and verify both changes were saved correctly

## Step 5: Test Comment Field Editing
- [ ] Find a requisition with a comment
- [ ] Click on the comment field
- [ ] Verify `<select>` dropdown appears
- [ ] Verify current value is selected
- [ ] Change to a different comment option
- [ ] Press Enter or click outside
- [ ] Verify the comment is saved and displayed

## Step 6: Verify with Different Filters

### Test Case 6.1: With Grupo Filter
- [ ] Select a specific "Grupo" from the dropdown
- [ ] Verify list filters to show only that group
- [ ] Click on a date field in one of the filtered items
- [ ] Change the date
- [ ] Verify the correct requisition is updated

### Test Case 6.2: With Unidad Filter
- [ ] Select a specific "Unidad" from the dropdown
- [ ] Verify list filters to show only that unit
- [ ] Click on a date field
- [ ] Change the date
- [ ] Verify the correct requisition is updated

## Step 7: Console Verification (with DEBUG=true)

If you want to see detailed logs, temporarily set `DEBUG = true` in flow-app.js line 77.

Expected console logs when clicking and editing:
```
[FLOW-EDIT-CLICK] Clicked date field: { f8Id: "F8 8056-2025-1-259", field: "ASIGNACIÓN" }
[FLOW-DATE] formatDateInput: "2025-12-15" → "2025-12-15"
[FLOW-EDIT-CLICK] Date values: { oldDisplay: "15/12/25", oldRaw: "2025-12-15", row: {...} }
[FLOW-EDIT-CLICK] Set input.value to: "2025-12-15"
[FLOW-EDIT-CLICK] finish called: { commit: true, inputValue: "2025-12-16" }
[FLOW-EDIT-CLICK] Calling handleInlineSave with: { f8Id: "F8 8056-2025-1-259", field: "ASIGNACIÓN", newVal: "2025-12-16" }
[FLOW-EDIT] Starting save: { id: "F8 8056-2025-1-259", field: "ASIGNACIÓN", oldRaw: "2025-12-15", newValue: "2025-12-16" }
[FLOW-EDIT] Date field - sending value: 2025-12-16
[FLOW-EDIT] Backend response: { status: "ok", new_value: "2025-12-16" }
[FLOW-EDIT] Save successful, reloading data...
```

## Step 8: Verify in Google Sheets
- [ ] Open the Google Sheets backend
- [ ] Find the edited requisition by F8 SALMI id
- [ ] Verify the date column shows the updated value
- [ ] Verify format matches what was entered

## Expected Results Summary

✅ Date input shows current value correctly  
✅ Date input is editable and accepts changes  
✅ Changes are saved to the correct requisition  
✅ Changed values persist after reload  
✅ Works with sorted/filtered views  
✅ Works with multiple requisitions  
✅ No console errors  
✅ Backend receives correct F8 SALMI id  

## Known Issues to Verify Are Fixed

❌ OLD BUG: Clicking on sorted row #3 would edit unsorted row #3 (wrong row)  
✅ NEW: Clicking on any row edits that specific row by F8 SALMI id

❌ OLD BUG: Date input would show empty or wrong date  
✅ NEW: Date input shows the correct current date

❌ OLD BUG: Changes wouldn't persist or would save to wrong row  
✅ NEW: Changes save correctly and persist

## Troubleshooting

If dates still don't show:
1. Verify DEBUG logs show correct f8Id matching the F8 SALMI in the card
2. Verify `row` is found (not undefined) in console
3. Verify `oldRaw` has the expected date value
4. Verify `input.value` is set correctly

If changes save to wrong row:
1. Check that HTML has `data-f8-id` attribute (not `data-row-index`)
2. Check console shows correct f8Id being passed to handleInlineSave
3. Verify backend receives the correct F8 SALMI id

If changes don't persist:
1. Check that backend response is `status: "ok"`
2. Verify reload happens after save
3. Check Google Sheets manually to see if value was actually updated

---

**Test Date:** ___________  
**Tester:** ___________  
**Result:** ☐ PASS  ☐ FAIL  
**Notes:** ___________
