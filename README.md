# WhatsApp Service Templates Extension

A Chrome Extension for WhatsApp Web that helps customer service agents quickly reply with pre-configured templates.

## Features
- **Proactive Context**: Suggests templates based on chat keywords (e.g., "refund" -> Policy templates).
- **Floating Panel**: Quick access to all templates inside WhatsApp Web.
- **Configurable**: Add/Edit/Delete templates and rules via the Options page.
- **Safe**: Does NOT auto-send messages. Inserts text into the input box for you to review and send.
- **Assist Mode**: Semi-automated conversational flows. Detects customer replies (e.g., "1") and auto-drafts the next step in a script.

## Assist Mode (Conversational Flow)
This extension helps you guide conversations using defined decision trees.

**How it works:**
1.  **Toggle ON**: Switch "Assist Mode" to ON in the panel header.
2.  **Start a Flow**: Go to the "Guided Reply" tab and select a flow (e.g., "Parcel Locker Assist").
3.  **Auto-Drafting**:
    - The extension will draft the first message. **You click Send.**
    - When the customer replies (e.g., sends "1"), the extension detects it.
    - It immediately **drafts** the next response in the flow.
    - **You click Send.**
4.  **Safety First**: The extension **NEVER** automatically sends a message. It only types it for you.

## Installation
1. Download or clone this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked**.
5. Select the `whatsapp-template-extension` folder.
6. Open WhatsApp Web (https://web.whatsapp.com).

## Usage
1. Open a chat in WhatsApp Web.
2. The **Quick Replies** panel will appear on the right side.
3. Click a template to insert it into the message box.
4. Use the search bar to find specific templates.
5. Click the "Manage Templates" link or the extension icon to configure templates and rules.

## Configuration
- **Templates**: Define title, category, and content. Variables like `{{customer_name}}` can be used (currently manual replacement).
- **Rules**: Map keywords to categories. For example, map "price" to the "Sales" category to auto-suggest it when a customer asks about price.

## Privacy & Security
- This extension interacts only with `web.whatsapp.com`.
- All data (templates, rules) is stored locally in your browser (`chrome.storage.sync`).
- No external servers or tracking.
