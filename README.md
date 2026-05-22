# Sanad

Static Arabic legal research web app for judgments, laws, and legal forms.

## Structure

```text
sanad.html              App markup only
assets/styles.css       Visual design and responsive layout
assets/app.js           UI behavior, search, filters, saved judgments, reader formatting
data/judgments.js       Judgment records
data/laws.js            Placeholder for law records
data/legal-forms.js     Placeholder for legal form/template records
icons/                  PWA and home-screen icons
manifest.json           Installable web-app metadata
sw.js                   Offline/cache service worker
sanad-local-server.js   Local static server
```

## Data Model

Judgments are loaded from `data/judgments.js` into:

```js
window.SANAD_DATA.judgments = [
  {
    id: 1,
    type: "tijari",
    title: "الطعن رقم ...",
    court: "محكمة التمييز",
    date: "١٢ مارس ٢٠٢٤",
    num: "2024/3847",
    att: 1,
    source: "Commercial 1.docx",
    appeal: "عن استئناف رقم ...",
    body: "نص الحكم الكامل..."
  }
];
```

`source` and `appeal` stay in the data for import tracking and search, but they are not shown as extra boxes in the judgment cards or reader because that information already appears inside the judgment text.

## Scaling Plan

For 100,000+ judgments, keep `sanad.html` small and add data by collection under `data/`. When the dataset grows too large for one file, split judgments by year/type, for example:

```text
data/judgments/2025-commercial.js
data/judgments/2025-civil.js
data/judgments/2024-commercial.js
```

Then load only the collection needed for the current filter/search screen. The UI logic belongs in `assets/app.js`; data imports should not be added back into `sanad.html`.

## Local Preview

Double-click `open-sanad-local.cmd`, or run:

```powershell
node sanad-local-server.js
```

Then open:

```text
http://localhost:8787/sanad.html
```
