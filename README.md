# Astrolab Remote

The web app that controls [Astrolab](https://github.com/marcwingduck/astrolab), my ESP8266 celestial map of Paris, from the home WiFi: http://solar.marclieser.de/

It is served over plain HTTP on purpose: an HTTPS page may not open the board's unencrypted `ws://` connection.

## How it works

The page talks to the board's WebREPL over WebSocket and sends calls like `paris.show('clock', True)` and `paris.apply_dimmer(0.5)` (see Astrolab's [Modes](https://github.com/marcwingduck/astrolab#modes)). It connects on load, reads the board's dimmer back, shows the board's errors under the title, and lets go of the connection while the page is in the background: the WebREPL takes only one, and an open tab would block deploys and debugging.

## Deploy

Copy `.env.example` to `.env` (gitignored) and fill in the server, then:

```
./deploy.sh               # build and upload
./deploy.sh --dry-run     # build, show what would change
./deploy.sh --build-only  # build into ./dist to look at
```

The build gives css, js, icons, manifest and the map image their content hash in the name and points `index.html` at them, so no browser can keep an old one. `index.html` itself carries the build's version and checks `version.txt` on load: a page cached from an earlier version reloads the current one, once. The upload mirrors the build via SFTP (or FTPS with `DEPLOY_PROTO=ftp`) using lftp, deleting what the build no longer has.

## Icons

`assets/icon.svg` is the home screen icon, `assets/favicon.svg` the browser tab's. The PNGs are rendered from them:

```
inkscape assets/icon.svg --export-type=png --export-filename=assets/icon-192.png -w 192 -h 192
inkscape assets/icon.svg --export-type=png --export-filename=assets/icon-512.png -w 512 -h 512
inkscape assets/favicon.svg --export-type=png --export-filename=assets/favicon.png -w 32 -h 32
```
