# Quick Start Guide: Dashboard de Flujo de Procesos

## 🚀 Getting Started in 3 Steps

### Step 1: Deploy Files
Simply upload all files from the `docs/` folder to your web server. No build process needed!

### Step 2: Access the Dashboard
Open `flow-dashboard.html` in your browser:
```
https://your-domain.com/flow-dashboard.html
```

### Step 3: Start Tracking
The dashboard will automatically load data from your Google Sheets and display:
- Process flow blocks
- Interactive calendar
- Order lists
- Analytics charts

## 📖 Basic Usage

### Viewing Orders by Stage
1. Look at the process flow blocks at the top
2. Each block shows the stage name and order count
3. **Click any block** to see orders in that stage
4. Click "Limpiar filtro" to reset

### Viewing Orders by Date
1. Look at the calendar on the right
2. Dates with orders show a badge with the count
3. **Click any date** to see orders scheduled for that day
4. The calendar shows which stages are scheduled for that date

### Understanding the Colors

**Calendar:**
- 🔴 **Red** = Past dates (may have delays)
- 🟠 **Orange** = Today
- 🔵 **Blue** = Future dates

**Deltas (Time Differences):**
- 🔴 **Red** = Delayed (positive delta)
- 🟢 **Green** = Early (negative delta)  
- ⚪ **Gray** = On time (zero delta)

### Editing Dates (Requires Login)
1. Click **"Acceder"** button in header
2. Sign in with Google account
3. Click **"Modo edición: OFF"** to turn ON
4. Click any **yellow date field** to edit
5. Select new date and press Enter
6. Delta is automatically recalculated!

## 📊 Understanding the Metrics

### Quick Stats (Top Panel)
- **Total Pedidos**: All orders in system
- **En Proceso**: Orders not yet completed
- **Completados**: Orders with ENTREGA REAL date
- **Con Retraso**: Orders with any positive delta

### Time KPIs (Right Panel)
- **Tiempo promedio teórico**: Expected cycle time (8 days from RECIBO F8)
- **Tiempo promedio real**: Actual observed cycle time
- **Delta promedio**: Average difference per order
- **Delta acumulado**: Total accumulated delays/savings

### Charts

**Gap Analysis Chart:**
- Blue line = Cumulative delays over time
- Red line = Average delay per date
- Helps identify trends

**Stage Deltas Chart:**
- Shows which stages have most delays
- Red bars = delays, Green bars = early completion
- Helps identify bottlenecks

## 🔄 Process Flow Explained

Your orders move through 7 stages with theoretical dates calculated from RECIBO F8:

```
Day 0:  RECIBO F8       (Base date - only real date entered)
Day 1:  ASIGNACIÓN      (+1 day from RECIBO)
Day 2:  SALIDA          (+1 day from ASIGNACIÓN)
Day 3:  DESPACHO        (+1 day from SALIDA)
Day 4:  FACTURACIÓN     (+1 day from DESPACHO)
Day 7:  EMPACADO        (+3 days from FACTURACIÓN)
Day 8:  PROY. ENTREGA   (+1 day from EMPACADO)
```

**Example:**
- If RECIBO F8 = January 1
- Then ASIGNACIÓN should be = January 2 (theoretical)
- If ASIGNACIÓN real date = January 5
- Then Delta = +3 days (delayed)

## 🎯 Common Tasks

### Find Delayed Orders
1. Look at "Con Retraso" in Quick Stats
2. Click any stage block to see its orders
3. Look for red delta indicators
4. Check the Stage Deltas chart to find problem areas

### Track a Specific Order
1. Use browser Find (Ctrl+F / Cmd+F)
2. Search for F8 SALMI number
3. View its current stage and dates
4. See progress (X/7 stages completed)

### Export Data for Analysis
1. Click **"📊 Exportar"** button
2. Downloads CSV with current view
3. Open in Excel/Sheets for deeper analysis
4. Includes theoretical dates, real dates, and deltas

### Check Next Month's Schedule
1. In the calendar, click **"▶"** (Next Month)
2. See which dates have orders scheduled
3. Plan resources accordingly
4. Click **"◀"** to go back

## 💡 Pro Tips

### Tip 1: Focus on High-Impact Stages
Look at the Stage Deltas chart to see which stages consistently have delays. Focus improvement efforts there.

### Tip 2: Use Date Filtering for Planning
Click on future dates in the calendar to see what's coming up. This helps with capacity planning.

### Tip 3: Monitor Cumulative Delta
Watch the blue line in the Gap Analysis chart. If it's climbing, delays are accumulating over time.

### Tip 4: Compare Stages
Click through different stage blocks to compare order counts. Imbalances may indicate bottlenecks.

### Tip 5: Check Progress Percentages
Orders showing low progress percentages (like 2/7) but with recent RECIBO dates may need attention.

## 🆘 Troubleshooting

### Problem: Data not loading
**Solution**: 
- Check internet connection
- Verify Google Sheets scripts are running
- Try clicking "Actualizar" (Refresh) button

### Problem: Can't edit dates
**Solution**:
- Click "Acceder" and sign in with Google
- Click "Modo edición: OFF" to turn it ON
- Make sure you have permissions in Google Sheets

### Problem: Chart not showing
**Solution**:
- Wait a moment for data to load
- Check browser console for errors (F12)
- Try refreshing the page

### Problem: Calendar shows wrong month
**Solution**:
- Use ◀ ▶ buttons to navigate
- System starts on current month
- Dates update when data loads

## 🔗 Switching Between Dashboards

**From Classic Dashboard:**
- Click "Vista de Flujo" button in header

**From Flow Dashboard:**
- Click "Vista Clásica" button in header

**Both dashboards:**
- Access same Google Sheets data
- Support editing with authentication
- Can be used simultaneously

## 📱 Mobile Usage

The dashboard works on mobile devices:
- Process blocks scroll horizontally
- Calendar adjusts to screen size
- Charts remain interactive
- Editing still works (with login)

## ⚠️ Important Notes

1. **RECIBO F8 is the only required real date** - All other dates are calculated or entered by staff
2. **Theoretical dates are automatic** - They update if RECIBO F8 changes
3. **Deltas show performance** - Track these to improve your process
4. **Authentication required for editing** - Read-only access without login
5. **Data syncs with Google Sheets** - Changes appear in both places

## 📞 Need Help?

1. Check the full [README.md](README.md) for detailed documentation
2. Review [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) for technical details
3. Contact Torre de Control CSS support team

---

**Welcome to the new Dashboard de Flujo de Procesos!** 🎉

This tool will help you visualize your order process, identify delays, and improve overall performance. Start by clicking around - the interface is designed to be intuitive and self-explanatory.
