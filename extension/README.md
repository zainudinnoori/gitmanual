# gitmanual browser extension

Adds a **Setup manual** button to GitHub repos. On a repo's home page it sits next to Notifications, Fork and Star; on its other pages (issues, folders…) it's a small button in the corner. The toolbar icon opens the manual for the repo you're on.

**Privacy:** the extension reads the repo's name from the GitHub page and links to `gitmanual.com/owner/repo`. It makes no requests, stores nothing and collects nothing. The only permission is `activeTab`, so the toolbar icon can read the current tab's address when you click it.

## Try it locally

1. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**.
2. **Load unpacked** → pick this `extension/` folder.
3. Open any repo, e.g. <https://github.com/ollama/ollama>.

Firefox: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick `manifest.json`.

## Publish

```bash
npm run extension:zip      # → gitmanual-extension.zip
```

**Chrome Web Store** (one-time $5 developer fee): <https://chrome.google.com/webstore/devconsole> → **New item** → upload the zip, then fill in:

- **Category:** Developer Tools. **Language:** English.
- **Single purpose:** "Adds a button on GitHub repository pages that opens the repository's setup manual on gitmanual.com."
- **Permission justification, activeTab:** "When the toolbar icon is clicked, reads the current tab's address to open that repository's manual."
- **Data usage:** collects no user data (tick none), and certify the three statements.
- **Screenshots:** 1280×800, e.g. a repo page with the button, and the manual it opens.

Edge Add-ons (<https://partner.microsoft.com/dashboard/microsoftedge>) and Firefox Add-ons (<https://addons.mozilla.org/developers>) take the same zip, free.

For an update, raise `version` in `manifest.json`, zip again and upload.
