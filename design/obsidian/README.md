# own-shelf looks for Obsidian

Four looks as Obsidian CSS snippets, each with light and dark. No plugins, no remote images: textures are small inline SVGs.

- Leather & vellum, Ukiyo-e and Scroll: the three pinned looks from `design/looks.json`.
- Horizon (`shelf-horizon.css`): an Obsidian-only look, calm and open. The note sits on a pale sky that lightens toward a low horizon. Along the foot of the view, mountain ranges fade with distance, with a sparse treeline and long slow waves. At night it is the same coast at dusk, under a crescent moon. Headings are in Optima.

## Use one

Copy a file from `snippets/` into your vault's `.obsidian/snippets/` folder. In Obsidian: Settings → Appearance → CSS snippets, press the reload icon, and switch on one snippet. Light or dark follows Settings → Appearance → Base color scheme.

Fonts come from the device. Each stack starts with the own-shelf font, used when it's installed, and falls back to fonts that ship with macOS and iOS (Hoefler Text, Hiragino Mincho, Iowan Old Style). Each of the three app looks has a commented-out Google Fonts import for the own-shelf fonts in its header. Horizon uses only device fonts (Optima, Iowan Old Style), so it has no import.

## Rebuild

```bash
node design/obsidian/build.mjs
```

It writes `snippets/*.css` and `snippets/contrast.json` (text-to-background contrast for every pairing, day and night). The three app looks take their token and texture code straight from `design/themes-lab.html` at build time, so a change to a look in the lab reaches the snippets on the next build. Horizon is not an app look, so its palette, landscape and contrast targets live in `build.mjs` itself.

Horizon's text scrolls over its landscape, so in its rows of `contrast.json` "page" means every tone text can pass over: the sky, the haze, each range, the trees, the sea and its waves, and the moon. It holds every text tier there to 4.5:1, faint text included. It also has rows for callout titles on their own tint, tables, code blocks and highlights.
