# Implementation Plan - WhatsApp Template Extension

## Goal Description
Create a Chrome Extension (Manifest V3) for WhatsApp Web that allows users to insert pre-configured templates into the chat input. Features include a floating UI, template management (CRUD), and basic context awareness.

## User Review Required
> [!NOTE]
> This extension relies on the DOM structure of WhatsApp Web. If WhatsApp updates their UI class names or structure, the selectors in `contentScript.js` may need to be updated. This is an inherent limitation of DOM-based extensions.

## Proposed Changes

Target Directory: `/Users/nick/development/chrome-extensions/whatsapp-template-extension`

### Configuration & Setup
#### [NEW] [manifest.json](file:///Users/nick/development/chrome-extensions/whatsapp-template-extension/manifest.json)
- Manifest V3
- Permissions: `storage`
- Host Permissions: `https://web.whatsapp.com/*`
- Background Service Worker: `background.js`
- Content Script: `contentScript.js` + `styles.css`
- Action: `popup.html`
- Options UI: `options.html`

### Core Logic
#### [NEW] [utils.js](file:///Users/nick/development/chrome-extensions/whatsapp-template-extension/utils.js)
- Shared helper functions
- `getTemplates()`: Fetch from chrome.storage
- `saveTemplates()`: Save to chrome.storage
- `getRules()` / `saveRules()`
- Default templates and rules for first-time initialization.
- Logic to resolving variables like `{{customer_name}}` (if possible to extract) or just placeholders.

#### [NEW] [background.js](file:///Users/nick/development/chrome-extensions/whatsapp-template-extension/background.js)
- Service worker.
- Listener for onInstalled to initialize default templates.
- Context menu (optional, if time permits, but not in core requirements).

### Content Script (WhatsApp Integration)
#### [NEW] [contentScript.js](file:///Users/nick/development/chrome-extensions/whatsapp-template-extension/contentScript.js)
- **DOM Observation**: Use `MutationObserver` to detect chat open/switch.
- **UI Injection**: Create a floating side panel (`div#wa-template-panel`).
    - Toggle visibility button.
    - List of templates (grouped by category).
    - Search bar.
- **Message Insertion**:
    - Locate the editable div in WhatsApp: `div[contenteditable="true"][data-tab="10"]` (or similar reliable selector).
    - Use `document.execCommand('insertText', false, text)` to ensure React state updates.
    - Dispatch `input` events as a fallback.
- **Context Awareness**:
    - Read last N messages from the DOM (`.message-in` selectors).
    - Simple specific keyword matching to highlight/suggest templates.

#### [NEW] [styles.css](file:///Users/nick/development/chrome-extensions/whatsapp-template-extension/styles.css)
- CSS for the injected panel and the popup/options pages (shared or separate).
- Scoped styles for the panel (e.g., `#wa-template-extension-root ...`) to avoid conflicts.

### Extension UI
#### [NEW] [popup.html](file:///Users/nick/development/chrome-extensions/whatsapp-template-extension/popup.html) & [popup.js](file:///Users/nick/development/chrome-extensions/whatsapp-template-extension/popup.js)
- Simple on/off toggle.
- "Open Settings" button.
- Possibly a quick view of "suggested templates" based on currently active tab (if possible to communicate efficiently). For simplicity, mainly just control and settings link.

#### [NEW] [options.html](file:///Users/nick/development/chrome-extensions/whatsapp-template-extension/options.html) & [options.js](file:///Users/nick/development/chrome-extensions/whatsapp-template-extension/options.js)
- Full Template Manager.
- Add/Edit/Delete Templates.
- Field: Title, Category, Content (with variable placeholders).
- Rule Manager (keyword -> category/template).

## Verification Plan

### Automated Tests
- N/A (Unit tests for DOM integration are brittle without a full browser mock).

### Manual Verification
1. **Installation**: Load unpacked extension in `chrome://extensions`.
2. **Setup**: Open Options page, verify default templates exist. Create a new template "Test Reply".
3. **WhatsApp Integration**:
   - Open specific test session (or personal WhatsApp Web).
   - Verify Floating Panel appears.
   - Verify it collapses/expands.
4. **Context Awareness**:
   - Have a friend/alt account send a message containing "refund".
   - Verify the panel suggests "Refund" related templates (if implemented).
5. **Insertion**:
   - Click a template.
   - Verify text appears in the input box.
   - **Crucially**: Verify the "Send" button in WhatsApp becomes active (meaning React detected the input).
