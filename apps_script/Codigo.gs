/*
 * Servicio de guardado de calificaciones (Google Apps Script).
 * Guarda cada calificación en una Hoja de Google y permite a cada experto
 * retomar su trabajo. Las calificaciones de los 3 expertos de un equipo quedan
 * unidas en la misma hoja; el administrador descarga todo desde Google Sheets.
 *
 * CÓMO INSTALARLO (una sola vez):
 *  1. Entra a https://script.google.com y crea un proyecto nuevo.
 *  2. Borra el contenido de Codigo.gs y pega TODO este archivo.
 *  3. Menú «Implementar» → «Nueva implementación» → tipo «Aplicación web».
 *     - «Ejecutar como»: Yo.
 *     - «Quién tiene acceso»: Cualquier persona.
 *  4. Copia la URL que termina en /exec y pégala en config.js (APPS_SCRIPT_URL).
 *  5. La primera vez te pedirá autorizar: acepta.
 * La Hoja de cálculo se crea sola la primera vez; la encuentras en tu Google Drive
 * con el nombre que indique HOJA_NOMBRE.
 */

var HOJA_NOMBRE = 'Calificaciones Xenometer';
var COLUMNAS = ['tweet_id', 'usuario', 'equipo', 'etiqueta', 'comentario', 'fecha_utc'];

function getHoja_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  var ss;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(HOJA_NOMBRE);
    props.setProperty('SHEET_ID', ss.getId());
  }
  var sh = ss.getSheetByName('calificaciones');
  if (!sh) {
    sh = ss.getActiveSheet();
    sh.setName('calificaciones');
    sh.appendRow(COLUMNAS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function salida_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// GET ?action=load&usuario=experto1a  -> devuelve las calificaciones de ese usuario
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'ping') return salida_({ ok: true });
  if (p.action === 'load') {
    var sh = getHoja_();
    var datos = sh.getDataRange().getValues();
    var res = {};
    for (var i = 1; i < datos.length; i++) {
      if (String(datos[i][1]) === String(p.usuario)) {
        res[datos[i][0]] = { etiqueta: datos[i][3], comentario: datos[i][4] };
      }
    }
    return salida_({ ok: true, calificaciones: res });
  }
  return salida_({ ok: false, error: 'accion desconocida' });
}

// POST {action:'save', tweet_id, usuario, equipo, etiqueta, comentario}
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.action !== 'save') return salida_({ ok: false, error: 'accion desconocida' });
    var sh = getHoja_();
    var datos = sh.getDataRange().getValues();
    var fila = -1;
    for (var i = 1; i < datos.length; i++) {
      if (String(datos[i][0]) === String(d.tweet_id) && String(datos[i][1]) === String(d.usuario)) { fila = i + 1; break; }
    }
    var ahora = new Date().toISOString();
    var valores = [String(d.tweet_id), String(d.usuario), String(d.equipo || ''), d.etiqueta, String(d.comentario || ''), ahora];
    if (fila > 0) {
      sh.getRange(fila, 1, 1, COLUMNAS.length).setValues([valores]);
    } else {
      sh.appendRow(valores);
    }
    return salida_({ ok: true });
  } catch (err) {
    return salida_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}
