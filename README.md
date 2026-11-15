# FireWatch Bolivia X · Tunari

Visor para el desafío de monitoreo y análisis de focos térmicos en Cochabamba. Integra los datos de NASA FIRMS del Módulo 03, los límites distritales y el simulador de propagación en la interfaz de FireWatch Bolivia X.

## Presentación

1. Extrae el ZIP. En Windows abre **ABRIR_DEMO.bat**. En otras plataformas, abre **ABRIR_DEMO.html** en el navegador.
2. Muestra **Mapa → Área del Tunari**. La consulta archivada de NASA FIRMS del 15 de noviembre de 2026 registró **0 detecciones** en esa área. Pulsa **Ver histórico regional** para visualizar la consulta amplia con **3.122 detecciones válidas archivadas**. Desde ese panel puedes abrir cada día en el mapa y filtrar por sensor. La ventana regional es un rectángulo de consulta que abarca Bolivia y alrededores.
3. Pulsa **Simular foco de calor**. El visor enfoca el Distrito 13, calcula el puntaje de riesgo y reproduce la geometría de propagación hasta **+24 h**. Puedes pausar, arrastrar el control temporal y cambiar las condiciones en **Simulación**.
4. Abre **Histórico** para exportar el CSV de observaciones o el GeoJSON del escenario. El foco simulado solo aparece en el archivo de simulación.

El relieve 3D es sintético. Los límites de los 15 distritos proceden del archivo municipal. El recuadro del Tunari muestra la extensión consultada a FIRMS. El polígono oficial del Parque Nacional Tunari se puede cargar en **Datos y fuentes**. La versión local incluye los datos archivados y el relieve. La capa de imagen NASA GIBS del modo 2D usa internet.

## Histórico regional que incluye el repositorio

| Fecha UTC | MODIS | VIIRS | Total |
| --- | ---: | ---: | ---: |
| 14 de noviembre de 2026 | 184 | 2.175 | 2.359 |
| 15 de noviembre de 2026 | 83 | 680 | 763 |
| **Total archivado** | **267** | **2.855** | **3.122** |

El 15 de noviembre se contabiliza hasta el corte de la consulta regional, aproximadamente las **10:41 en Bolivia**. La consulta archivada del área del Tunari registró **0 detecciones** en esa ventana de dos días. Los archivos disponibles cubren esas fechas.

El CSV normalizado original está en [datos/firms_regional_2026-11-14_15.csv](datos/firms_regional_2026-11-14_15.csv). Las fechas de corte, el rectángulo de consulta, las fuentes y el SHA-256 del CSV están en [datos/procedencia_firms.json](datos/procedencia_firms.json).

## Procedencia y método

- **Módulo 03.** Se incorporan las detecciones normalizadas MODIS y VIIRS de la ejecución regional y la ficha de la última consulta del Tunari. La conexión en vivo consulta los cuatro productos NRT usados en el módulo y conserva la copia disponible si falla una fuente.
- **Simulador.** El HTML recibido calcula el riesgo con una función logística de coeficientes fijos y genera una huella elíptica en función del tiempo, el viento, la humedad y la cobertura. El código de cálculo se conserva en `docs/prediccion.js`. La distancia fija original de 60 km se conserva en el puntaje y la proyección parte de las 6 h iniciales del modelo. Los insumos meteorológicos del escenario son hipotéticos.
- **Modelo entrenado.** El HTML usa el nombre XGBoost, pero el cálculo visible se ejecuta localmente con la función logística. Los adjuntos no contienen pesos, un archivo de modelo ni un servicio de inferencia reproducible. El visor identifica el resultado como un puntaje estimado, no como una probabilidad calibrada.
- **Interfaz.** Conserva la cabecera y la línea visual del proyecto gráfico. Las pantallas conectadas son Mapa, Simulación, Estadísticas y Datos y fuentes.
- **Interpretación.** Cada detección indica una anomalía térmica observada por satélite. La confirmación de un incendio requiere verificación independiente.

## Actualización en vivo

1. En Windows, abre **ABRIR_FIREWATCH.bat**. En cualquier plataforma, ejecuta `python servidor.py --abrir` desde la carpeta del proyecto. Necesitas Python 3.10 o posterior.
2. Abre **Datos y fuentes**, introduce tu `MAP_KEY` y pulsa **Actualizar área del Tunari**. Puedes configurar la variable local `FIRMS_MAP_KEY` o guardar tu clave en un archivo privado `.firms_key` junto al servidor.
3. El servidor usa `http://127.0.0.1:8765/`. La consulta usa el rectángulo `-66.74,-17.56,-65.9,-16.9` de la última ejecución del módulo.

## Subir a GitHub y publicar la demo

1. Crea un repositorio público vacío llamado `firewatch-tunari`.
2. Extrae el ZIP. En la página del repositorio, abre **uploading an existing file** o **Add file → Upload files**. Arrastra desde el Explorador de Windows el contenido descomprimido, incluida la carpeta `docs`.
3. Pulsa **Commit changes**. Al abrir el repositorio, `README.md` y `docs` deben aparecer en la raíz.
4. En **Settings → Pages**, elige **Deploy from a branch**, selecciona `main` y `/docs`, y pulsa **Save**.
5. Cuando termine el despliegue, abre **Visit site**. Copia el enlace para el campo **Enlace principal del proyecto** y usa el enlace del repositorio en **Repositorio**.

GitHub Pages sirve la interfaz, el archivo de observaciones y la simulación. Para actualizar NASA en vivo, ejecuta el servidor Python en tu equipo. Guarda tus claves en la configuración local.

## Fuentes

- [NASA FIRMS · API de área](https://firms.modaps.eosdis.nasa.gov/api/area)
- [NASA Worldview](https://worldview.earthdata.nasa.gov/)
- [Portal geográfico municipal de Cochabamba](https://recursosgamc.cochabamba.bo/api-doc)
