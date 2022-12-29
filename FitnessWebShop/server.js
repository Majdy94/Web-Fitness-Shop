"use strict";

// Module einbinden
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");

const {
  getBody,
  getBodyParams,
  getBodyJSON,
  getCookies,
  executeSnippets,
} = require("./helpers.js");
// Credit Card Keys
let publishKey =
  "pk_test_51KKp5YLP2yuyomIr7tUyZMqTkXSyV3ZJ7yvqQdHlsMGhBwEW5Av1e9MbldncBZZtj7u6VlOmQGXHufYyNxIkCwfy00HWvahZrT";
let secretKey =
  "sk_test_51KKp5YLP2yuyomIrRPmP72YYq6fYxn3VNgZGcUl1TKInR1Ec2XjvCvyDZCrWoTBGRtozWeVmBFjeuaOrSEUy4Cq800RZdsEmA9";

const stripe = require("stripe")(secretKey);

// Statische Daten einbinden
const accesslist = require("./accesslist.json");
const config = require("./config.json");
const mimetypes = require("./mimetypes.json");
const users = require("./users.json");
const nodemailer = require("nodemailer");
const { text } = require("stream/consumers");
// const paypal = require("paypal-rest-sdk");
let price = 0;

// paypal.configure({
//   mode: "sandbox", //sandbox or live
//   client_id:
//     "AfLXnc_65-T47WZ60OH2Ujnb44amZRsxxa6Ftk3nAqU5le_sshJK6vLAf1TNdn2-m2Zsnd_D0vxDSCt3",
//   client_secret:
//     "EGdx4xQpaxSlBoreS51gIz68jC1M_QvH3EmCIY0o2IqgD3YuHHe9vw7m4heylMacwQgxPpOhskq5jpvF",
// });

// Templates
const templates = {};
for (const file of fs.readdirSync("./templates")) {
  if (!file.endsWith(".html")) continue;
  templates[file.split(".")[0]] = fs.readFileSync(
    `./templates/${file}`,
    "utf8"
  );
}

// Runtime
const loginSecurity = {
  attempts: {},
  timeouts: {},
};
const sessions = Object.create(null);
const sessionTimeouts = {};

