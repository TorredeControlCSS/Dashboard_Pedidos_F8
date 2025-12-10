# 🚀 Guía de Implementación Simple - Dashboard de Flujo

## ¿Qué tienes que hacer?

**Nada complicado!** Ya está todo listo. Solo necesitas 2 pasos:

---

## Paso 1: Los archivos ya están en tu repositorio ✅

El nuevo dashboard ya está en tu carpeta `docs/`. Los archivos importantes son:

```
docs/
├── flow-dashboard.html   ← ESTE ES EL NUEVO DASHBOARD
├── flow-app.js           ← Lógica del nuevo dashboard
├── flow-styles.css       ← Estilos del nuevo dashboard
└── index.html            ← Dashboard clásico (sin cambios importantes)
```

**No necesitas instalar nada.** No hay npm, no hay build, no hay dependencias.

---

## Paso 2: Acceder al nuevo dashboard

### Opción A: Si tu dashboard está en GitHub Pages

1. Ve a tu repositorio en GitHub
2. Abre la URL de GitHub Pages (algo como `https://torredecontrolcss.github.io/Dashboard_Pedidos_F8/`)
3. Agrega `/flow-dashboard.html` al final
4. **URL completa**: `https://torredecontrolcss.github.io/Dashboard_Pedidos_F8/flow-dashboard.html`

### Opción B: Si tu dashboard está en otro servidor

1. Los archivos están en la carpeta `docs/`
2. Sube TODA la carpeta `docs/` a tu servidor (si no está ya)
3. Accede a: `https://tu-dominio.com/flow-dashboard.html`

### Opción C: Probar localmente en tu computadora

1. Descarga el repositorio
2. Abre la carpeta `docs/`
3. Haz doble clic en `flow-dashboard.html`
4. Se abrirá en tu navegador

---

## ¿Y ya? ¿Eso es todo?

**¡SÍ!** El nuevo dashboard ya funciona. Solo ábrelo en el navegador.

---

## Cómo usar el nuevo dashboard

### 1. Los Bloques de Flujo (arriba)

```
[RECIBO F8] → [ASIGNACIÓN] → [SALIDA] → [DESPACHO] → [FACTURACIÓN] → [EMPACADO] → [PROY. ENTREGA]
```

- **¿Qué hacer?** Haz clic en cualquier bloque
- **¿Qué pasa?** Se filtran los pedidos que están en esa etapa
- **Ejemplo**: Click en "ASIGNACIÓN" → Ves solo pedidos en asignación

### 2. El Calendario (derecha)

- **¿Qué hacer?** Haz clic en cualquier fecha
- **¿Qué pasa?** Ves los pedidos programados para ese día
- **Ejemplo**: Click en "15 de diciembre" → Ves qué pedidos deben estar listos ese día

### 3. Las Fechas Teóricas

El sistema calcula automáticamente cuándo DEBERÍA estar cada pedido en cada etapa:

| Etapa | Cuándo debería estar |
|-------|---------------------|
| RECIBO F8 | Día 0 (la fecha que ingresas) |
| ASIGNACIÓN | 1 día después del recibo |
| SALIDA | 2 días después del recibo |
| DESPACHO | 3 días después del recibo |
| FACTURACIÓN | 4 días después del recibo |
| EMPACADO | 7 días después del recibo |
| PROY. ENTREGA | 8 días después del recibo |

**Ejemplo**: 
- Si RECIBO F8 = 1 de enero
- Entonces ASIGNACIÓN debería ser = 2 de enero (teórico)
- Si la fecha real fue = 5 de enero
- El sistema muestra: **+3 días de retraso** (en rojo)

### 4. Los Gráficos

**Gráfico de Deltas**: Muestra si vas atrasado o adelantado en general

**Gráfico por Etapa**: Muestra qué etapas tienen más retrasos

---

## ¿Necesito configurar algo?

**NO.** El dashboard usa las mismas credenciales de Google Sheets que tu dashboard anterior.

---

## ¿Qué pasa con mi dashboard anterior?

**Sigue funcionando perfectamente.** No se eliminó nada.

- Dashboard clásico: `index.html` (el que usabas antes)
- Dashboard nuevo: `flow-dashboard.html` (el de flujo de procesos)

