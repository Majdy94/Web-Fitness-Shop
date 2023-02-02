'use strict';


// Module laden
const http = require('http');


// Module bereitstellen
module.exports = {
  getBody,
  getBodyParams,
  getBodyJSON,
  getCookies,
  executeSnippets,
};


//
// ServerResponse.prototype.endWithStatus()
// Antworte dem Client mit einer Custom Error Page und der zum Status Code passenden Status Message.
// <- code: Number
http.ServerResponse.prototype.endWithStatus = function(code) {
  this.statusCode = code;
  this.end(
    `<!DOCTYPE html>` +
    `<html lang="de">` +
    `  <head>` +
    `    <title>Fehler #${code}</title>` +
    `  </head>` +
    `  <body>` +
    `    <h1>Fehler #${code}</h1>` +
    `    <p>Ursache des Fehlers: ${http.STATUS_CODES[code]}</p>` +
    `  </body>` +
    `</html>`
  );
};


//
// getBody()
// Hilfsfunktion zum schnellen Sammeln des kompletten Request Body.
// <- request: IncomingMessage
// <- callback: Function
function getBody(request, callback) {
  // Eingehende Datenstücke als Buffer sammeln
  let body = Buffer.alloc(0);
  request.on('data', function(chunk) {
    body = Buffer.concat([body, chunk]);
  });

  // Abgeschlossenen Datenempfang behandeln und Callback Funktion aufrufen
  request.on('end', function() {
    callback(null, body);
  });
}


//
// getBodyParams()
// Hilfsfunktion um schnell mittels Callback Funktion ein echtes Objekt auf Basis des eingegangenen
// Query String formatierten Body zu erhalten.
// <- request: IncomingMessage
// <- callback: Function
function getBodyParams(request, callback) {
  // Zunächst die getBody() Funktion verwenden, um den Body als Text zu erhalten
  getBody(request, function(error, body) {
    // Wenn ein Fehler auftreten ist diesen transparent über die Callback Funktion weitergeben
    if (error) {
      callback(error);
      return;
    }

    // Da kein Fehler aufgetreten ist den Body als URLSearchParams parsen und als echtes Objekt im
    // Aufruf der Callback Funktion übergeben
    callback(null, Object.fromEntries(new URLSearchParams(body.toString())));
  });
}


//
// getBodyJSON()
// Hilfsfunktion um schnell mittels Callback Funktion den geparsten JSON Inhalt einer Anfrage zu
// erhalten.
// <- request: IncomingMessage
// <- callback: Function
function getBodyJSON(request, callback) {
  // Zunächst die getBody() Funktion verwenden, um den Body als Text zu erhalten
  getBody(request, function(error, body) {
    // Wenn ein Fehler auftreten ist diesen transparent über die Callback Funktion weitergeben
    if (error) {
      callback(error);
      return;
    }

    // Den Body, welcher derzeit noch ein Buffer ist, in eine Zeichenkette umwandeln
    body = body.toString();

    // Da kein Fehler aufgetreten ist den Inhalt der Anfrage versuchen als JSON Objekt zu parsen und
    // als Antwort an die Callback Funktion übergeben
    try {
      callback(null, JSON.parse(body));
    } catch(error) {
      error.cause = body;
      callback(error);
    }
  });
}


//
// getCookies()
// Automatische Extraktion aller Cookies aus den Header.
// <- request: IncomingMessage
// -> Object
function getCookies(request) {
  // Prüfen, ob überhaupt Cookies an den Server gesandt wurden
  if (request.headers.cookie) {
    // Cookies wie Query Strings behandeln und als URLSearchParams in ein Objekt konvertieren und
    // zurückgeben
    const cookiesRaw = request.headers.cookie.replaceAll('; ', '&');
    return Object.fromEntries(new URLSearchParams(cookiesRaw));
  }

  // Ohne Cookies geben wir ein leeres Objekt zurück
  return {};
}


//
// snippetMatcher: RegExp
// Regulärer Ausdruck zum Finden von JavaScript Snippets in einem String.
const snippetMatcher = /\{\{(?<code>.*?)\}\}/gs;


//
// executeSnippets()
// JavaScript Snippets im übergebenen String ausführen und das Resultat zurückgeben.
// <- file: String
// <- passthrough?: Object
// -> String
function executeSnippets(file, passthrough = {}) {
  // Snippet übergreifender geteilter Kontext
  const self = {};

  // Datei nach Snippets durchsuchen, um diese auszuführen
  file = file.replaceAll(snippetMatcher, function() {
    // Gefundenen Code Block aus den Parametern extrahieren (der letzte Parameter der Callback
    // Funktion enthält die named groups des regulären Ausdrucks)
    const { code } = Array.prototype.at.call(arguments, -1);

    // Versuchen das gefundene Snippet auszuführen. Dabei stellen wir den Request, den Response,
    // die Session sowie den Snippet übergreifenden geteilten Kontext zur Verfügung.
    // Sollte das Snippet mit undefined oder null beenden, dann verwenden wir einen leeren Text
    try {
      return (new Function(
        'self',
        ...Object.keys(passthrough),
        `${code.includes('\n') ? '' : 'return '}${code}`,
      )(
        self,
        ...Object.values(passthrough),
      )) ?? '';
    }

    // Einen Fehler bei der Ausführung des Snippets sowie dessen Code auf der Konsole ausgeben
    // und einen leeren Text für die Stelle des Snippets zurückgeben
    catch(error) {
      if (passthrough.request) {
        error.cause = `Error in '${passthrough.request.url.pathname}': ${code.trim()}`;
      }
      console.error(error);
      return '';
    }
  });

  // Ergebnis zurückgeben
  return file;
}
