# Anotación Xenometer

Página web para que dos equipos de tres expertos califiquen tuits (escala −3 a +3)
del proyecto APXML. Es un sitio estático: se publica gratis en **GitHub Pages** y no
necesita servidor. Las calificaciones de los tres expertos de cada equipo se unen
en una **Hoja de Google**, de donde el administrador las descarga.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html`, `app.js`, `config.js` | La página. |
| `anotacion.db` | Base SQLite con **todos** los tuits recolectados (3.016), los 2 equipos, los 6 usuarios y la asignación de 300 tuits por equipo. |
| `apps_script/Codigo.gs` | El servicio que guarda las calificaciones en tu Hoja de Google. |
| `credenciales.csv` | **No va en el repositorio.** Usuarios y contraseñas de los 6 expertos. Guárdalo aparte y repártelo en privado. |

## 1) Publicar la página en GitHub Pages

1. Crea un repositorio nuevo en GitHub (público; GitHub Pages gratis es público).
2. Sube **todo el contenido de esta carpeta** (menos `credenciales.csv`) a la raíz del repositorio.
3. En el repositorio: **Settings → Pages**. En «Build and deployment», fuente
   «Deploy from a branch», rama `main` y carpeta `/ (root)`. Guarda.
4. A los pocos minutos tu página estará en `https://TUUSUARIO.github.io/NOMBREREPO/`.

## 2) Activar el guardado central (Google Apps Script)

1. Entra a <https://script.google.com> → «Proyecto nuevo».
2. Borra lo que haya y pega **todo** `apps_script/Codigo.gs`.
3. «Implementar» → «Nueva implementación» → tipo **Aplicación web**:
   - «Ejecutar como»: **Yo**.
   - «Quién tiene acceso»: **Cualquier persona**.
4. Autoriza cuando lo pida. Copia la **URL** que termina en `/exec`.
5. Abre `config.js`, pega esa URL entre las comillas de `APPS_SCRIPT_URL` y vuelve a subir el archivo.

A partir de ahí, cada calificación se guarda sola en una hoja llamada
**«Calificaciones Xenometer»** en tu Google Drive. Para descargar todo:
ábrela y usa **Archivo → Descargar → Microsoft Excel (.xlsx)** o **CSV**.
Las columnas son: `tweet_id, usuario, equipo, etiqueta, comentario, fecha_utc`.

> Mientras `APPS_SCRIPT_URL` esté vacío, la página funciona, pero guarda solo en
> el navegador de cada experto. Pon la URL **antes** de repartir los usuarios.

## 3) Repartir los usuarios

Entrega a cada experto su usuario y contraseña (de `credenciales.csv`) y el enlace
de la página. Equipo 1 califica 300 tuits; equipo 2 califica los otros 300. Los tres
miembros de un equipo califican los mismos 300, así cada tuit queda con 3 etiquetas.

## Notas

- **Seguridad:** el usuario y la contraseña solo separan a los expertos; no son
  seguridad real (la verificación ocurre en el navegador y la base es pública).
  No publiques datos sensibles aquí. Las contraseñas no están en texto plano en la
  base (van con hash + salt), pero son cortas: sirven para ordenar el trabajo, no
  para proteger secretos.
- **Privacidad de los tuits:** la base incluye cuentas de personas comunes. Antes de
  difundir el conjunto fuera del equipo, conviene seudonimizar (quitar usuario,
  nombre e ID). Para el trabajo interno de anotación se dejan visibles a propósito.
- **Reanudar:** cada experto puede cerrar y volver; su avance se recupera desde la
  Hoja de Google (y desde su navegador como respaldo).
- Ningún tuit fue eliminado: la asignación de 600 es un subconjunto; los 3.016 están
  en la tabla `tweets`.