Puedes usar ambos. En cada uno hay un botón para cambiar entre uno y otro.

---

## ¿Cómo edito fechas?

**Igual que antes:**

1. Haz clic en "Acceder" (arriba a la derecha)
2. Inicia sesión con Google
3. Activa "Modo edición: ON"
4. Haz clic en cualquier fecha amarilla
5. Selecciona la nueva fecha
6. El sistema recalcula automáticamente los retrasos/adelantos

---

## ¿Qué es cada archivo?

### Archivos que debes conocer:

| Archivo | Para qué sirve |
|---------|---------------|
| `flow-dashboard.html` | El nuevo dashboard (ESTE ES EL QUE ABRES) |
| `flow-app.js` | La lógica del nuevo dashboard |
| `flow-styles.css` | Los estilos del nuevo dashboard |
| `index.html` | Tu dashboard clásico (sin cambios) |

### Archivos de respaldo (por si acaso):

| Archivo | Para qué sirve |
|---------|---------------|
| `index-classic.html` | Copia de seguridad del dashboard anterior |
| `app-classic.js` | Copia de seguridad de la lógica anterior |
| `styles-classic.css` | Copia de seguridad de los estilos anteriores |

**Estos archivos de respaldo son solo por seguridad.** Si algo falla, puedes volver a la versión anterior.

---

## Preguntas frecuentes

### ❓ "¿Tengo que instalar algo?"
**No.** Solo abre `flow-dashboard.html` en el navegador.

### ❓ "¿Funciona con mi Google Sheets?"
**Sí.** Usa las mismas credenciales que tu dashboard anterior.

### ❓ "¿Puedo seguir usando el dashboard anterior?"
**Sí.** Ambos funcionan. Usa el que prefieras.

### ❓ "¿Cómo cambio entre dashboards?"
Arriba a la derecha hay botones:
- En el clásico: "Vista de Flujo" 
- En el de flujo: "Vista Clásica"

### ❓ "¿Funciona en el celular?"
**Sí.** El diseño es responsive y funciona en móviles.

### ❓ "¿Puedo personalizar los días de cada etapa?"
Sí, pero necesitas editar el archivo `flow-app.js` líneas 11-18. Los valores actuales son:
```javascript
'ASIGNACION': { offset: 1 },   // +1 día
'SALIDA': { offset: 2 },       // +2 días
'DESPACHO': { offset: 3 },     // +3 días
'FACTURACION': { offset: 4 },  // +4 días
'EMPACADO': { offset: 7 },     // +7 días (tenía +3 desde FACTURACIÓN)
'ENTREGA': { offset: 8 }       // +8 días
```

---

## Resumen: ¿Qué hago YA?

### Si tienes GitHub Pages activado:
1. Acepta este Pull Request (merge)
2. Espera 1-2 minutos
3. Abre: `https://tu-usuario.github.io/tu-repo/flow-dashboard.html`
4. **¡Listo!**

### Si no tienes GitHub Pages:
1. Acepta este Pull Request (merge)
2. Ve a la carpeta `docs/` en tu repositorio
3. Descarga los archivos y súbelos a tu servidor
4. Abre: `https://tu-servidor.com/flow-dashboard.html`
5. **¡Listo!**

### Para probar sin hacer merge:
1. Descarga los archivos de la carpeta `docs/`
2. Abre `flow-dashboard.html` en tu navegador
3. **¡Listo para probar!**

---

## ¿Necesitas ayuda?

Si tienes problemas:

1. Verifica que los archivos estén en la carpeta `docs/`
2. Asegúrate de abrir `flow-dashboard.html` (no otros archivos)
3. Revisa la consola del navegador (F12) para ver errores
4. Los datos vienen del mismo Google Sheets que antes

---

## 🎯 En resumen

**LO QUE TIENES QUE HACER:**
1. ✅ Acepta el Pull Request (o descarga los archivos)
2. ✅ Abre `flow-dashboard.html` en el navegador

**ESO ES TODO.** No hay instalaciones, configuraciones ni compilaciones.

¡El nuevo dashboard ya está funcionando! 🚀

---

**¿Más información técnica?**
- Lee `README.md` para detalles técnicos
- Lee `QUICK_START.md` para guía de uso
- Lee `IMPLEMENTATION_SUMMARY.md` para el reporte completo
