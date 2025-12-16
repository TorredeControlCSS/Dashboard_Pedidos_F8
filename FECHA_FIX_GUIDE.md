# Guía de Corrección del Manejo de Fechas - Flow Dashboard

## Resumen del Problema

El dashboard de flujo (`flow-dashboard.html`) mostraba fechas con desfase de ±1 día respecto a lo que estaba en Google Sheets. Al editar una fecha, el backend respondía correctamente pero la UI seguía mostrando la fecha incorrecta.

**Causas identificadas:**
1. Offsets de zona horaria aplicados incorrectamente en el frontend
2. Service Worker sirviendo versiones antiguas del código JS
3. Falta de estrategia de cache busting para actualizaciones

## Cambios Realizados (v2.9)

### 1. Frontend (flow-app.js)

**Eliminado:** Lógica de offset de fechas en `handleInlineSave()`
- Antes: Se restaba 1 día antes de enviar al backend
- Ahora: Se envía exactamente la fecha seleccionada por el usuario en formato `YYYY-MM-DD`

**Mejorado:** Funciones de manejo de fechas
- `parseIsoDate()`: Parsea fechas como UTC (`new Date('YYYY-MM-DDT00:00:00Z')`)
- `formatDateInput()`: Convierte a formato `YYYY-MM-DD` para `<input type="date">`
- `formatDateShort()`: Muestra como `DD/MM/YY` para el usuario
- Todas usan métodos UTC (`getUTCDate()`, `getUTCMonth()`, `getUTCFullYear()`)

**Añadido:** Logging de depuración con prefijo `[FLOW-EDIT]`
```javascript
console.log('[FLOW-EDIT] Starting save:', { id, field, oldRaw, newValue, rowIndex });
console.log('[FLOW-EDIT] Date field - sending value:', valueToSend);
console.log('[FLOW-EDIT] Backend response:', res);
```

**Añadido:** Documentación extensa sobre la estrategia de fechas (ver comentarios en flow-app.js)

### 2. Service Worker (sw.js)

**Actualizado:** Cache version de `v1` a `v2.9`
- Automáticamente invalida cachés antiguos en el evento `activate`

**Corregido:** URLs en cache
- Antes: `'./Dashboard_Pedidos_F8/flow-dashboard.html'` (incorrecto para GitHub Pages)
- Ahora: `'./flow-dashboard.html'` (relativo correcto)

**Mejorado:** Estrategia de caching
- Network-first para archivos `.js` y `.css` → siempre obtiene la última versión
- Cache-first para HTML e imágenes
- Excluye APIs externas (script.google.com, accounts.google.com) del cache

**Añadido:** Logging de operaciones del SW
```javascript
console.log('[SW] Installing version:', CACHE_NAME);
console.log('[SW] Activating version:', CACHE_NAME);
console.log('[SW] Clearing old caches:', oldCaches);
```

### 3. HTML (flow-dashboard.html)

**Actualizado:** Version tag del script
- Antes: `<script src="flow-app.js?v=2.5"></script>`
- Ahora: `<script src="flow-app.js?v=2.9"></script>`

**Añadido:** Comentarios sobre cache busting strategy

## Flujo de Fechas Correcto

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Usuario selecciona fecha en <input type="date">             │
│    → Obtiene: "2025-12-16" (YYYY-MM-DD)                        │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. handleInlineSave() valida y normaliza                       │
│    → Envía al backend B: "2025-12-16" (sin offset)             │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Backend B (Apps Script) escribe en Google Sheets            │
│    → Debe escribir: "2025-12-16" o Date(2025, 11, 16)          │
│    ⚠️ NO aplicar offsets de zona horaria                        │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Backend A (Apps Script) lee de Google Sheets                │
│    → Debe devolver: "2025-12-16" (YYYY-MM-DD)                  │
│    ⚠️ NO aplicar función parseDateCell() con +1 día             │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. Frontend parsea y muestra                                    │
│    → parseIsoDate(): new Date("2025-12-16T00:00:00Z")          │
│    → formatDateShort(): "16/12/25"                             │
└─────────────────────────────────────────────────────────────────┘
```

## Cambios Necesarios en Apps Script

### Backend A (Lectura) - AKfycbxMr-fkiplPoBPm_x6V9ZnEMB9...

Si existe una función `parseDateCell(v)` que suma +1 día:

```javascript
// ❌ ELIMINAR ESTO:
function parseDateCell(v) {
  if (!v) return '';
  const d = new Date(v);
  d.setDate(d.getDate() + 1); // ← ESTE OFFSET CAUSA EL PROBLEMA
  return Utilities.formatDate(d, 'GMT', 'yyyy-MM-dd');
}

// ✅ REEMPLAZAR CON:
function parseDateCell(v) {
  if (!v) return '';
  const d = new Date(v);
  // Sin offset - devolver la fecha tal cual
  return Utilities.formatDate(d, 'GMT', 'yyyy-MM-dd');
}
```

### Backend B (Escritura) - AKfycbysdeYW1g-l1p6ZOyk9...

Asegurar que la ruta `orders.update` escriba fechas correctamente:

```javascript
// ✅ CORRECTO: Escribir string directamente
sheet.getRange(row, col).setValue(value); // value = "2025-12-16"

