/**
 * WhatsApp Template Extension - Background Script
 */

// Import shared utils (requires Manifest V3 "importScripts" or just relying on execution order if listed in manifest, 
//  BUT service workers in MV3 need importScripts explicitly if not a module, or just standard ES modules).
//  Since we didn't specify "type": "module" in background, we use importScripts.
importScripts('utils.js');

chrome.runtime.onInstalled.addListener(async () => {
    console.log('WhatsApp Template Extension Installed');
    await WATemplates.initStorage();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'openOptions') {
        chrome.runtime.openOptionsPage();
    } else if (message.action === 'translate') {
        // Use free gtx endpoint for anonymous translation
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${message.sl}&tl=${message.tl}&dt=t&q=${encodeURIComponent(message.text)}`;

        fetch(url)
            .then(res => res.json())
            .then(data => {
                // gtx format is [[["translatedText", "originalText", ...]]]
                const translatedText = data[0].map(x => x[0]).join('');
                sendResponse({ success: true, text: translatedText });
            })
            .catch(err => {
                console.error('Translation failed:', err);
                sendResponse({ success: false, error: err.message });
            });
        return true; // Keep channel open for async response
    }
});
