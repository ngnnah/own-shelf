# own-shelf looks for Obsidian

The three pinned looks from `design/looks.json` (Leather & vellum, Ukiyo-e, Scroll) as Obsidian CSS snippets, each with light and dark. No plugins, no remote images: textures are small inline SVGs.

## Use one

Copy a file from `snippets/` into your vault's `.obsidian/snippets/` folder. In Obsidian: Settings → Appearance → CSS snippets, press the reload icon, and switch on one snippet. Light or dark follows Settings → Appearance → Base color scheme.

Fonts come from the device. Each stack starts with the own-shelf font, used when it's installed, and falls back to fonts that ship with macOS and iOS (Hoefler Text, Hiragino Mincho, Iowan Old Style). Each snippet's header has a commented-out Google Fonts import for the own-shelf fonts.

## Rebuild

```bash
node design/obsidian/build.mjs
```

It writes `snippets/*.css` and `snippets/contrast.json` (text-to-background contrast for every pairing, day and night). The token and texture code comes straight from `design/themes-lab.html` at build time, so a change to a look in the lab reaches the snippets on the next build.
