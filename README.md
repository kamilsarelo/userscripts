# 🧩 Userscripts Collection

A curated collection of userscripts designed to enhance and customize your web browsing experience.

## What Are Userscripts?

Userscripts are small JavaScript programs that run on specific websites, allowing you to modify pages, add features, remove annoyances, and tailor the web to your needs.

## Repository Structure

```
violentmonkey-userscripts/
├── README.md
├── LICENSE
├── .gitignore
├── scripts/           # Development tools
├── assets/            # Images and icons
└── src/               # Userscripts
```

## Requirements

To use these scripts, you'll need a userscript manager browser extension:

| Extension | Browser Support | Notes |
|-----------|-----------------|-------|
| [Violentmonkey](https://violentmonkey.github.io/) | Firefox, Edge, Safari | Open source. ⚠️ Not supported on Chrome (Manifest V2); use Brave as alternative |
| [ScriptCat](https://scriptcat.org/) | Chrome, Firefox | Open source. Supports background scripts; includes built-in IDE |
| [Tampermonkey](https://www.tampermonkey.net/) | Chrome, Firefox, Edge, Safari, Opera | Proprietary, widely compatible |
| [FireMonkey](https://addons.mozilla.org/firefox/addon/firemonkey/) | Firefox | Open source. Uses native userScripts API for better performance & security; supports userstyles |
| [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) | Safari (macOS/iOS) | Open source, clean interface for Apple ecosystem |
| [Greasemonkey](https://www.greasespot.net/) | Firefox | Open source. The original userscript manager |

## Installation

1. Install a userscript manager (see above)
2. Browse the scripts in the [`src/`](src/) directory
3. Click on any `.user.js` file, then click "Raw"
4. The userscript manager will prompt you to install it
5. Done! The script will run automatically on matching websites and update when changes are pushed

## Development

### Local Testing with Dev Server

A development server is included for testing scripts across devices on your local network before pushing to GitHub.

**Usage:**

```bash
python3 scripts/dev-server.py
```

Then open `http://<your-local-ip>:8080` on any device in your network to see available scripts.

**Features:**
- Adds `[DEV]` prefix to script names (coexists with production scripts)
- Modifies `@namespace` to distinguish from production
- Uses milliseconds since epoch as `@version` (always increases)
- CORS enabled for userscript manager update checks

**Requirements:** Python 3.7+ (standard library only)

### Troubleshooting

**Port 8080 already in use:**

Check what's using port 8080:
```bash
lsof -i :8080
```

Kill the process occupying the port:
```bash
kill $(lsof -t -i :8080)
```

## License

[MIT License](LICENSE) — feel free to use, modify, and distribute.

---

*Happy browsing! 🚀*
