# MarkIINA

A basic IINA bookmark plugin, with no dependencies or build step.

## Install

In IINA Settings → Plugins, install from GitHub using `vishudhshah/MarkIINA`, or pick MarkIINA from IINA's community plugin list. Updates are checked against GitHub Releases.

## Install for development

```sh
cd ..
/Applications/IINA.app/Contents/MacOS/iina-plugin link MarkIINA
```

Run from this folder, then enable MarkIINA in IINA Settings → Plugins. Restart IINA if it was already open. IINA must support plugins and have plugin support enabled.

## Use

Open a video and find MarkIINA in IINA's Plugins menu:

- **Show Bookmarks Panel** opens the Bookmarks sidebar. Add with an optional name and timestamp; leave the timestamp blank to save the current position. Click a bookmark to jump or use its Delete button.
- **Add Bookmark at Timestamp…** accepts seconds, MM:SS, or HH:MM:SS (fractional seconds supported), followed by an optional name. Invalid times and positions past the video duration are rejected.
- **Add Bookmark** saves the current timestamp immediately.
- **Add Named Bookmark…** asks for an optional name. Blank names are accepted; Cancel saves nothing. The timestamp is captured before the dialog opens.
- **Jump to Bookmark** lists this video's bookmarks in time order and seeks to the selected timestamp.
- **Delete Bookmark** removes the selected bookmark immediately.

Named bookmarks display only their name; unnamed bookmarks display their timestamp.

Bookmarks are saved in IINA's plugin preferences and flushed after every change. They survive restarting IINA. Each exact video URL (including the full path for local files) has its own bookmarks. Moving or renaming a file, or changing a network URL, gives it a separate bookmark list. Duplicate timestamps are allowed. Deleting plugin data also deletes bookmarks.

## Development and validation

The initial files were generated with IINA's official `iina-plugin new` tool using the official template (downloaded through a connected tool and supplied as a local ZIP because shell DNS was unavailable). The plugin runs directly from `src/index.js`.

```sh
node --check src/index.js
node --test tests/bookmarks.test.cjs
# Run pack from a directory whose path contains no spaces.
# Supply the plugin folder through a relative path or temporary symlink.
/Applications/IINA.app/Contents/MacOS/iina-plugin pack MarkIINA
```

Publish a release so IINA's update checker sees it:

```sh
git tag vX.Y.Z
gh release create vX.Y.Z ../MarkIINA-X.Y.Z.iinaplgz --generate-notes
```

Manual check in IINA: add an unnamed and named bookmark, jump to both, delete one, open another video to check isolation, then quit/reopen IINA and reopen the first video to check persistence. Also check Cancel and an empty name in the naming dialog.

API reference: https://docs.iina.io/
