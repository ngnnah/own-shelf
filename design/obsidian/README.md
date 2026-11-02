# own-shelf looks for Obsidian

Four looks as Obsidian CSS snippets, each with light and dark. No plugins, no remote images: textures are small inline SVGs.

- Leather & vellum, Ukiyo-e and Scroll: the three pinned looks from `design/looks.json`.
- Horizon (`shelf-horizon.css`) and its pixel twin (`shelf-horizon-pixel.css`): two Obsidian-only looks of one scene. The page is the sky, a plain gradient behind the note. The scene is a band at the foot of the pane, below the text: a high mountain with a snow cap, a green hill with three round trees, a lower far mountain, a flat sea and a cloud. At night it is a moonlit blue with a moon and a few stars. On a phone the band is the navigation bar, a strip of sky with the mountains and the sea under the icons. Horizon draws it in flat colour (a Japanese print, a Ghibli background) with Optima headings; the pixel twin draws it on a coarse pixel grid, Minecraft-like, with monospace headings.

## Use one

Copy a file from `snippets/` into your vault's `.obsidian/snippets/` folder. In Obsidian: Settings → Appearance → CSS snippets, press the reload icon, and switch on one snippet. Light or dark follows Settings → Appearance → Base color scheme.

Fonts come from the device. Each stack starts with the own-shelf font, used when it's installed, and falls back to fonts that ship with macOS and iOS (Hoefler Text, Hiragino Mincho, Iowan Old Style). Each of the three app looks has a commented-out Google Fonts import for the own-shelf fonts in its header. Horizon uses only device fonts (Optima, Iowan Old Style), so it has no import.

## Rebuild

```bash
node design/obsidian/build.mjs
```

It writes `snippets/*.css` and `snippets/contrast.json` (text-to-background contrast for every pairing, day and night). The three app looks take their token and texture code straight from `design/themes-lab.html` at build time, so a change to a look in the lab reaches the snippets on the next build. Horizon is not an app look, so its palette, landscape and contrast targets live in `build.mjs` itself.

Horizon's text sits on plain sky and on flat callout panels, never on the scene: the note's view stops above the band. Its rows in `contrast.json` hold every text tier there to 4.5:1, faint text included, plus callout titles, tables, code, highlights, the header on the sky and the icons on the phone's sea-coloured bar. Both Horizon snippets come from the same composition in `build.mjs`, drawn twice: once as flat shapes, once as pixels.