// Webserver erstellen
const server = http.createServer(function (request, response) {
  // URL der Anfrage vorbereiten und direkt im Request wieder speichern
  request.url = new URL(request.url, "http://localhost");

  /*******************************************/
  /* SESSION WIEDERHERSTELLEN UND VERLÄNGERN */
  /*******************************************/

  // Session des Benutzers abfragen (falls sie existiert)
  const { sessionID } = getCookies(request);
  const session = sessions[sessionID];

  // Wenn eine Session existiert, dann verlängern wir diese um einen weiteren Gültigkeitszeitraum
  if (session) {
    // Aktuell laufenden Timeout zum automatischen Löschen der Session stoppen
    clearTimeout(sessionTimeouts[session.username]);

    // Einen neuen Timeout zum automatischen Löschen der Session starten
    sessionTimeouts[session.username] = setTimeout(function () {
      delete sessions[sessionID];
    }, 60 * 1000 * config.session.duration);

    // Session Cookie mit der verlängerten Ablaufdauer setzen
    response.setHeader(
      "Set-Cookie",
      `sessionID=${sessionID}; Max-Age=${
        60 * config.session.duration
      }; HttpOnly`
    );
  }

  /*************************************************/
  /* ENDPUNKTE FÜR LOGIN, LOGOUT UND REGISTRIERUNG */
  /*************************************************/

  //
  // Login Endpunkt
  // POST /?login
  if (
    request.url.pathname === "/" &&
    request.url.searchParams.get("login") === "" &&
    request.method === "POST"
  ) {
    // Eingehenden Body als Query String sammeln und verarbeiten
    getBodyParams(request, function (error, params) {
      // Fehler beim Sammeln des Body mit dem Status Code 500 (Internal Server Error) beantworten
      if (error) {
        response.endWithStatus(500);
        return;
      }

      // Prüfen, dass die gesendeten Daten einen Benutzernamen sowie ein Passwort enthalten sowie
      // innerhalb der Zeichenlimits für Zugangsdaten sind. Bei Problemen antworten wir mit einem
      // Status Code 400 (Bad Request)
      if (
        !params.username ||
        params.username.length < config.users.limits.username.min ||
        params.username.length > config.users.limits.username.max ||
        !params.password ||
        params.password.length < config.users.limits.password.min ||
        params.password.length > config.users.limits.password.max
      ) {
        response.endWithStatus(400);
        return;
      }

      // Benutzername und Passwort aus dem geparsten Body der Anfrage extrahieren
      let { username, password } = params;

      // abort right away if there is still a login timeout running for the user
      if (loginSecurity.attempts[username] === false) {
        response.endWithStatus(425);
        return;
      }

      // Das Passwort hashen, sodass wir es mit dem gespeicherten Passwort vergleichen können. Der
      // Hash setzt sich zusammen aus dem Benutzernamen, seinem Passwort sowie dem globalen Hash,
      // sodass daraus keine Rückschlüsse durch Angriffe Rainbow Tables gewonnen werden können.
      password = crypto
        .createHash(config.crypto.hash)
        .update(`${username}:${password}:${config.crypto.salt}`)
        .digest("hex");

      // Prüfen, ob der Benutzer nicht existiert oder das Passwort falsch ist und mit dem Status
      // Code 403 (Forbidden) antworten
      if (!users[username] || users[username].password !== password) {
        // Counter für ungültige Anmeldeversuche sicherstellen und dessen Wert erhöhen
        loginSecurity.attempts[username] ??= 0;
        loginSecurity.attempts[username]++;

        // Prüfen, ob der Benutzer mehr ungültige Anmeldeversuche als erlaubt unternommen hat und
        // falls ja, dann deaktivieren wir den Login komplett
        if (
          loginSecurity.attempts[username] >= config.users.limits.login.attempts
        ) {
          loginSecurity.attempts[username] = false;
        }

        // Bestehende Timeouts zum Aufräumen stoppen und einen neuen Timeout zum Zurücksetzen des
        // Login-Zählers bzw. der Anmeldesperre setzen
        clearTimeout(loginSecurity.timeouts[username]);
        loginSecurity.timeouts[username] = setTimeout(function () {
          // Zähler und Timeout für den Benutzer zurücksetzen, wodurch der Login wieder erlaubt wird
          delete loginSecurity.attempts[username];
          delete loginSecurity.timeouts[username];
        }, config.users.limits.login.block * 1000 * 60);

        // Gescheiterten Anmeldeversuch mit dem Status Code 403 (Forbidden) beantworten
        response.endWithStatus(403);
        return;
      }

      // An dieser Stelle angelangt wissen wir nun, dass ein registrierter Benutzer sich mit seinem
      // korrekten Passwort am Server angemeldet hat

      // Gibt es bereits eine Session, allerdings für einen anderen Benutzer, dann melden wir diesen
      // zunächst ab
      if (session && session.username !== username) {
        // Timeout zum automatischen Ablaufen der Session löschen
        clearTimeout(sessionTimeouts[username]);
        delete sessionTimeouts[username];

        // Session Inhalt löschen
        delete sessions[sessionID];
      }

      // Sollte der Benutzer noch keine Session haben, weil er noch nicht angemeldet ist, dann
      // erstellen wir nun eine neue Session inklusive Cookie
      if (!sessions[sessionID]) {
        // Session ID zufällig generieren
        const sessionID = crypto
          .randomBytes(config.session.signs / 2)
          .toString("hex");

        // Benutzerprofil aus der Users Datenbank in die Session mit der generierten ID speichern
        sessions[sessionID] = users[username];

        // Timeout zum automatischen Ablaufen der Session erstellen
        sessionTimeouts[username] = setTimeout(function () {
          delete sessions[sessionID];
        }, 60 * 1000 * config.session.duration);

        // Session ID mittels Cookie, welches ein Ablaufdatum hat sowie nicht per JavaScript ausge-
        // lesen werden darf, an den Client senden
        response.setHeader(
          "Set-Cookie",
          `sessionID=${sessionID}; Max-Age=${
            60 * config.session.duration
          }; HttpOnly`
        );
      }

      // Anfrage des Benutzers an die Startseite nach dem Login weiterleiten
      response.statusCode = 302;
      response.setHeader("Location", config.session.homepage);

      // Anfrage abschließen
      response.end();
    });

    // Dieser Endpunkt ist eine in sich geschlossene Einheit und die Anfrage wurde beantwortet
    return;
  }

  //
  // Logout Endpunkt
  // GET /?logout
  if (
    request.url.pathname === "/" &&
    request.url.searchParams.get("logout") === "" &&
    request.method === "GET"
  ) {
    // Nur wenn der Benutzer eine Session hat diese Löschen, was zB nicht der Fall ist, wenn ein
    // nicht angemeldeter Benutzer den Logout Endpunkt ansteuert
    if (session) {
      // Timeout zum automatischen Ablaufen der Session löschen
      clearTimeout(sessionTimeouts[session.username]);
      delete sessionTimeouts[session.username];

      // Session Inhalt löschen
      delete sessions[sessionID];
    }

    // Dem Client mitteilen, dass dieser sein Session Cookie löschen soll, indem wir die Lebensdauer
    // des Cookie auf 0 setzen
    response.setHeader("Set-Cookie", "sessionID=; Max-Age=0; HttpOnly");

    // Anfrage des Benutzers nach dem Logout zur Anmeldeseite weiterleiten
    response.statusCode = 302;
    response.setHeader("Location", "/");
    response.end();

    // Dieser Endpunkt ist eine in sich geschlossene Einheit und die Anfrage wurde beantwortet
    return;
  }

  // Register Endpunkt
  // POST /?register
  if (
    request.url.pathname === "/" &&
    request.url.searchParams.get("register") === "" &&
    request.method === "POST"
  ) {
    // Eingehenden Body als Query String sammeln und verarbeiten
    getBodyParams(request, function (error, params) {
      // Fehler beim Sammeln des Body mit dem Status Code 500 (Internal Server Error) beantworten
      if (error) {
        response.endWithStatus(500);
        return;
      }

      // Prüfen, dass die gesendeten Daten einen Benutzernamen sowie ein Passwort enthalten sowie
      // innerhalb der Zeichenlimits für Zugangsdaten sind. Bei Problemen antworten wir mit einem
      // Status Code 400 (Bad Request) antworten
      if (
        !params.username ||
        params.username.length < config.users.limits.username.min ||
        params.username.length > config.users.limits.username.max ||
        !params.password ||
        params.password.length < config.users.limits.password.min ||
        params.password.length > config.users.limits.password.max
      ) {
        response.endWithStatus(400);
        return;
      }

      // Benutzername und Passwort aus dem geparsten Body der Anfrage extrahieren
      let { username, password } = params;

      // Wenn der Benutzer bereits existiert mit dem Status Code 409 (Conflict) antworten
      if (users[username]) {
        response.endWithStatus(409);
        return;
      }

      // Neue zufällige ID für den Benutzer generieren
      const id = crypto.randomUUID();

      // Das Passwort hashen, da wir niemals Passwörter im Klartext auf der Server speichern! Der
      // Hash setzt sich zusammen aus dem Benutzernamen, seinem Passwort sowie dem globalen Hash,
      // sodass daraus keine Rückschlüsse durch Angriffe Rainbow Tables gewonnen werden können.
      password = crypto
        .createHash(config.crypto.hash)
        .update(`${username}:${password}:${config.crypto.salt}`)
        .digest("hex");

      // Neuen Eintrag für den zu registrierenden Benutzer in der Users Datenbank erstellen
      users[username] = {
        id,
        groups: [],
        username,
        password,
      };

      // Die Users Datenbank speichern und dem Benutzer entsprechend antworten
      fs.writeFile(
        "users.json",
        JSON.stringify(users, null, 2),
        function (error) {
          // Wenn ein Fehler beim Speichern der Datenbank auftritt dem Benutzer mit dem Status Code
          // 500 (Internal Server Error) antworten
          if (error) {
            response.endWithStatus(500);
            return;
          }

          // Die erfolgreiche Registrierung mit dem Status Code 201 (Created) und einem simplen Text
          // beantworten
          response.statusCode = 302;
          response.setHeader("Location", "/login.html");
          response.end();
          return;
        }
      );
    });

    // Dieser Endpunkt ist eine in sich geschlossene Einheit und die Anfrage wurde beantwortet
    return;
  }

  /*********************/
  /* WEITERE ENDPUNKTE */
  /*********************/

  // Eigene Endpunkte hier einbinden

  // Nodemailer registration
  if (
    request.url.pathname === "/" &&
    request.url.searchParams.get("contact") === "" &&
    request.method === "POST"
  ) {
    getBodyParams(request, function (error, params) {
      let { firstname, lastname, email, subject, country, choose } = params;
      let transporter = nodemailer.createTransport({
        service: "hotmail",
        auth: {
          user: "majdy.laba@hotmail.com",
          pass: "Majdy93man",
        },
      });

      let mailOptions = {
        from: "majdy.laba@hotmail.com",
        to: "majdy.laba@hotmail.com",
        subject: "Massage From Calisthenics FAQs",
        text: `From ${firstname} ${lastname} ${email}\n${subject}`,
      };

      transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
          console.log(error);
        } else {
          console.log("Email sent: " + info.response);
        }
      });
    });
    response.statusCode = 302;
    response.setHeader("Location", config.session.homepage);
    response.end();
    return;
  }
  /**************************************/

  // Credit Card Payment
  if (
    request.url.pathname === "/credit" &&
    //request.url.searchParams.get('credit') === '' &&
    request.method === "POST"
  ) {
    getBodyParams(request, async function (error, params) {
      if (error) {
        response.endWithStatus(500);
        return;
      }
    

      const creditCart = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "EUR",
              product_data: {
                name: "order",
              },
              unit_amount: parseInt(params.price) * 100,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: "http://localhost/paymentSuccessed.html",
        cancel_url: "http://localhost/index.html",
      });
      // reading the json file
      let gettingItems = require("./items.json");
      const sessionOfuserName = session.username;
      // creating an empty object
      const itemsObject = {};
      if (gettingItems[sessionOfuserName]) {
        console.log('groups are successed with the products!');
          itemsObject[sessionOfuserName] = {
          groups: gettingItems[sessionOfuserName].groups,
          username: sessionOfuserName,
        }
      } else {
        itemsObject[sessionOfuserName] = {
          groups:[],
          username: sessionOfuserName,
        };
        console.log('groupe is empty!');
      }
      // pushing the paid items with their infos
      
      for (var key in params) {
        if (key.includes("item")) {
          if (itemsObject[sessionOfuserName].groups.includes(params[key],0)) {
            // response.statusCode = 200;
            // response.setHeader("Location", "/index.html");
            // console.log(session.groups);
            // return;
            } else {
          itemsObject[sessionOfuserName].groups.push(params[key]);
        }
      }
    }
      // getting all the values and add the new values
      gettingItems = { ...gettingItems, ...itemsObject };
      console.log(gettingItems);
      fs.writeFile("./items.json", JSON.stringify(gettingItems), (error) => {
        if (error) {
          console.error(`Error saving payment success: ${error}`);
        }
      });

      response.statusCode = 302;
      response.setHeader("Location", creditCart.url);
      response.end();
      console.log("done");
    });

    return;
  }
  /************************************/

  // getting the products after the payment

  if (request.url.pathname === "/myItemsAPI" && request.method === "GET") {
    if (session) {
      getBodyParams(request, function (error, params) {
        if (!session) {
          response.statusCode = 403;
          response.end();
          return;
        }
        const gettingItems = require("./items.json");
        console.log(gettingItems);

        // Prüfen, ob der Benutzer gekauft hat
        // Wenn nein: Status Code 402 Payment Required

        // Falls ja: Inhalte...

        response.statusCode = 200;
        // responing the client the items that he already paid
        response.end(JSON.stringify(gettingItems[session.username]));
      });
    } else {
      response.statusCode = 200;
      response.setHeader("Location", "/login.html");
    }
    return;
  }

  /*******************************************************/
  /* HTTP METHODE PRÜFEN UND INDEX.HTML DATEIEN ERGÄNZEN */
  /*******************************************************/

  // Da die Endpunkte nun bearbeitet wurden sind wir im Bereich des reinen Fileservers, welcher nur
  // GET und HEAD Anfragen beantwortet. Alle anderen Anfragen werden explizit nicht unterstützt.
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.endWithStatus(405);
    return;
  }

  // Anfragen welche direkt mit / enden als Anfrage auf die entsprechende index.html Datei behandeln
  if (request.url.pathname.endsWith("/")) {
    request.url.pathname += "index.html";
  }

  /*************************************/
  /* ACCESSLIST: BLOCK, LOGIN, GRUPPEN */
  /*************************************/

  // Zugriff auf alle Dateien der Blocklist mit dem Status Code 403 (Forbidden) verbieten
  if (accesslist.block?.includes(request.url.pathname)) {
    response.endWithStatus(403);
    return;
  }

  // Zugriff auf Dateien für Benutzer ohne Anmeldung überprüfen beziehungsweise mit dem Status Code
  // 403 (Forbidden) verbieten
  if (!session) {
    // Wenn eine Allowlist existiert, dann darf ein nicht angemeldeter Benutzer nur auf die Dateien
    // der Allowlist zugreifen und sonst nichts
    if (accesslist.allow instanceof Array) {
      // Zugriffe auf alle Dateien, welche nicht explizit in der Allowlist stehen, verbieten
      if (!accesslist.allow.includes(request.url.pathname)) {
        response.endWithStatus(403);
        return;
      }
    }

    // Existiert keine Allowlist, dann darf ein nicht angemeldeter Benutzer nur auf die Dateien der
    // `login` Liste nicht zugreifen
    else if (accesslist.login?.includes(request.url.pathname)) {
      response.endWithStatus(403);
      return;
    }
  }

  // Zugriff auf alle Dateien, welche eine bestimmte Gruppe voraussetzen, mit dem Status Code 403
  // (Forbidden) verbieten
  for (const [group, files] of Object.entries(accesslist.groups ?? {})) {
    if (
      files.includes(request.url.pathname) &&
      (!session || !session.groups?.includes(group))
    ) {
      response.endWithStatus(403);
      return;
    }
  }

  /***********************************************/
  /* DATEIEN VOM DATEISYSTEM AUSLESEN UND SENDEN */
  /***********************************************/

  // Alle Filter sind zu diesem Zeitpunkt durchgelaufen, daher versuchen wir nun konkret die ange-
  // forderte Datei zu laden und damit zu antworten
  fs.readFile(`.${request.url.pathname}`, function (error, file) {
    // Fehler beim Zugriff auf die angeforderte Datei mit dem entsprechenden Status Code beantworten
    if (error) {
      // Datei existiert nicht oder würde sich in einem Ordner befinden, welcher nicht existiert,
      // wird mit dem Status Code 404 (Not Found) beantwortet
      if (error.code === "ENOENT" || error.code === "ENOTDIR") {
        response.endWithStatus(404);
        return;
      }

      // Die angeforderte Ressource ist ein Ordner, wofür wir explitit kein Dateianzeige anzeigen
      // wollen, sondern die Anfrage mit dem Status Code 403 (Forbidden) beantworten
      else if (error.code === "EISDIR") {
        response.endWithStatus(403);
        return;
      }

      // Alle anderen aufgetretenen Fehler beantworten wir mit dem Status Code 500 (Internal Server
      // Error), sodass der Benutzer weiß, dass etwas schief gelaufen ist, worauf er keinen Einfluss
      // hat
      response.endWithStatus(500);
      return;
    }

    // Versuchen den Mimetype der angeforderten Datei auf Basis der Dateiendung zu ermitteln und als
    // Header setzen
    const extension = request.url.pathname.split(".").at(-1);
    const mimetype = mimetypes[extension];
    if (mimetype) {
      response.setHeader("Content-Type", mimetype);
    }

    // Die Ausführung von Snippets in der angeforderten Datei auf Basis ausgewählter Dateiendungen
    // erlauben
    if (config.snippets.includes(extension)) {
      // Zunächst die Datei in einen String umwandeln, da sie bisher noch als Buffer vorliegt und
      // dann die darin enthaltenen Snippets ausführen. Zur Ausführung werden einige Objekte des
      // Servers durchgereicht, sodass die Snippets darauf zugreifen können.
      file = executeSnippets(file.toString(), {
        request,
        response,
        session,
        ...templates,
      });
    }

    // Anfrage mit der existierenden Datei beantworten
    response.end(file);
  });
});

// Server auf dem angegebenen Port der Konfigurationsdatei starten
server.listen(config.server.port, function () {
  console.log(`Server wurde auf Port ${config.server.port} gestartet`);
});
