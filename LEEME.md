# Mapa educativo de Medellín

Abre `index.html` en el navegador con doble clic. Solo necesita internet para cargar la librería d3 y las fuentes.

## Estructura
- `index.html`: estructura de la página (filtros, mapa y panel). Sin estilos ni lógica.
- `css/estilos.css`: todo lo visual. Los colores están en las variables de `:root` (tema claro) y en los dos bloques del tema oscuro.
- `js/app.js`: la funcionalidad (filtros, mapa, zoom, KPIs, gráfica y listas).
- `datos/datos.js`: los datos incrustados en `window.EDU_DATA`.

## Formato de los datos (`window.EDU_DATA`)
- `C`: comunas y corregimientos, `[codigo, nombre, anillos]`. Los polígonos van en polyline codificado con precisión 1e4.
- `B`: barrios y veredas, `[codigo, nombre, subtipo, anillos]`.
- `P`: población 2025 por código de barrio (proyección del DAP por barrios).
- `CP`: población 2025 por comuna (DAP–DANE).
- `E`: nombres de las instituciones. El índice de la lista es su id.
- `S`: sedes, `[idInstitucion, nombreSede, clasificacion, comuna, barrio, lat*1e5, lon*1e5, "g0.g1...g11"]`.
  - `nombreSede` vacío (`''`) significa que es la sede principal.
  - Clasificación: 0 oficial-sede, 1 oficial-principal, 2 no oficial, 3 confesión religiosa (oficial), 4 régimen especial (oficial), 5 cobertura contratada (no oficial).

## Fuentes
- GeoMedellín, capa Sedes Educativas (vigencia 2024): https://www.medellin.gov.co/servidormapas/rest/services/educacion/VC_Sedes_Instituciones/MapServer/0
- GeoMedellín, límites de comunas y barrios: https://www.medellin.gov.co/servidormapas/rest/services/mapas_nacionales/VC_Limite_Politico_Admtivo/MapServer
- DAP: "Información general del Distrito" (abril de 2026) y "Proyecciones de población por barrios 2018–2030".

## Actualizar los datos
Reemplaza `datos/datos.js` con el mismo formato. Los demás archivos no cambian.
