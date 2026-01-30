document.addEventListener('DOMContentLoaded', async () => {
    const toggle = document.getElementById('toggle-enable');
    const openOptionsBtn = document.getElementById('open-options');

    // Load current state
    const data = await chrome.storage.sync.get('settings');
    const settings = data.settings || WATemplates.DEFAULTS.settings;

    // Default to true if undefined
    toggle.checked = settings.enabled !== false;

    // Toggle Listener
    toggle.addEventListener('change', async (e) => {
        const isEnabled = e.target.checked;
        const currentData = await chrome.storage.sync.get('settings');
        const newSettings = { ...(currentData.settings || {}), enabled: isEnabled };

        await chrome.storage.sync.set({ settings: newSettings });
    });

    // Open Options
    openOptionsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });
});
