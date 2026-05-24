# Sanad

Sanad is a static Arabic legal research web app for judgments, laws, decrees, regulations, legal forms, fees, settings, and a local legal analyzer.

## App Structure

```text
sanad.html              Main HTML shell and page sections
assets/styles.css       Responsive visual design
assets/app.js           Navigation, routing, search, readers, local storage services
assets/vendor/tabler/   Local Tabler icon font used by the app UI
data/judgments.js       Published judgment records
data/laws.js            Published law records
data/legal-forms.js     Legal form/template records
content/laws/           Original Markdown law sources
icons/                  PWA and phone install icons
manifest.json           Installable web-app metadata
sw.js                   Offline/cache service worker
sanad-local-server.js   Local static server
```

## Pages And Services

- `#dashboard`: overview dashboard and quick service links.
- `#judgments` / `#documents`: judgment catalog with search, filters, sorting, reader, and saved judgments.
- `#laws`: law catalog and formatted law reader.
- `#decrees`: independent decrees page, ready for future decree records.
- `#regulations`: independent regulations page, ready for future regulation records.
- `#contracts`: independent legal forms page, powered by `data/legal-forms.js`.
- `#aiAnalysis`: local legal analyzer that matches the case description against app laws and judgments.
- `#fees`: local fee manager and estimate calculator.
- `#settings`: local settings and data controls.
- `#add-judgment`: local judgment import service.

The top bar includes an `Ink` button that switches the app into a high-contrast reading mode.

## Data Model

Judgments are loaded into `window.SANAD_DATA.judgments`:

```js
{
  id: 27,
  type: "tijari",
  title: "الطعن رقم 27 لسنة 2025 طعن تجاري",
  court: "محكمة التمييز",
  date: "2025-03-13",
  num: "2025/27",
  body: "النص الكامل للحكم..."
}
```

Laws are loaded into `window.SANAD_DATA.laws`; keep original Markdown in `content/laws/` and mirror searchable display data in `data/laws.js`.

Local user data is stored in browser `localStorage`:

- `sanadSavedJudgments`
- `sanadFeeItems`
- `sanadSettings`
- `sanadLocalJudgments`

## Scaling Plan

For 100,000+ judgments, keep `sanad.html` small and split data by collection:

```text
data/judgments/2025-commercial.js
data/judgments/2025-civil.js
data/judgments/2024-commercial.js
```

The UI logic should remain in `assets/app.js`; large datasets should be loaded by year/type/search scope instead of embedding everything in `sanad.html`.

## Local Preview

Run:

```powershell
node sanad-local-server.js
```

Then open:

```text
http://localhost:8787/sanad.html
```
