# News App

Today's top news as full-screen cards you scroll like reels. Each card has a photo (when the story has one),
the headline and a 4-5 line gist, with a link to the full story. Node/Express backend, plain HTML/JS front end.

Live: https://newsapp-185469394031.asia-south1.run.app

## How it works

- `GET /api/news` returns today's news (every deduped item the feeds have). "Today" is the date in IST.
- If `news-YYYY-MM-DD.json` already exists in storage it is served as is. Otherwise the server reads the RSS
  feeds in `news.js` (BBC for World / Technology / Business / Science / Entertainment / Health / Politics,
  The Hindu / Times of India / NDTV for India, The Straits Times for Singapore, TechCrunch / Ars Technica /
  WIRED for Technology plus TechCrunch's own AI and Gadgets feeds, CBS Sports for Basketball and Football,
  NDTV Sports for Cricket; no API key needed), takes items round-robin so the cards mix topics, opens each
  article for its photo and opening paragraphs to build the gist, saves the JSON, and serves it. Concurrent
  first requests share one fetch.
- Nothing is saved if every feed fails, so the next request tries again.
- Gists are the article's own opening text trimmed to about 300 characters on a sentence boundary, not
  AI-written summaries. Photos come from the article's `og:image`; a coloured gradient is used when there is none.

To change the news sources, edit the `FEEDS` list at the top of `news.js`.

## Choosing which tags to see

Tap the category chip on any card (top-left of the photo) to open the tags page, where every topic
(World, India, Singapore, Technology, AI, Gadgets, Business, Science, Entertainment, Health, Politics,
Basketball, Football, Cricket) can be turned on or off. The choice is saved in `localStorage` on that
device only, so cards for a turned-off tag simply don't appear in the reel; there's no server-side
filtering. The tag list on that page (`CATEGORIES` in `public/tags.html`) and the icons (`GLYPH` in
`public/index.html`) must be kept in sync by hand with the categories used in `news.js`.

## Install as an app

The ⋮ menu (top-right) has "Install app": on Android Chrome it opens the install prompt; on iPhone Safari it shows
the Share, then "Add to Home Screen" steps. It is a PWA (`manifest.webmanifest`, `sw.js`, `install.js`), so the
installed app opens full-screen and shows the last loaded news when offline. Regenerate the icons with
`python tools/make_icons.py`.

## Run locally

    npm install
    npm start          # http://localhost:8080, daily JSON stored in ./data
    npm test

## Deploy to GCP (Cloud Run + Cloud Storage)

    gcloud storage buckets create gs://YOUR-BUCKET --location=REGION --uniform-bucket-level-access
    gcloud storage buckets add-iam-policy-binding gs://YOUR-BUCKET \
      --member=serviceAccount:SERVICE-ACCOUNT --role=roles/storage.objectAdmin
    gcloud run deploy newsapp --source . --region REGION --allow-unauthenticated \
      --service-account SERVICE-ACCOUNT --set-env-vars BUCKET=YOUR-BUCKET

Deployed as `newsapp` in `asia-south1`, bucket `rajkumar-newsapp`, running as the `clipboard-run` service account.

## Notes

- The bucket keeps every day's JSON (no lifecycle rule), so old days remain as an archive.
- Headlines and photos belong to their publishers; each card links back to the original story.
