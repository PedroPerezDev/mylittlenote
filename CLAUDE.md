# Cuaderno de Hábitos — Contexto del proyecto

## Qué es esto

Habit tracker + diario mensual con estética de **cuaderno físico escrito a bolígrafo**. Una sola página apaisada que se expande horizontalmente según el número de hábitos. Sin frameworks, vanilla JS ES6+.

Referencia visual original: foto de una libreta Moleskine en `/referencias/ejemplo-cuaderno.jpeg`.

## Archivos

```
index.html   — estructura HTML
style.css    — todos los estilos
app.js       — toda la lógica
/referencias — capturas de pantalla y referencias de diseño
```

## Estética — reglas que NO se rompen

- **Fuente**: Caveat (Google Fonts), pesos 400/500/600/700. Es la única fuente del proyecto. Simula escritura a mano.
- **Tinta**: `#1c2461` (azul marino oscuro, como bolígrafo BIC). Variable `--ink`.
- **Papel**: `#F5EFD8` (crema cálido). Variable `--paper`.
- **Línea de margen**: `rgba(188,48,36,0.40)` (rojo tenue). Variable `--margin`.
- **Línea de pauta**: `rgba(165,140,95,0.35)` (marrón cálido). Variable `--rule`.
- **Fondo escritorio**: `#1a1108` (madera oscura) con vetas en CSS.
- **Sin cuadrícula de fondo** en el papel — hojas lisas con textura de fibras sutil.
- **Sin UI moderna**: nada de Material Design, gradientes neón, bordes redondeados grandes ni botones brillantes.

## Layout

```
[escritorio oscuro]
  [#page — hoja única apaisada, flex-direction: row]
    [#diary-section — ancho fijo 260px (--diary-w)]
      [#left-content]
        [#diary-month-title — título del mes en mayúsculas]
        [#diary-rows — 31 .diary-row]
    [#page-divider — línea roja 1.5px]
    [#habits-section — ancho determinado por la tabla]
      [#right-content]
        [#habit-grid — table]
          [#grid-head — nombres de hábitos en vertical]
          [#grid-body — 31 filas × N hábitos]
        [#empty-state]
```

El ancho de `#page` crece automáticamente con el número de hábitos (`flex-shrink: 0`, sin `max-width`). No hay scroll interno — si la página fuera muy ancha, el escritorio haría scroll.

## Cuadros de hábitos — celdas dibujadas a mano

Cada `.cell-inner` tiene:
- `border: 1.5px solid var(--ink)` siempre visible
- `border-radius` asimétrico distinto en cada esquina (simula mano alzada)
- Micro-rotaciones que varían por `nth-child(3n/5n/7n/11n)`

**Estado HECHO**: relleno denso con tramado cruzado 44°/-44° (simula bolígrafo apretado).
**Estado SALTADO**: X con dos pseudo-elementos, ligeramente cortos (`scaleX(0.92)`).
**Ciclo de clic**: vacío → hecho → saltado → vacío.

## Alineación diario ↔ hábitos — `syncDiaryAlignment()`

Las filas del diario (izquierda) deben quedar a la **misma altura** que las filas del grid (derecha). El encabezado del grid varía de altura según la longitud de los nombres de hábitos.

**Fórmula correcta:**
```js
diaryRows.style.paddingTop = '0px'; // reset SIEMPRE antes de medir
const headH       = gridHead.getBoundingClientRect().height;
const titleH      = diaryTitle.getBoundingClientRect().height;
const titleMargin = parseFloat(getComputedStyle(diaryTitle).marginBottom) || 0;
diaryRows.style.paddingTop = Math.max(0, headH - titleH - titleMargin) + 'px';
```

**Importante**: hay que restar `titleMargin` (el `margin-bottom: 8px` del título). Sin esto, las filas caen 8px más abajo de lo correcto. El error se camufla en la primera carga porque Caveat aún no ha cargado y la fuente de sustitución compensa el desfase, pero aparece al cambiar de mes.

Se invoca con `requestAnimationFrame(syncDiaryAlignment)` al final de `render()`, en el ResizeObserver del grid-head, y en `document.fonts.ready.then(syncDiaryAlignment)`.

## Estado / localStorage

```js
let state = {
  habits:      [],          // [{ id, name }]
  completions: {},          // { 'YYYY-MM': { habitId: [días...] } }
  skips:       {},          // { 'YYYY-MM': { habitId: [días...] } }
  diary:       {},          // { 'YYYY-MM': { día: 'texto' } }
  mood:        {}           // { 'YYYY-MM': { día: { h: valor, a: valor } } }
}
```

Clave de localStorage: `habitTracker_v1`.

## Funcionalidades activas

- **Diario**: clic en fila → modal flotante con textarea. Vista previa de la primera línea en cada fila. Guarda al cerrar (botón, Escape, clic fuera).
- **Hábitos**: añadir con `＋` (último th del thead), renombrar con contenteditable, eliminar con `✕`.
- **Navegación de mes**: flechas `←` `→` fijas en los laterales del viewport. Cambio instantáneo sin animación.
- **Hoy**: fecha marcada en rojo (`#b52c1e`) en el diario y en el grid.
- **Humor**: dos columnas al final del grid (`mood-h` y `mood-a`). Cabecera: `:)` y `>:(` en Caveat. Clic abre popover con input 0-10. Verde = alegría, rojo = enfado. Botón "ver gráfico" (centrado bajo el mes) abre modal con líneas SVG.

## Funcionalidades eliminadas (no reintroducir)

| Qué | Por qué se eliminó |
|-----|--------------------|
| Botón "Rachas" y lógica `computeStreak` | El usuario lo pidió explícitamente |
| Columna de día en el grid de hábitos | Redundante: ya está en el diario, alineada |
| Animaciones de flip al cambiar mes | El usuario las eliminó: el cambio es instantáneo |
| Diseño de dos páginas separadas (izquierda/derecha con pliegue) | Sustituido por hoja única apaisada |

## Responsive

- **< 700px**: `#diary-section` colapsa a 36px (solo números de día visibles, sin previsualización ni letra del día).
- **< 480px**: `#diary-section` y `#page-divider` desaparecen.

## Convenciones de código

- Todo en español (nombres de variables en inglés, comentarios en español).
- No hay build system ni dependencias externas. Se abre directamente en el navegador.
- `render()` reconstruye todo el DOM del grid y el diario en cada llamada. Las únicas actualizaciones parciales son `updateCellClass()` (al clicar celda) y `updateDiaryRowPreview()` (al cerrar modal).
