# Dashboard de Pedidos F8 - Torre de Control

Sistema de seguimiento de requisiciones y pedidos con análisis de flujo de procesos.

## Versiones del Dashboard

### 1. Dashboard Clásico (index.html)
Vista tradicional con tabla completa, filtros avanzados y análisis estadístico.

**Características:**
- Tabla completa de todos los pedidos con paginación
- Filtros por categoría, unidad, tipo, grupo, estado, comentarios
- KPIs generales (totales, asignados, solicitados, etc.)
- Gráficos de evolución y análisis de comentarios
- Análisis de congestionamiento (M/M/s)
- Edición inline de fechas y comentarios
- Sincronización bidireccional con Google Sheets

**Acceso:** `index.html` o `index-classic.html`

---

### 2. Dashboard de Flujo de Procesos (flow-dashboard.html) ⭐ NUEVO

Vista interactiva basada en el flujo del proceso con análisis de tiempos teóricos vs. reales.

**Características:**

#### 📊 Bloques de Flujo Interactivo
Visualización del proceso completo en la parte superior:
- **RECIBO F8** → **ASIGNACIÓN** (+1d) → **SALIDA** (+1d) → **DESPACHO** (+1d) → **FACTURACIÓN** (+1d) → **EMPACADO** (+3d) → **PROY. ENTREGA** (+1d)
- Click en cada bloque para filtrar pedidos en esa etapa
- Contador de pedidos por etapa
- Indicador visual de la etapa activa

#### 📅 Calendario Interactivo
- Vista mensual con navegación
- Marcadores en días con pedidos programados
- Click en cualquier día para ver pedidos programados
- Clasificación por etapa de proceso
- Código de colores:
  - 🔴 Rojo: Fechas vencidas
  - 🟠 Naranja: Día actual
  - 🔵 Azul: Fechas programadas

#### 📋 Lista de Pedidos Filtrados
- Vista detallada de pedidos por etapa o fecha
- Muestra fechas teóricas y fechas reales
- Indicadores visuales de deltas (retrasos/adelantos)
- Edición de fechas reales en modo edición
- Información de progreso por pedido

#### 📈 Análisis de Deltas
**Gráfico de Deltas en el Tiempo:**
- Delta promedio por fecha
- Delta acumulado total
- Tendencias de retrasos/adelantos

**Deltas por Etapa del Proceso:**
- Promedio de retraso/adelanto por cada etapa
- Identificación de cuellos de botella
- Código de colores por tipo de delta

#### 🔢 KPIs de Tiempo
- **Tiempo promedio teórico:** Tiempo ideal del proceso
- **Tiempo promedio real:** Tiempo real observado
- **Delta promedio:** Diferencia promedio entre real y teórico
- **Delta acumulado:** Suma total de todos los deltas

#### ✏️ Edición de Fechas
- Modo edición para actualizar fechas reales
- Sincronización automática con Google Sheets
- Recalculo automático de deltas
- Validación de cambios

**Acceso:** `flow-dashboard.html`

---

## Cálculo de Fechas Teóricas

Las fechas teóricas se calculan automáticamente a partir de la fecha **RECIBO F8**:

| Etapa | Días desde RECIBO F8 | Fórmula |
|-------|----------------------|---------|
| RECIBO F8 | 0 días | Fecha base |
| ASIGNACIÓN | +1 día | RECIBO F8 + 1 |
| SALIDA | +2 días | RECIBO F8 + 2 |
| DESPACHO | +3 días | RECIBO F8 + 3 |
| FACTURACIÓN | +4 días | RECIBO F8 + 4 |
| EMPACADO | +7 días | RECIBO F8 + 7 |
| PROY. ENTREGA | +8 días | RECIBO F8 + 8 |

## Análisis de Deltas

El sistema calcula automáticamente:

- **Delta = Fecha Real - Fecha Teórica**
  - Delta positivo (+): Retraso respecto a lo planificado
  - Delta negativo (-): Adelanto respecto a lo planificado
  - Delta cero (0): Exactamente en tiempo

## Integración con Google Sheets

Ambos dashboards mantienen comunicación bidireccional:

- **Lectura:** Carga automática de datos desde Google Sheets
- **Escritura:** Actualización de fechas reales al editar
- **Autenticación:** Google OAuth para permisos de edición

### Scripts de Google Apps Script

- **Script A (Lectura):** `orders.list`, `filters.update`, `stats`, `queue.metrics`
- **Script B (Escritura):** `orders.update`

## Uso

### Inicio de Sesión
1. Click en "Acceder" en el header
2. Autenticar con cuenta de Google
3. Activar "Modo edición: ON" para editar

### Navegación entre Dashboards
- Desde clásico → flujo: Click en "Vista de Flujo"
- Desde flujo → clásico: Click en "Vista Clásica"

### Filtrado en Dashboard de Flujo
**Por Etapa:**
1. Click en cualquier bloque del flujo (ej: ASIGNACIÓN)
2. Ver todos los pedidos en esa etapa
3. Click en "Limpiar filtro" para volver

**Por Fecha:**
1. Click en cualquier día del calendario
2. Ver pedidos programados para ese día
3. Click en "Limpiar filtro" para volver

### Edición de Fechas
1. Activar "Modo edición: ON"
2. Click en fecha real (amarillo claro)
3. Seleccionar nueva fecha
4. Guardar (Enter) o cancelar (Esc)
5. El sistema recalcula automáticamente los deltas

## Tecnologías

- **Frontend:** HTML5, CSS3, JavaScript (Vanilla)
- **Gráficos:** Chart.js
- **Backend:** Google Apps Script
- **Almacenamiento:** Google Sheets
- **Autenticación:** Google Identity Services

## Estructura de Archivos

```
docs/
├── index.html              # Dashboard clásico (actual)
├── app.js                  # Lógica dashboard clásico
├── styles.css              # Estilos dashboard clásico
├── metrics.js              # Gráficos dashboard clásico
├── flow-dashboard.html     # Dashboard de flujo (nuevo)
├── flow-app.js             # Lógica dashboard de flujo
├── flow-styles.css         # Estilos dashboard de flujo
├── index-classic.html      # Backup dashboard clásico
├── app-classic.js          # Backup lógica clásica
├── styles-classic.css      # Backup estilos clásicos
├── edit.html               # Editor alternativo
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
└── assets/                 # Imágenes y recursos
    └── logo.png
```

## Notas de Versión

### v2.0 (Dashboard de Flujo) - 2025-12-10
- ✨ Nuevo dashboard de flujo de procesos
- 📊 Bloques interactivos de etapas
- 📅 Calendario interactivo mensual
- 📈 Análisis de deltas teórico vs real
- 🎯 KPIs de tiempo y progreso
- ✏️ Edición de fechas con recalculo automático
- 🔄 Navegación entre dashboards

### v1.0 (Dashboard Clásico) - 2025-12-01
- Versión inicial del dashboard
- Tabla con filtros y paginación
- Gráficos y análisis estadístico
- Edición inline de campos
- Integración con Google Sheets

## Soporte

Para reportar problemas o sugerencias, contactar al equipo de Torre de Control.

---

**Desarrollado por Torre de Control CSS**
