# Listening: research (2026-10-26)

Research for a later spec; nothing has been built.

## Bottom line

- **Read aloud.** Start with the iPhone's own voices through the browser (the Web Speech API). It's free, works offline and can highlight each sentence and word, but it probably stops when the phone locks. For listening with the phone locked, the app needs real audio files made by a voice service, played through a plain `<audio>` element.
- **Audio + VTT/SRT import.** Build it now, keeping the files on the device. A single long audio file keeps playing on a locked iPhone in a home-screen app, and it costs $0.
- **Shared player.** Idea 2's player (audio plus timed text, lock-screen controls, highlighting) is the same player that generated audio for Idea 1 needs. Building Idea 2 first means Idea 1's second step only adds "make the audio".
- **OpenAI is out.** OpenAI is retiring `tts-1`, `tts-1-hd` and `gpt-4o-mini-tts` on **January 6, 2027** ([deprecations](https://developers.openai.com/api/docs/deprecations)), so don't build on them.

## Idea 1: Read aloud

**Recommendation, in two steps:**

1. **Smallest first step ($0/month):** a Listen button in the reader using `speechSynthesis`.
   - Speak one utterance per sentence, starting at the first sentence on screen.
   - Highlight the sentence when its utterance starts and the word on each `boundary` event. Save the position as it goes.
   - This works on the Mac and on the iPhone while the screen is on. Then run the iPhone tests listed at the end.
2. **If you need it with the phone locked (likely):** a "Make audio" action. It is a new route on the existing Worker, using the same Firebase-token check as link import.
   - The route sends the text, in pieces of a few thousand characters, to **Kokoro on DeepInfra**. That costs $0.99 per 1M characters and returns `words` with start and end times ([DeepInfra API](https://deepinfra.com/hexgrad/Kokoro-82M/api)).
   - The app joins the pieces into one file per chapter or article and stores it on the phone. It plays through `<audio>` with lock-screen controls and highlights from the timings.
   - About **$3/month** for 4 books and 20 articles, with no storage service at first. Add R2 only when the phone and the Mac should share the audio.

A few notes on step 2:
- **Why Kokoro:** it costs about the same as Google's cheapest voices but sounds clearly better. Its quality score is 1066, level with Google Chirp 3 HD at 1064 (which costs $30 per 1M) and above Azure Neural (1036) and Polly Neural (898) ([Artificial Analysis leaderboard](https://artificialanalysis.ai/text-to-speech/leaderboard)).
- **If Kokoro sounds too flat:** switch to Inworld TTS-2 Flash ($15 per 1M, quality score 1221, word timings), about $44/month. It's the same code with a different endpoint.
- **No new account at all:** MeloTTS on Workers AI runs inside your Cloudflare account. It costs $0.000205 per audio minute ([model page](https://developers.cloudflare.com/workers-ai/models/melotts/)) and fits in the free 10,000 neurons a day, which is about 9 hours of audio a day ([Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)). It returns no timings and its quality is untested, so listen to a sample first.
- **Highlighting without timings from the service:** make one request per paragraph and add up the clip lengths. That gives paragraph-level highlighting with any service. This is my design inference, not a sourced claim.

## Idea 2: Audio + VTT/SRT

**Smallest first step ($0/month):**
- An "Add audio + transcript" option: pick an .mp3 or .m4a file and a .vtt or .srt file.
- `parse.js` turns the cues into blocks with start times, so highlights and notes work as in any book (add unit tests).
- The audio is kept on the device in IndexedDB and played from a blob URL with `<audio>` and Media Session.
- The current cue is highlighted on `timeupdate`, which fires about 4 to 66 times a second ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/timeupdate_event)). Tapping a line seeks to it.
- Write your own small parser: `<track>` takes only WebVTT, not SRT.

**Later:**
- R2 to sync the audio across devices.
- Podcasts through the `<podcast:transcript>` tag, which links VTT, SRT, JSON, HTML or text files ([Podcast Index spec](https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/tags/transcript.md)). The Worker can fetch both files.
- YouTube is different. There is no audio file, only the embedded player, and I didn't verify whether it plays on a locked iPhone.

## Comparison (heavy month: 4 books + 20 articles ≈ 2.9M characters ≈ 52 hours of audio at about 155 words a minute)

| Option | Cost: one book (600k chars) / heavy month | Locked iPhone and lock-screen controls | Highlight while reading | Offline | New services |
|---|---|---|---|---|---|
| Web Speech (on-device voices) | $0 / $0 | Probably stops when locked or backgrounded; no lock-screen controls (test it) | Yes: sentence (one utterance each) and word (`boundary`) | Yes | None |
| Safari's own Listen to Page | $0 / $0 | Yes, with lock-screen controls, but in Safari only, not the home-screen app | Moves by sentence; highlighting not documented | Page must be loaded | None, no code |
| **Kokoro (DeepInfra) audio, kept on the phone** | ~$0.60 / ~$3 | Yes for one file per chapter, plus Media Session controls | Word timings | Yes, once made | DeepInfra account, Worker route |
| Same, plus R2 for sync | +$0 within 10 GB | Same | Same | Yes, if cached | Plus R2 (card on file) |
| MeloTTS on Workers AI | $0 / $0 within the free daily allowance | Same as audio files | Paragraph level, by clip length | Yes | None |
| Google WaveNet | $0 / $0 (under 4M chars a month free) | Same | Per sentence via SSML `<mark>` | Yes | Google Cloud billing |
| Inworld TTS-2 Flash | $9 / ~$44 | Same | Word timings | Yes | Inworld account |
| ElevenLabs v4 Turbo | $24 / ~$116 | Same | Character timings | Yes | ElevenLabs account |
| **Audio + VTT/SRT import, on the phone** | $0 / $0 | Yes for one long file | Per cue | Yes | None |

## A. On-device voices (Web Speech)

- **Locked screen or background:** on iOS, speech stops when Safari goes to the background or the phone locks, and only a page reload brings it back ([WebOutLoud, Safari 15.4](https://weboutloud.io/bulletin/speech_synthesis_in_safari/)).
  - A 2026 vendor post says Apple's own Speak Screen also stops on lock ([ReadAloudReader](https://readaloudreader.com/blog/safari-read-aloud/)).
  - I found nothing confirming a fix on iOS 18 or 26, nothing specific to home-screen apps, and no report that a silent looping `<audio>` keeps speech going. The silent-clip trick people describe is for the mute switch ([example](https://github.com/vburckhardt/abc/pull/8)).
- **Lock-screen controls:** I found no source tying Media Session to `speechSynthesis`. Speech isn't a media element, so I expect no Now Playing entry. That is my inference.
- **Word highlighting:** works.
  - WebKit passes AVSpeechSynthesizer's word ranges on as `boundary` events. The source comment says "AVSpeechSynthesizer only supports word boundaries", so there are no sentence events ([WebKit source](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/platform/cocoa/PlatformSpeechSynthesizerCocoa.mm)).
  - `charIndex` has been in Safari since version 7 and `charLength` since 16 ([MDN compat data](https://github.com/mdn/browser-compat-data/blob/main/api/SpeechSynthesisEvent.json)).
  - Events can go missing for utterances queued right after `cancel()` ([WebKit bug 238189](https://auto-bugs.webkit.org/show_bug.cgi?id=238189)).
- **Other iOS catches:** the first `speak()` must come from a tap; the mute switch silences speech in iOS Safari; and the app must keep a reference to each utterance, or its `onend` may never fire ([talkrapp](https://talkrapp.com/speechSynthesis.html)).
- **Chrome on the Mac:** speech stops after about 15 seconds with long utterances, especially with Google's network voices. Use local voices and one utterance per sentence ([dev.to](https://dev.to/jankapunkt/cross-browser-speech-synthesis-the-hard-way-and-the-easy-way-353), [Caktus](https://www.caktusgroup.com/blog/2025/11/03/the-halting-problem/)). Chrome's `boundary` support is marked partial ([MDN data](https://github.com/mdn/browser-compat-data/blob/main/api/SpeechSynthesisUtterance.json)).
- **Which voices:**
  - Safari lists only built-in voices. The code keeps only `isSystemVoice` voices, and the reason given is "Only show built-in voices when requesting through WebKit to reduce fingerprinting surface area" ([WebKit source](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/platform/cocoa/PlatformSpeechSynthesizerCocoa.mm), [commit](https://github.com/WebKit/WebKit/commit/92def18cd50c9dc9dec1555046a6ec9ece8b1edf)).
  - So no Siri voices, and no Enhanced or Premium voices you download in Settings. Apple: "only the pre-installed voices are available" ([Apple forum](https://developer.apple.com/forums/thread/723503)). A bug report calls the listed voices robotic and is still open ([WebKit bug 290497](https://bugs.webkit.org/show_bug.cgi?id=290497)).
  - Possible way around it: when no voice is set, WebKit uses the system's default voice for the language. On iOS 18.6.2 that was the voice picked in Spoken Content settings; on iOS 26.0 and 26.1 it fell back to Samantha ([Apple forum](https://developer.apple.com/forums/thread/804648)). Worth a test.
  - On the Mac, Safari uses the same filter, while Chrome and Edge list every installed voice ([Apple forum](https://developer.apple.com/forums/thread/723503)).
- **Listen to Page:** Safari's own reader (Reader button, then Listen to Page) keeps playing with lock-screen controls ([Dave Rupert](https://daverupert.com/2023/09/listen-to-page-mobile-safari-17/), [AbilityNet iOS 26](https://mcmw.abilitynet.org.uk/how-to-listen-to-web-pages-in-ios-26-on-your-iphone-or-ipad)). It appears only when Safari's Reader accepts the page.

## B. Voice services (price per 1M characters; book = 600k characters)

| Service and tier | Price per 1M chars | Book | Free tier | Timings | Quality score |
|---|---|---|---|---|---|
| Kokoro on DeepInfra | $0.99 | $0.59 | not checked | Word | 1066 |
| Workers AI MeloTTS | $0.000205 per audio minute | ~$0.13 | 10k neurons a day (~9 h) | None | not ranked |
| Google Standard / WaveNet | $4 | $2.40 | 4M a month | SSML `<mark>` timepoints | 920 (WaveNet) |
| Google Neural2 | $16 | $9.60 | 1M a month | SSML `<mark>` | 897 |
| Google Chirp 3 HD | $30 | $18 | 1M a month | None (`<mark>` is ignored) | 1064 |
| Gemini 3.8 Flash-Lite TTS (preview) | $0.50 text / $6 audio per 1M tokens until Dec 31, 2026, then $1 / $12 | ~$6, then ~$12 | none | None found | 1256 |
| Azure Neural | $15 | $9 | 0.5M a month on the free tier | Word and sentence | 1036 |
| Azure Neural HD | $22 | $13.20 | as above | DragonHD: none; HD Omni: word | 1144 |
| Polly Standard / Neural | $4 / $16 | $2.40 / $9.60, doubled with speech marks | first 12 months | Word and sentence (billed again) | 898 (Neural) |
| Polly Generative / Long-Form | $30 / $100 | $18 / $60 | first 12 months | Generative: none | 1067 / 1033 |
| OpenAI tts-1 / tts-1-hd | $15 / $30 | $9 / $18 | none | None documented | 1091 / 1106 |
| ElevenLabs v4 / v4 Turbo and Flash | $80 / $40 | $48 / $24 | about 10k chars a month | Character | 1334 / 1338 |
| Inworld TTS-2 / TTS-2 Flash | $25 / $15 | $15 / $9 | up to 70 minutes | Word or character | 1271 / 1221 |

Sources for the table:
- **Google:** [prices and free tiers](https://cloud.google.com/text-to-speech/pricing). Gemini is billed at 25 audio tokens per second, so a book is about 0.97M audio tokens. `<mark>` timepoints are in the v1beta1 API ([SSML docs](https://docs.cloud.google.com/text-to-speech/docs/ssml)). Chirp 3 HD ignores tags it doesn't list ([Chirp 3 HD docs](https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd)). Billing must be turned on.
- **Azure:** [retail price API](https://prices.azure.com/api/retail/prices) ($15 Neural, $22 HD) and [pricing page](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/) (0.5M free). HD timing limits and "real-time only" are in the [HD voices docs](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/high-definition-voices).
- **Polly:** [pricing](https://aws.amazon.com/polly/pricing/) (speech marks are billed at the speech rate) and [speech marks docs](https://docs.aws.amazon.com/polly/latest/dg/speechmarks.html) (standard, neural and long-form only).
- **OpenAI:** [pricing](https://developers.openai.com/api/docs/pricing). `gpt-4o-mini-tts` is billed per token: $0.60 text in and $12 audio out per 1M tokens. The replacement, `gpt-realtime-2.1-mini`, is $20 per 1M audio tokens and runs on the Realtime API.
- **ElevenLabs:** [API pricing](https://elevenlabs.io/pricing/api) and [timestamps endpoint](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps) (default MP3 is 128 kbps).
- **Inworld:** [pricing](https://inworld.ai/pricing) and [timestamps docs](https://docs.inworld.ai/tts/capabilities/timestamps) (English and Spanish).
- **Quality scores:** [Artificial Analysis leaderboard](https://artificialanalysis.ai/text-to-speech/leaderboard). Higher is better.
- **Not verified:** Cartesia Sonic 3.6 scores 1291 at about $49 per 1M by the same leaderboard, but I couldn't confirm whether it returns timings.

## C. Where audio files live

- **Size:** speech at 32 kbps mono is 14.4 MB an hour; at 48 kbps, 21.6 MB; at 64 kbps, 28.8 MB (bitrate arithmetic).
  - A book (about 11 hours) is 160 to 320 MB.
  - A heavy month (52 hours) is 0.75 to 1.5 GB.
  - Ask services for low-bitrate MP3: ElevenLabs defaults to 128 kbps, which is 58 MB an hour.
- **Cloudflare R2:** free each month for 10 GB stored, 1M Class A and 10M Class B operations, and all downloads. Beyond that, $0.015 per GB-month ([R2 pricing](https://developers.cloudflare.com/r2/pricing/)). Turning it on usually asks for a card ([2026 setup guide](https://tech-insider.org/how-to-set-up-cloudflare-r2-2026/)). It works from the existing Worker.
  - Safari needs byte-range (206) responses for media ([Apple](https://developer.apple.com/library/mac/documentation/AppleApplications/Reference/SafariWebContent/CreatingVideoforSafarioniPhone/CreatingVideoforSafarioniPhone.html)), so the Worker must pass `Range` through to R2.
  - The Workers Free plan allows 10 ms CPU and 50 subrequests per request ([limits](https://developers.cloudflare.com/workers/platform/limits/)). Pass audio through without decoding base64 in the Worker, or pay for Workers Paid at $5/month minimum ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)).
- **Firebase Storage:** needs the Blaze plan. This has applied to legacy buckets since February 3, 2026, and a Spark project loses access to its buckets ([Firebase FAQ](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)). Skip it.
- **Device only (IndexedDB):**
  - A home-screen app gets the same storage as Safari: each site may use up to 60% of the disk ([WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)).
  - Eviction is least-recently-used, under storage pressure or after a period of no use.
  - `navigator.storage.persist()` is granted by heuristics, such as the site being a home-screen app.
  - Home-screen apps keep their own day counter for the 7-day storage limit, so their data isn't expected to be wiped by it ([WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)).
  - Serve audio from an IndexedDB blob URL rather than the service-worker cache. Serving byte ranges from cache is hard, and cached 206 replies corrupt playback ([web.dev](https://web.dev/articles/sw-range-requests)).

## D. The audio + transcript player on a locked iPhone

- **Plain `<audio>` in home-screen apps:** stopping in the background was a WebKit bug, fixed in iOS 15.4 ([bug 198277](https://bugs.webkit.org/show_bug.cgi?id=198277), duplicate of [232909](https://bugs.webkit.org/show_bug.cgi?id=232909)).
- **October 2026 report:** a track keeps playing on the lock screen in a home-screen app, but when it ends the audio session closes and the next track won't start until the app is opened again ([daily.dev summary of the Medium post](https://daily.dev/posts/getting-my-iphone-music-app-to-keep-playing-on-the-lock-screen-l8ytobjbj)). Workarounds:
  - Set `loop` on the element and switch tracks yourself when it jumps back to 0:00.
  - Register the Media Session handlers again on each `playing` event.
  - An older report of the same track-end problem is [WebKit bug 261858](https://bugs.webkit.org/show_bug.cgi?id=261858).
  - So use one file per chapter or episode, not a file per paragraph.
- **Media Session:** `metadata`, `setActionHandler` and `setPositionState` have been in Safari since version 15 ([MDN compat data](https://github.com/mdn/browser-compat-data/blob/main/api/MediaSession.json)).
- **One stream from many clips:** possible with ManagedMediaSource, on the iPhone since Safari 17.1 ([WebKit](https://webkit.org/blog/14735/)), but not needed for a first version.

## Not verified: what to try on your iPhone

1. Web Speech in the home-screen app and in a Safari tab: does it keep speaking when you lock the phone or switch apps? (Expected: no.)
2. Does word highlighting (`boundary` events) work on iOS 26 in the home-screen app?
3. Which voices does `getVoices()` list? Set an Enhanced voice in Settings → Accessibility → Spoken Content → Voices and see whether speech with no voice chosen uses it.
4. Does a silent looping `<audio>` keep speech going when locked? No source says it works.
5. Does Listen to Page appear for own-shelf's reader in Safari?
6. Does a 1-hour and an 11-hour audio file from an IndexedDB blob keep playing in the home-screen app when locked? Do the lock-screen seek and pause buttons work, and what happens at the end of a chapter?
7. Is Kokoro's voice comfortable for hours of listening? Try MeloTTS and Inworld samples too.
8. Does iOS keep a 150 to 300 MB audio file in IndexedDB, and does `persist()` return true in the home-screen app?
9. How long does making a book's audio take with the app open, and does the free Worker stay under its 10 ms CPU limit?
10. On the Mac, does speech carry on in a background tab and with the screen locked? (Expected: yes; not checked.)

Also unverified: Kokoro and Inworld free tiers, Cartesia timings, whether Gemini TTS returns any timings, and MeloTTS quality.
