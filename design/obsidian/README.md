# own-shelf looks for Obsidian

Four looks as Obsidian CSS snippets, each with light and dark. No plugins, no remote images: textures are small inline SVGs.

- Leather & vellum, Ukiyo-e and Scroll: the three pinned looks from `design/looks.json`.
- Horizon (`shelf-horizon.css`): an Obsidian-only look, a coast seen from a cliff. A big sky stands over a low horizon. On one side a snow-crowned range fades into mist; on the other, open sea runs to the horizon, with waves and the sun's path on the water. One wind-bent pine stands on the headland. The text sits on a band of mist down the middle of the note. On a phone the coast is a panorama under the note's title, the note ends on a beach, and the sea runs along the navigation bar. Night is blue hour, with a moon over the sea. Headings are in Optima.

## Use one

Copy a file from `snippets/` into your vault's `.obsidian/snippets/` folder. In Obsidian: Settings → Appearance → CSS snippets, press the reload icon, and switch on one snippet. Light or dark follows Settings → Appearance → Base color scheme.

Fonts come from the device. Each stack starts with the own-shelf font, used when it's installed, and falls back to fonts that ship with macOS and iOS (Hoefler Text, Hiragino Mincho, Iowan Old Style). Each of the three app looks has a commented-out Google Fonts import for the own-shelf fonts in its header. Horizon uses only device fonts (Optima, Iowan Old Style), so it has no import.

## Rebuild

```bash
node design/obsidian/build.mjs
```

It writes `snippets/*.css` and `snippets/contrast.json` (text-to-background contrast for every pairing, day and night). The three app looks take their token and texture code straight from `design/themes-lab.html` at build time, so a change to a look in the lab reaches the snippets on the next build. Horizon is not an app look, so its palette, landscape and contrast targets live in `build.mjs` itself.

Horizon's text sits on its mist veil, over whatever part of the scene lies behind it. So in its rows of `contrast.json` "page" means the veil laid over every tone of the scene (sky, clouds, sun or moon, each range, snow, cliff, pine, sea, crests, glitter, foam), and over that a frosted callout panel. Every text tier is held to 4.5:1 there, faint text included. It also has rows for callout titles, tables, code blocks, highlights, the header on the sky, the title over the phone's panorama, and the icons on the phone's sea-coloured bar.
