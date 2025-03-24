# JDAV NRW Abrechnungsformular

Web-Formular zum Erstellen von Abrechnungen für die Teilnahme an Veranstaltungen der JDAV NRW.

## Funktionsweise

Die [`index.html`](./index.html) enthält das interaktive Abrechnungsformular. Der Benutzer füllt es im Browser aus und nutzt anschließend die „Drucken“ Funktion des Browsers um ein PDF zu erstellen.

## Hinweise zur Entwicklung

- Alle generischen Komponenten und Funktionalitäten befinden sich im [`lib/`](./lib) Ordner. Zweck dieser Aufteilung ist die `index.html` als Hauptdatei übersichtlich zu halten.
- Die `<cost-...>` HTML-Elemente sind mittels [„Web Components“](https://developer.mozilla.org/en-US/docs/Web/API/Web_components) implementiert. Web Components sind ein Web Standard zur Definition von eigenen HTML-Elementen.
- Zu den JavaScript-Funktionen gibt es [automatisierte Tests](./lib/cost.test.html). Zur Ausführung der Tests muss diese Datei im Browser geöffnet werden.