// O si necesitas Date object:
function parseIsoDate(dateStr) {
  // dateStr = "2025-12-16"
  const parts = dateStr.split('-');
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1; // JS months son 0-indexed
  const day = parseInt(parts[2]);
  return new Date(year, month, day);
}
```

## Cómo Desplegar Actualizaciones

Para futuros cambios en `flow-app.js` o `flow-styles.css`:

1. **Editar el código** en el archivo correspondiente

2. **Incrementar versiones:**
   - En `sw.js`: cambiar `CACHE_NAME = 'f8-dashboard-v2.9'` a `v2.10`, etc.
   - En `flow-dashboard.html`: cambiar `<script src="flow-app.js?v=2.9">` a `?v=2.10`

3. **Commit y push** a GitHub

4. **GitHub Pages** actualiza automáticamente (1-2 minutos)

5. **Usuario debe hacer Ctrl+F5** para forzar recarga:
   - Service Worker detecta nueva versión
   - Invalida cache antiguo
   - Descarga nuevos archivos JS/CSS con network-first strategy

## Verificación del Fix

### En Consola del Navegador (F12)

Buscar estos logs al editar una fecha:

```
[FLOW-EDIT] Starting save: { id: "F8 8056-2025-1-259", field: "ENTREGA REAL", oldRaw: "2025-12-15", newValue: "2025-12-16", rowIndex: 0 }
[FLOW-EDIT] Date field - sending value: 2025-12-16
[FLOW-EDIT] Backend response: { status: "ok", new_value: "2025-12-16" }
[FLOW-EDIT] Save successful, reloading data...
```

### En Google Sheets

1. Abrir la hoja de requisiciones
2. Buscar la celda editada (por ejemplo columna "ENTREGA REAL", fila del F8 8056-2025-1-259)
3. Verificar que muestra exactamente `16-dic-25` o `2025-12-16`

### En Flow Dashboard

1. Recargar con Ctrl+F5
2. Verificar que muestra `16/12/25` en la UI
3. El día 16 debe aparecer resaltado en el calendario si es la "ENTREGA REAL"

## Solución de Problemas

### "Sigo viendo fechas desfasadas ±1 día"

1. Verificar que Apps Script backend A no tenga offset en `parseDateCell()`
2. Hacer Ctrl+F5 en el navegador (forzar recarga sin cache)
3. Verificar en consola que se carga `flow-app.js v2.9`
4. Si persiste, limpiar manualmente el cache del navegador:
   - Chrome: Configuración → Privacidad → Borrar datos de navegación → Imágenes y archivos en caché

### "Los cambios no se ven después de hacer push"

1. Esperar 2-3 minutos para que GitHub Pages actualice
2. Verificar que el CACHE_NAME en sw.js se incrementó
3. Verificar que el ?v= en el script tag se incrementó
4. Hacer Ctrl+F5 (no solo F5)
5. En consola buscar: `[SW] Activating version: f8-dashboard-v2.X`

### "El backend responde OK pero la fecha no cambia en la UI"

1. Revisar logs en consola: buscar `[FLOW-EDIT] Backend response`
2. Verificar que `new_value` en la respuesta coincide con lo enviado
3. Verificar que se ejecuta `[FLOW-EDIT] Save successful, reloading data...`
4. Si el reload falla silenciosamente, puede ser problema de red o backend A

## Testing Manual

### Caso de prueba: Editar ENTREGA REAL

1. **Setup:**
   - Login con "Acceder"
   - Activar "Modo edición: ON"
   - Seleccionar un día en el calendario
   - Localizar una requisición sin ENTREGA REAL

2. **Acción:**
   - Click en la fecha "Entrega Real" (muestra "—")
   - Aparece `<input type="date">`
   - Seleccionar 16 de diciembre de 2025
   - Press Enter o click fuera del input

3. **Resultado esperado:**
   - Backend responde status: "ok"
   - La lista se recarga
   - La fecha muestra "16/12/25"
   - En Sheets aparece "16-dic-25"
   - El calendario resalta el día 16

4. **Verificar en consola:**
   ```
   [FLOW-EDIT] Date field - sending value: 2025-12-16
   [FLOW-EDIT] Backend response: {status: "ok", new_value: "2025-12-16"}
   ```

## Compatibilidad

✅ **Vista Clásica (index.html + app.js):** No afectada, usa su propia lógica de fechas
✅ **Vista Flujo (flow-dashboard.html + flow-app.js):** Corregida en v2.9
✅ **PWA / Service Worker:** Actualizado a v2.9 con cache busting
✅ **Navegadores:** Chrome, Edge, Firefox, Safari (todos con soporte de `<input type="date">`)

## Recursos

- Código: [TorredeControlCSS/Dashboard_Pedidos_F8](https://github.com/TorredeControlCSS/Dashboard_Pedidos_F8)
- Producción: [GitHub Pages - Flow Dashboard](https://torredecontrolcss.github.io/Dashboard_Pedidos_F8/flow-dashboard.html)
- Backend A: `script.google.com/macros/.../AKfycbxMr-fkiplPo...`
- Backend B: `script.google.com/macros/.../AKfycbysdeYW1g-l1p...`

---

**Versión de este documento:** 2025-12-16  
**Cambios aplicados en:** flow-app.js v2.9, sw.js v2.9, flow-dashboard.html v2.9
