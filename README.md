# BeatEdit demo

Static companion website for **BeatEdit: Symbolic Music Generation as Explicit Editing**.

## Local preview

Run `node preview.mjs`, then visit <http://127.0.0.1:3013/>. No install or build is needed. The local server supports byte ranges for Safari audio and binds only to localhost. Stop it with Ctrl+C.

## Structure

- `index.html`: paper metadata, abstract, and page structure.
- `static/css/beatedit.css`: responsive styles.
- `static/js/beatedit.js`: original sample/method mapping, comparison controls, and optional MIDI preview.
- `demo_content/`: unchanged recordings, MIDI, and piano rolls from the original demo.

MP3 playback does not depend on external libraries. The optional synthesized MIDI player loads Tone.js, Magenta, and html-midi-player from jsDelivr on demand; it requires network access. MIDI playback timbre differs from the rendered recordings.

## Checks

Run `node tests/check-site.mjs` and `node --check static/js/beatedit.js`. The asset check covers all 540 sample files. Before publishing, check desktop/mobile layouts and input → output playback in a browser.

The listening workbench now shows three method cards at once, with input and ground-truth recordings above. Only the task and excerpt need selecting; additional baselines expand below. Segment completion has two original BeatEdit outputs, so its third card is the explicitly labeled Anticipate Music Transformer baseline. No missing method output is synthesized or substituted.

The September 2026 redesign uses the ReMel research-companion visual template, adapted with blue accents and vertically stacked method cards. Desktop cards place playback controls on the left and piano rolls on the right. It preserves the original 19 examples, order, method labels, and media. The abstract follows the camera-ready paper, excluding its closing repository sentence; resource links are provided as buttons. The two method PNGs are rendered from the camera-ready PDF figures. The method and resources sections link to the foundational BEAT encoding paper.
