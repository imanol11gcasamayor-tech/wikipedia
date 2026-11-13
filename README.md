# Acronym — prototipo Wikipedia

## Archivos
- `index.html`: estructura de la aplicación.
- `style.css`: interfaz adaptada a móvil, inspirada en Wikipedia.
- `app.js`: búsqueda, carga de artículos y filtro de enlaces.

## Probar en local
Abre `index.html` en un navegador moderno. Si el navegador restringe peticiones desde `file://`, usa un servidor local sencillo o publica los archivos con GitHub Pages.

## Publicar con GitHub Pages
1. Crea un repositorio nuevo llamado `acronym`.
2. Sube los tres archivos a la raíz del repositorio.
3. En Settings → Pages, selecciona Deploy from a branch.
4. Selecciona `main` y `/ (root)`, guarda y espera a que GitHub publique la web.
5. Abre la URL de GitHub Pages en Safari.

## Funcionamiento actual
La aplicación consulta la API de MediaWiki en español. En cada artículo conserva en azul los enlaces internos cuyo título tiene, en la posición configurada, la letra que corresponde a la siguiente letra de la palabra secreta. Al pulsar uno, carga el artículo y avanza una posición.

La palabra secreta se mantiene en memoria JavaScript y no se guarda en localStorage ni se añade a la URL. Esto evita mostrarla en la interfaz, pero NO es seguridad criptográfica: alguien con conocimientos técnicos y acceso al navegador podría inspeccionar el código en ejecución.

## Limitaciones del prototipo
- El filtro se basa en el texto azul visible (no en el título de destino), para que la palabra que el espectador anota cumpla la posición configurada. Además de los enlaces originales de Wikipedia, la aplicación convierte en azul las palabras del texto que cumplen la posición y la letra configuradas. Las palabras añadidas como enlaces buscan un artículo relacionado en Wikipedia al pulsarlas. Los demás enlaces se muestran como texto normal.
- Si un artículo no contiene coincidencias, se añade una breve continuación de apoyo, diferenciada visualmente del contenido original de Wikipedia. Si no existe una palabra de apoyo para esa posición, habrá que buscar otro artículo.
- La API puede cambiar o limitar peticiones; no se garantiza disponibilidad permanente.
- No se ha probado exhaustivamente en todos los artículos ni en todas las versiones de Safari.
- El contenido se obtiene de Wikipedia. Mantén atribución visible y respeta las licencias aplicables, especialmente CC BY-SA 4.0 para texto reutilizado. Los archivos multimedia pueden tener licencias distintas.

## Documentación
- MediaWiki Action API: https://www.mediawiki.org/wiki/API:Action_API
- API:Parse: https://www.mediawiki.org/wiki/API:Parse
- CORS: https://www.mediawiki.org/wiki/API:Cross-site_requests
