# own-shelf looks for Obsidian

Five looks as Obsidian CSS snippets, each with light and dark. No plugins, no remote images.

- Leather & vellum, Ukiyo-e and Scroll (`shelf-leather-vellum.css`, `shelf-ukiyo-e.css`, `shelf-scroll.css`): the app's three pinned looks from `design/looks.json`. Their textures are small inline SVGs.
- Lanternwood Still and Classic (`shelf-lanternwood-still.css`, `shelf-lanternwood-classic.css`): two Obsidian-only looks derived from the Lanternwood theme, with a pixel-art lakeside at the foot of the note. The art is embedded in each file, so they are 633 KB and 264 KB.

## Use one

Copy a file from `snippets/` into your vault's `.obsidian/snippets/` folder. In Obsidian: Settings → Appearance → CSS snippets, press the reload icon, and switch on one snippet. Light or dark follows Settings → Appearance → Base color scheme.

Fonts come from the device. In the three app looks each stack starts with the own-shelf font, used when it's installed, and falls back to fonts that ship with macOS and iOS (Hoefler Text, Hiragino Mincho, Iowan Old Style); each of their headers has a commented-out Google Fonts import for the own-shelf fonts. The Lanternwood looks set text and the interface in device fonts too. Classic draws headings and callout titles in Departure Mono, a pixel font embedded in the snippet, so there is nothing to install.

## The Lanternwood looks

The scene is a band at the foot of the note pane, and the note's view stops above it, so text never sits on the art: a forest lake with two cottages, a stone bridge and mountains behind. The page is the scene's own sky, so the band's top edge fades into it. The crop keeps the mountain, bridge and lake in the middle; on a narrow pane the cottages fall away first. The status bar takes the lake's deep colour. On a phone the scene sits behind the bottom bar, its icons on the lake. At night the page is a moonlit blue and the cottages and lanterns are lit.

- Still: the detailed art on a sage sky, with device fonts throughout, so the scene is the only pixel art.
- Classic: upstream's classic art, chunkier and brighter, on a cyan sky, with pixel headings and callout titles.

No Style Settings plugin is needed. Each snippet carries the whole theme, so Lanternwood itself doesn't need installing; use it with Obsidian's default theme. Every text tier is at least 4.5:1 by day and by night, faint text and callout titles included.

They are derived from [Lanternwood](https://github.com/davidhurtadoai/lanternwood) 0.4.4 by David Hurtado, under the MIT License; the licence is in `lanternwood/LICENSE.txt` and at the top of each snippet. Classic embeds Departure Mono by Helena Zhang, under the SIL Open Font License 1.1, with its notice. Lanternwood's other fonts aren't used by either look, so they and their notices are left out.

What changed from upstream: the Style Settings block is removed and each option fixed, so the forest shows without the plugin; the whole-workspace backdrop becomes the band; the page takes the art's sky; night is a moonlit blue in place of near-black, with the scene lifted slightly; every text tier is pushed to 4.5:1; the chrome is quieter (no pixel type in tabs, lists, properties or the status bar, 1px edges, no hard drop shadows, flat callout panels in place of the cut-corner frame); and unused fonts are dropped. Each snippet's header lists the same changes.

## Rebuild

```bash
node design/obsidian/build.mjs
```

It writes `snippets/*.css` and, for the three app looks, `snippets/contrast.json` (text-to-background contrast for every pairing, day and night). The app looks take their token and texture code straight from `design/themes-lab.html` at build time, so a change to a look in the lab reaches the snippets on the next build; their contrast is worked out from their palettes as they build.

For the Lanternwood looks `build.mjs` calls `lanternwood.mjs`. It reads the vendored upstream files in `lanternwood/` (`theme.css`, `LICENSE.txt`) as data and, for each look, keeps upstream's header, font notices and `@font-face` blocks, under a header of ours with the credit, the changes and the MIT notice; drops the Style Settings block and fixes each option on or off; drops the whole-workspace backdrop and keeps only the day and night scenes the look uses; adds a palette that pushes every text tier to at least 4.5:1 on the surfaces it sits on, and the CSS in `lanternwood/overrides/` (the band, the type, the quieter chrome and callouts); and last drops the embedded fonts the finished CSS never uses, with their notices.

Their contrast is measured in a browser, against mock Obsidian pages, outside this repo: the mocks use Obsidian's own stylesheet, which can't be committed. The figures live in `lanternwood/contrast.json`. A rebuild measures nothing, so after a change to the palette or the overrides, measure again and replace that file.

## Update Lanternwood

Replace `lanternwood/theme.css` with the new release's (and `LICENSE.txt`, if it changed) and rebuild. The build stops with an error when upstream adds an option it doesn't know (decide its default in `lanternwood.mjs`), when a scene it expects is missing, or when one of the anchors it cuts upstream's file at has moved. Then measure contrast again, replace `lanternwood/contrast.json` and update the version named above.
