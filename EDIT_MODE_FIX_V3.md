# Fix para Modo Edición - v3.0

## Problema Identificado

El modo de edición del bloque izquierdo (left panel) no funcionaba correctamente:
- Al hacer clic en un campo de fecha, no se mostraba el valor actual en el input
- Al guardar un valor, se guardaba en la fila incorrecta
- Los valores ingresados no se mantenían después de editar

## Causa Raíz

El problema estaba en el uso de índices de array para identificar las filas:

1. **En `renderOrdersList()`**: Se ordenaban las filas con `sort()` y se generaba HTML con `data-row-index="${idx}"`, donde `idx` era el índice en el array **ordenado**.

2. **En `onOrdersListClick()`**: Se leía el `data-row-index` y se usaba para buscar en `currentRows[idx]`, pero `currentRows` es el array **sin ordenar/original**.

3. **Resultado**: Si el usuario hacía clic en la 3ra fila ordenada (idx=2), el código intentaba editar `currentRows[2]`, que podría ser una fila completamente diferente.

```
Ejemplo del problema:

currentRows (sin ordenar):
[0] F8-1234 (DESPACHO)
[1] F8-5678 (RECIBO)
[2] F8-9012 (ASIGNACIÓN)

sorted (ordenado por etapa):
[0] F8-5678 (RECIBO)      ← Usuario hace clic aquí (idx=0 en sorted)
[1] F8-9012 (ASIGNACIÓN)
[2] F8-1234 (DESPACHO)

onOrdersListClick():
  idx = 0
  row = currentRows[0]  ← Obtiene F8-1234 ¡incorrecto!
```

## Solución Implementada

Cambiar de usar **índices de array** a usar **identificador estable F8 SALMI**:

### 1. Cambios en HTML generado (`renderOrdersList`)

**Antes:**
```javascript
data-row-index="${idx}"
```

**Después:**
```javascript
data-f8-id="${id}"  // donde id = r['F8 SALMI']
```

### 2. Cambios en Click Handler (`onOrdersListClick`)

**Antes:**
```javascript
const idx = parseInt(spanDate.getAttribute('data-row-index'), 10);
const row = rows[idx];
```

**Después:**
```javascript
const f8Id = spanDate.getAttribute('data-f8-id');
const row = rows.find(r => r['F8 SALMI'] === f8Id);
```

### 3. Cambios en Función de Guardado (`handleInlineSave`)

**Antes:**
```javascript
async function handleInlineSave(rowIndex, field, newValue, displayEl) {
  const row = rows[rowIndex];
  // ...
}
```

**Después:**
```javascript
async function handleInlineSave(f8Id, field, newValue, displayEl) {
  const row = rows.find(r => r['F8 SALMI'] === f8Id);
  // ...
}
```

## Archivos Modificados

- **docs/flow-app.js**: Cambios principales en lógica de edición
- **docs/sw.js**: Actualizado cache version de v2.9 a v3.0
- **docs/flow-dashboard.html**: Ya tenía v3.0 en el script tag

## Logging de Debug

Se habilitó logging detallado para facilitar troubleshooting:

```javascript
console.log('[FLOW-DATE] parseIsoDate:', v, '→', d);
console.log('[FLOW-DATE] formatDateInput:', v, '→', result);
console.log('[FLOW-EDIT-CLICK] Clicked date field:', { f8Id, field });
console.log('[FLOW-EDIT-CLICK] Date values:', { oldDisplay, oldRaw, row });
console.log('[FLOW-EDIT-CLICK] Set input.value to:', input.value);
console.log('[FLOW-EDIT] Starting save:', { id, field, oldRaw, newValue });
```

## Cómo Probar el Fix

1. **Desplegar** los cambios en GitHub Pages (automático después del push)

2. **Abrir** flow-dashboard.html con Ctrl+F5 (forzar recarga)

3. **Verificar en consola**:
   ```
   flow-app.js v3.0 — Edit mode fixed with stable identifiers
   [SW] Activating version: f8-dashboard-v3.0
   ```

4. **Iniciar sesión** con el botón "Acceder"

5. **Activar modo edición** con botón "Modo edición: OFF" → debe cambiar a "ON"

6. **Seleccionar un día** en el calendario para filtrar requisiciones

7. **Hacer clic en un campo de fecha** en el panel izquierdo:
   - Debe aparecer un `<input type="date">` 
   - El input debe mostrar la fecha actual (si existe)
   - El input debe tener el foco

8. **Cambiar la fecha** y presionar Enter o click fuera:
   - Debe guardar el cambio
   - La lista debe recargarse
   - La nueva fecha debe aparecer en la UI

9. **Verificar en consola** que los logs muestran el f8Id correcto:
   ```
   [FLOW-EDIT-CLICK] Clicked date field: { f8Id: "F8 8056-2025-1-259", field: "ENTREGA REAL" }
   [FLOW-EDIT] Starting save: { id: "F8 8056-2025-1-259", field: "ENTREGA REAL", ... }
   ```

## Beneficios del Fix

✅ **Estabilidad**: Uso de identificador único en lugar de índice de array
✅ **Corrección**: Siempre edita la fila correcta independiente del ordenamiento
✅ **Mantenibilidad**: Más fácil de entender y debug con logging mejorado
✅ **Robustez**: Funciona con cualquier filtro o ordenamiento aplicado

## Compatibilidad

- ✅ Vista Clásica (index.html + app.js): No afectada
- ✅ Vista Flujo (flow-dashboard.html + flow-app.js): Corregida
- ✅ Edición de comentarios: También usa F8 SALMI id
- ✅ Edición de fechas: Usa F8 SALMI id
- ✅ PWA / Service Worker: Cache actualizado a v3.0

---

**Versión:** 3.0  
**Fecha:** 2025-12-17  
**Issue:** Modo edición del bloque izquierdo no funcionaba correctamente
