/**
 * WhatsApp Template Extension - Content Script
 */

const EXTENSION_ID = 'wa-template-extension-root';
const PANEL_ID = 'wa-template-panel';

let templates = [];
let rules = [];
let flows = [];
let currentChatContext = '';
let currentChatTitle = '';
let favoriteIds = [];

// Flow State (Legacy/Manual)
let currentFlowId = null;
let currentNodeId = null;
let flowHistory = [];

// Assist Mode / State Machine
let isAssistMode = false;
const chatStates = new Map(); // Key: chatTitle, Value: { flowId, nodeId, status }

// Initialize
(async () => {
    console.log('WA Extension: Initializing...');
    const data = await chrome.storage.sync.get('settings');
    const settings = data.settings || {};

    if (settings.enabled === false) {
        console.log('WA Extension: Disabled by user.');
    } else {
        await loadData();
        injectPanel();
        toggleCollapse(); // Hide by default
        setupMutationObserver();

        // Start Assist Loop
        setInterval(assistLoop, 1000);
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync') {
            if (changes.settings && changes.settings.newValue) {
                if (changes.settings.newValue.enabled === false) {
                    const panel = document.getElementById(PANEL_ID);
                    if (panel) panel.style.display = 'none';
                } else {
                    const panel = document.getElementById(PANEL_ID);
                    if (panel) {
                        panel.style.display = '';
                    } else {
                        loadData().then(() => {
                            injectPanel();
                            toggleCollapse(); // Hide by default
                            setupMutationObserver();
                        });
                    }
                }
            }
            if (changes.templates || changes.rules || changes.flows) {
                loadData().then(() => {
                    renderTemplates();
                    renderFlowSelector();
                });
            }
        }
    });
})();

async function loadData() {
    // Force merge new flows by re-running initStorage
    // Note: In production, we rely on the utils.js logic. 
    // Here we explicitly call it.
    await WATemplates.initStorage();

    templates = await WATemplates.getTemplates();
    rules = await WATemplates.getRules();
    flows = await WATemplates.getFlows();

    const favData = await chrome.storage.sync.get('favorite_templates');
    favoriteIds = favData.favorite_templates || [];

    console.log('WA Extension: Data loaded', templates.length, 'templates', rules.length, 'rules', flows.length, 'flows', favoriteIds.length, 'favorites');
}

/**
 * 1. UI INJECTION & UPDATES
 */
function injectPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;

    // Header
    const header = document.createElement('div');
    header.id = 'wa-template-header';
    header.innerHTML = `
    <span class="title">WA Assistant</span>
    <div class="actions">
      <div class="wa-assist-card" title="Assist Mode Toggle">
        <span class="wa-assist-label">Assist</span>
        <label class="switch">
          <input type="checkbox" id="wa-assist-toggle">
          <span class="slider round"></span>
        </label>
      </div>
      <button class="wa-icon-btn" id="wa-refresh-btn" title="Refresh Data">↻</button>
      <button class="wa-icon-btn" id="wa-settings-btn" title="Manage Settings">⚙️</button>
      <button class="wa-icon-btn" id="wa-minimize-btn">_</button>
    </div>
  `;

    // Tabs
    const tabs = document.createElement('div');
    tabs.id = 'wa-panel-tabs';
    tabs.innerHTML = `
    <div class="wa-panel-tab active" data-view="quick">Templates</div>
    <div class="wa-panel-tab" data-view="flow">Guided Reply</div>
  `;

    // Quick View
    const quickView = document.createElement('div');
    quickView.className = 'wa-panel-view active';
    quickView.id = 'view-quick';

    const searchContainer = document.createElement('div');
    searchContainer.id = 'wa-template-search-container';
    searchContainer.innerHTML = `
        <div class="wa-search-wrapper">
            <input type="text" id="wa-template-search" placeholder="Search templates...">
            <button class="wa-icon-btn" id="wa-add-template-btn" title="Add New Template">+</button>
        </div>
    `;
    const searchInput = searchContainer.querySelector('#wa-template-search');

    const list = document.createElement('div');
    list.id = 'wa-template-list';
    quickView.appendChild(searchContainer);
    quickView.appendChild(list);

    // Flow View
    const flowView = document.createElement('div');
    flowView.className = 'wa-panel-view';
    flowView.id = 'view-flow';

    const flowSelectorContainer = document.createElement('div');
    flowSelectorContainer.id = 'wa-flow-selector-container';
    const flowSelect = document.createElement('select');
    flowSelect.id = 'wa-flow-select';
    flowSelect.innerHTML = '<option value="">Select a flow...</option>';
    flowSelectorContainer.appendChild(flowSelect);

    const flowStepContainer = document.createElement('div');
    flowStepContainer.id = 'wa-flow-step-container';
    flowStepContainer.style.display = 'none';

    flowView.appendChild(flowSelectorContainer);
    flowView.appendChild(flowStepContainer);

    // Footer (Removed/Empty)
    const footer = document.createElement('div');
    footer.id = 'wa-template-footer';
    footer.style.display = 'none';

    // Collapsed Toggle
    const collapsedToggle = document.createElement('div');
    collapsedToggle.id = 'wa-template-toggle-btn';
    collapsedToggle.innerHTML = '💬';
    collapsedToggle.style.display = 'none';

    // Resize Handles
    const handles = {
        r: document.createElement('div'),
        l: document.createElement('div'),
        b: document.createElement('div'),
        br: document.createElement('div'),
        bl: document.createElement('div')
    };

    Object.keys(handles).forEach(key => {
        handles[key].id = `wa-resize-handle-${key}`;
        handles[key].className = 'wa-resize-handle';
    });

    // Assemble
    panel.appendChild(header);
    // panel.appendChild(statusBar); // Removed
    panel.appendChild(tabs);
    panel.appendChild(quickView);
    panel.appendChild(flowView);
    panel.appendChild(footer);
    panel.appendChild(collapsedToggle);

    // Template Editor Overlay - Premium Modal
    const editorOverlay = document.createElement('div');
    editorOverlay.id = 'wa-edit-overlay';
    editorOverlay.innerHTML = `
        <div id="wa-edit-header">Edit Template Content</div>
        <input type="hidden" id="wa-edit-id">
        <div class="wa-edit-meta">
            <input type="text" id="wa-edit-title" placeholder="Template Title (e.g. Greeting)">
            <input type="text" id="wa-edit-category" placeholder="Category (e.g. Intro)">
        </div>
        <div id="wa-language-selector">
            <button class="wa-lang-btn active" data-lang="en">EN</button>
            <button class="wa-lang-btn" data-lang="ms">BM</button>
            <button class="wa-lang-btn" data-lang="zh">CN</button>
        </div>
        <div id="wa-common-words"></div>
        <div id="wa-other-templates"></div>
        <div class="wa-textarea-container">
            <textarea id="wa-edit-textarea" placeholder="Type your message here..."></textarea>
            <div id="wa-edit-loading">
                <div class="wa-loading-spinner"></div>
                <span>Translating...</span>
            </div>
        </div>
        <div id="wa-refine-btn-container">
        <button id="wa-refine-btn" class="wa-edit-btn wa-refine-btn confirm">
                ✨ Refine with AI
            </button></div>
        <div class="wa-edit-controls">
            <button class="wa-edit-btn cancel" id="wa-edit-cancel">Cancel</button>
            <button class="wa-edit-btn" id="wa-edit-save">Save & Update</button>
            <button class="wa-edit-btn confirm" id="wa-edit-confirm">Insert to Chat</button>
        </div>
    `;
    panel.appendChild(editorOverlay);

    Object.values(handles).forEach(h => panel.appendChild(h));

    document.body.appendChild(panel);

    // Setup Move and Resize logic
    setupMoveAndResize(panel, header, handles);

    // Listeners
    searchInput.addEventListener('input', (e) => renderTemplates(e.target.value));
    header.querySelector('#wa-minimize-btn').addEventListener('click', toggleCollapse);
    header.querySelector('#wa-refresh-btn').addEventListener('click', async () => {
        const btn = document.getElementById('wa-refresh-btn');
        btn.classList.add('spinning');
        await loadData();
        renderTemplates();
        renderFlowSelector();
        showToast("Templates & Flows Refreshed!");
        setTimeout(() => btn.classList.remove('spinning'), 1000);
    });
    header.querySelector('#wa-settings-btn').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'openOptions' });
    });
    searchContainer.querySelector('#wa-add-template-btn').addEventListener('click', () => {
        openTemplateEditor(); // Empty editor for new
    });
    collapsedToggle.addEventListener('click', toggleCollapse);

    // Editor Listeners
    editorOverlay.querySelector('#wa-edit-cancel').addEventListener('click', () => {
        editorOverlay.classList.remove('active');
    });

    editorOverlay.querySelector('#wa-edit-confirm').addEventListener('click', () => {
        const text = editorOverlay.querySelector('#wa-edit-textarea').value;
        if (text) {
            insertTemplate(text);
            editorOverlay.classList.remove('active');
            showToast("Template Inserted!");
        }
    });

    editorOverlay.querySelector('#wa-edit-save').addEventListener('click', async () => {
        const id = document.getElementById('wa-edit-id').value;
        const title = document.getElementById('wa-edit-title').value;
        const category = document.getElementById('wa-edit-category').value;
        const content = document.getElementById('wa-edit-textarea').value;

        if (!title || !content) {
            showToast("Title and Content are required!");
            return;
        }

        const template = { id: id || WATemplates.generateId(), title, category: category || 'General', content };
        await WATemplates.saveTemplate(template);
        await loadData();
        renderTemplates();
        editorOverlay.classList.remove('active');
        showToast(id ? "Template Updated!" : "Template Created!");
    });

    editorOverlay.querySelectorAll('.wa-lang-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const lang = btn.dataset.lang;
            const textarea = document.getElementById('wa-edit-textarea');
            const container = document.getElementById('wa-common-words');

            // UI state
            editorOverlay.querySelectorAll('.wa-lang-btn').forEach(x => x.classList.remove('active'));
            btn.classList.add('active');

            if (container && textarea) {
                // Show loading state potentially?
                btn.style.opacity = '0.5';

                // Smart translate draft (now dynamic via background)
                await smartTranslateDraft(textarea, lang);

                renderCommonWords(container, textarea, lang);
                btn.style.opacity = '1';
            }
        });
    });

    document.getElementById('wa-assist-toggle').addEventListener('change', (e) => {
        isAssistMode = e.target.checked;
        console.log('Assist Mode:', isAssistMode);

        // Visual Feedback
        const statusText = isAssistMode ? "Assist Mode ON: I will draft replies for you." : "Assist Mode OFF";
        showToast(statusText);
    });

    // Refine Button
    document.getElementById('wa-refine-btn').addEventListener('click', async () => {
        await refineMessage();
    });

    tabs.querySelectorAll('.wa-panel-tab').forEach(t => {
        t.addEventListener('click', () => {
            tabs.querySelectorAll('.wa-panel-tab').forEach(x => x.classList.remove('active'));
            panel.querySelectorAll('.wa-panel-view').forEach(x => {
                x.classList.remove('active');
                x.style.display = 'none'; // Fix: explicitly hide
            });

            t.classList.add('active');
            const targetView = document.getElementById('view-' + t.dataset.view);
            if (targetView) {
                targetView.classList.add('active');
                targetView.style.display = 'flex'; // Fix: explicitly show
            }
        });
    });

    flowSelect.addEventListener('change', (e) => startFlow(e.target.value));

    renderTemplates();
    renderFlowSelector();
}

function toggleCollapse() {
    const panel = document.getElementById(PANEL_ID);
    const elements = [
        document.getElementById('wa-template-header'),
        document.getElementById('wa-panel-tabs'),
        document.getElementById('view-quick'),
        document.getElementById('view-flow'),
        document.getElementById('wa-template-footer'),
        document.getElementById('wa-edit-overlay'),
        ...['r', 'l', 'b', 'br', 'bl'].map(k => document.getElementById(`wa-resize-handle-${k}`))
    ];
    const toggleBtn = document.getElementById('wa-template-toggle-btn');
    let isCollapsed = panel.classList.contains('collapsed');

    if (!isCollapsed) {
        // --- Collapsing ---
        // Backup current inline styles (use defaults if empty)
        panel.dataset.preWidth = panel.style.width || '320px';
        panel.dataset.preHeight = panel.style.height || 'auto';
        panel.dataset.preTop = panel.style.top || '80px';
        panel.dataset.preRight = panel.style.right || '20px';
        panel.dataset.preLeft = panel.style.left || 'auto';

        panel.classList.add('collapsed');
        elements.forEach(el => { if (el) el.style.display = 'none'; });
        const editor = document.getElementById('wa-edit-overlay');
        if (editor) editor.classList.remove('active');
        toggleBtn.style.display = 'flex';

        // Set fixed safe position for collapsed state (top-right)
        panel.style.top = '100px';
        panel.style.right = '20px'; // Consistent margin
        panel.style.left = 'auto';
        panel.style.width = '80px';
        panel.style.height = '80px';
    } else {
        // --- Expanding ---
        panel.classList.remove('collapsed');
        document.getElementById('wa-template-header').style.display = '';
        document.getElementById('wa-panel-tabs').style.display = '';
        document.getElementById('wa-template-footer').style.display = '';
        ['r', 'l', 'b', 'br', 'bl'].forEach(k => {
            const h = document.getElementById(`wa-resize-handle-${k}`);
            if (h) h.style.display = 'block';
        });

        // Restore active view
        const activeTab = document.querySelector('.wa-panel-tab.active');
        if (activeTab) {
            const viewId = 'view-' + activeTab.dataset.view;
            document.getElementById(viewId).classList.add('active');
        }
        document.querySelectorAll('.wa-panel-view').forEach(v => {
            if (v.classList.contains('active')) v.style.display = 'flex';
            else v.style.display = 'none';
        });

        // Restore backed up inline styles
        panel.style.width = panel.dataset.preWidth || '320px';
        panel.style.height = panel.dataset.preHeight || 'auto';
        panel.style.top = panel.dataset.preTop || '80px';

        if (panel.dataset.preLeft && panel.dataset.preLeft !== 'auto') {
            panel.style.left = panel.dataset.preLeft;
            panel.style.right = 'auto';
        } else {
            panel.style.right = panel.dataset.preRight || '20px';
            panel.style.left = 'auto';
        }

        toggleBtn.style.display = 'none';
    }
}

/**
 * 2. CORE ASSIST LOGIC (Loop)
 */
function assistLoop() {
    if (!isAssistMode) return;

    // 1. Identify Current Chat - Robust Detection
    let newTitle = null;

    // Selector strategy:
    // 1. Main header title (often h2 or span with title attrib)
    const headerTitleEl = document.querySelector('header ._amig') ||
        document.querySelector('header [title]') ||
        document.querySelector('#main header span[title]');

    if (headerTitleEl) {
        newTitle = headerTitleEl.getAttribute('title') || headerTitleEl.innerText;
    }

    if (!newTitle || newTitle === currentChatTitle) {
        // Chat hasn't changed or unknown, but check messages
        if (currentChatTitle) checkIncomingMessages(currentChatTitle);
        return;
    }

    // Chat Switched
    currentChatTitle = newTitle;
    console.log('WA Extension: Chat Switched to:', currentChatTitle);

    // Restore State
    if (!chatStates.has(currentChatTitle)) {
        chatStates.set(currentChatTitle, {
            flowId: null,
            currentNodeId: null,
            status: 'idle',
            lastCustomerMessage: ''
        });
    }

    // If idle, maybe suggest flow?
    const state = chatStates.get(currentChatTitle);
    if (state.status === 'idle') {
        // For now, do nothing until user explicitly starts a flow OR we detect a keyword
        // Bonus: auto-start Parcel flow if we see "parcel"
    }
}

function checkIncomingMessages(chatId) {
    const state = chatStates.get(chatId);
    if (!state || !state.flowId) return; // Not in a flow

    // Read last message
    const messages = Array.from(document.querySelectorAll('.message-in .copyable-text'));
    if (messages.length === 0) return;

    const lastMsg = messages[messages.length - 1].innerText.trim();

    // If message is new
    if (lastMsg !== state.lastCustomerMessage) {
        state.lastCustomerMessage = lastMsg;
        console.log('New Customer Message:', lastMsg);

        processFlowResponse(state, lastMsg);
    }
}

function processFlowResponse(state, input) {
    const flow = flows.find(f => f.id === state.flowId);
    if (!flow) return;

    const node = flow.nodes[state.currentNodeId];
    if (!node) return;

    // Resolve Next Node
    let nextNodeId = null;

    if (node.nextMap) {
        // Exact match "1", "2" etc.
        const normalized = input.toLowerCase();

        if (node.nextMap[normalized]) {
            nextNodeId = node.nextMap[normalized];
        } else {
            // Try keyword matching if keys are keywords?
            // for now simple exact match or numeric
        }
    } else if (node.next) {
        nextNodeId = node.next; // Auto advance if linear (unlikely for user input step, but possible)
    }

    if (nextNodeId) {
        state.currentNodeId = nextNodeId;
        triggerAutoDraft(state);
    }
}

function triggerAutoDraft(state) {
    const flow = flows.find(f => f.id === state.flowId);
    const node = flow.nodes[state.currentNodeId];

    if (node && node.message) {
        // DRAFTING
        const formatted = WATemplates.formatText(node.message, { customer_name: currentChatTitle });
        console.log('Auto-Drafting:', formatted);
        openTemplateEditor(formatted, true);

        // Update State
        state.status = 'drafted';
    }
}

/**
 * 3. FLOW UI HANDLERS (Manual Override)
 */
function startFlow(flowId, skipInitialDraft = false) {
    if (!flowId) {
        document.getElementById('wa-flow-step-container').style.display = 'none';
        return;
    }

    if (skipInitialDraft) {
        clearInput();
        // Also reset dropdown if it's a "hard" restart
        const select = document.getElementById('wa-flow-select');
        if (select) select.value = '';
        document.getElementById('wa-flow-step-container').style.display = 'none';
        currentFlowId = null;
        currentNodeId = null;
        return;
    }

    const flow = flows.find(f => f.id === flowId);
    if (!flow) return;

    // Manual Start -> Update Assist State too
    if (currentChatTitle) {
        chatStates.set(currentChatTitle, {
            flowId: flowId,
            currentNodeId: flow.startNode,
            status: 'active',
            lastCustomerMessage: '' // reset so next msg is new
        });
    }

    currentFlowId = flowId;
    currentNodeId = flow.stateNode || flow.startNode; // legacy variable for UI
    flowHistory = [];

    renderFlowStep();

    // Auto-Draft First Step
    const firstNode = flow.nodes[flow.startNode];
    if (firstNode && (firstNode.type === 'draft' || firstNode.message)) {
        const textToInsert = firstNode.message || firstNode.text;
        const formatted = WATemplates.formatText(textToInsert, { customer_name: currentChatTitle });
        openTemplateEditor(formatted, true);
    }

    document.getElementById('wa-flow-step-container').style.display = 'flex';
}

function renderFlowSelector() {
    const select = document.getElementById('wa-flow-select');
    if (!select) return;
    select.innerHTML = '<option value="">Select a flow...</option>';
    flows.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.name;
        select.appendChild(opt);
    });
}

function renderFlowStep() {
    // Uses legacy Manual UI for now, but synced with Assist State
    const container = document.getElementById('wa-flow-step-container');
    container.innerHTML = '';

    const flow = flows.find(f => f.id === currentFlowId);
    if (!flow || !flow.nodes) {
        container.innerHTML = '<div style="padding:20px; text-align:center; color:#999;">Select a flow to start</div>';
        return;
    }
    const node = flow.nodes[currentNodeId];

    if (!node) {
        container.innerHTML = '<div style="padding:20px; text-align:center; color:#999;">Flow starting...</div>';
        return;
    }

    const question = document.createElement('div');
    question.className = 'wa-flow-question';
    // Use node.text for internal question, or node.message to show what was drafted
    question.textContent = node.text || "Current Draft:";
    container.appendChild(question);

    const preview = document.createElement('div');
    preview.className = 'wa-flow-preview-box';

    const previewText = document.createElement('div');
    previewText.style.fontSize = '12px';
    previewText.style.color = 'inherit';
    previewText.innerText = node.message || node.text;

    const insertBtn = document.createElement('button');
    insertBtn.className = 'wa-flow-btn primary';
    insertBtn.style.marginTop = '8px';
    insertBtn.style.width = '100%';
    insertBtn.textContent = 'Insert to Chat';
    insertBtn.onclick = () => {
        const textToInsert = node.message || node.text;
        const formatted = WATemplates.formatText(textToInsert, { customer_name: currentChatTitle });
        openTemplateEditor(formatted, true);
    };

    preview.appendChild(previewText);
    preview.appendChild(insertBtn);
    container.appendChild(preview);

    const controls = document.createElement('div');
    controls.className = 'wa-flow-controls';

    // 1. Standard Options (Decision Tree)
    if (node.options && node.options.length > 0) {
        node.options.forEach(opt => {
            const btn = document.createElement('div');
            btn.className = 'wa-flow-option';
            btn.textContent = opt.label;
            btn.onclick = () => handleOptionClick(opt);
            container.appendChild(btn);
        });
    }

    // 2. Conversational Responses (Assist Mode Simulation)
    if (node.nextMap) {
        Object.keys(node.nextMap).forEach(key => {
            const btn = document.createElement('div');
            btn.className = 'wa-flow-option';
            btn.textContent = `User says: "${key}"`;
            btn.onclick = () => {
                // Manual override simulation of user reply
                const state = chatStates.get(currentChatTitle);
                if (state) processFlowResponse(state, key);

                // Update UI
                currentNodeId = node.nextMap[key];
                renderFlowStep();

                // Auto-Draft for simulation button
                const flow = flows.find(f => f.id === currentFlowId);
                const nextNode = flow.nodes[currentNodeId];
                if (nextNode && (nextNode.message || nextNode.text)) {
                    const textToInsert = nextNode.message || nextNode.text;
                    const formatted = WATemplates.formatText(textToInsert, { customer_name: currentChatTitle });
                    openTemplateEditor(formatted, true);
                }
            };
            container.appendChild(btn);
        });
    }

    const resetBtn = document.createElement('button');
    resetBtn.className = 'wa-flow-btn danger';
    resetBtn.textContent = 'Restart Flow';
    resetBtn.onclick = () => startFlow(currentFlowId, true);
    controls.appendChild(resetBtn);

    container.appendChild(controls);
}

function handleOptionClick(option) {
    if (option.templateId) {
        // Resolve template
        const tmpl = templates.find(t => t.id === option.templateId);
        if (tmpl) {
            const formatted = WATemplates.formatText(tmpl.content, { customer_name: currentChatTitle });
            openTemplateEditor(formatted, true);
        } else {
            alert("Template not found for ID: " + option.templateId);
        }
    } else if (option.next) {
        flowHistory.push(currentNodeId);
        currentNodeId = option.next;
        renderFlowStep();

        // Auto-Draft Next Step
        const flow = flows.find(f => f.id === currentFlowId);
        const nextNode = flow.nodes[currentNodeId];
        if (nextNode && (nextNode.message || nextNode.text)) {
            const textToInsert = nextNode.message || nextNode.text;
            const formatted = WATemplates.formatText(textToInsert, { customer_name: currentChatTitle });
            openTemplateEditor(formatted, true);
        }
    }
}

/**
 * 4. RENDERING TEMPLATES (Quick View)
 */
function renderTemplates(searchTerm = '') {
    const list = document.getElementById('wa-template-list');
    if (!list) return;
    list.innerHTML = '';

    const lowerSearch = searchTerm.toLowerCase();

    const filtered = templates.filter(t =>
        t.title.toLowerCase().includes(lowerSearch) ||
        t.content.toLowerCase().includes(lowerSearch) ||
        t.category.toLowerCase().includes(lowerSearch)
    );

    const suggestedCategory = getSuggestedCategory();

    // 1. Render Favorites Section
    const favorites = templates.filter(t => favoriteIds.includes(t.id));
    if (favorites.length > 0) {
        const favHeader = document.createElement('div');
        favHeader.className = 'wa-category-header favorites';
        favHeader.textContent = '★ Favorites';
        list.appendChild(favHeader);

        favorites.forEach(t => {
            renderTemplateItem(list, t, true, suggestedCategory === t.category);
        });
    }

    const grouped = filtered.reduce((acc, t) => {
        acc[t.category] = acc[t.category] || [];
        acc[t.category].push(t);
        return acc;
    }, {});

    const categories = Object.keys(grouped).sort((a, b) => {
        if (a === suggestedCategory) return -1;
        if (b === suggestedCategory) return 1;
        return a.localeCompare(b);
    });

    categories.forEach(cat => {
        const catHeader = document.createElement('div');
        catHeader.className = 'wa-category-header';
        if (cat === suggestedCategory) {
            catHeader.style.color = '#008069';
            catHeader.textContent = `${cat} (Suggested)`;
        } else {
            catHeader.textContent = cat;
        }
        list.appendChild(catHeader);

        grouped[cat].forEach(t => {
            renderTemplateItem(list, t, false, cat === suggestedCategory);
        });
    });

    if (filtered.length === 0) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:#999;">No templates found</div>';
    }
}

function renderTemplateItem(container, template, isFavSection = false, isSuggested = false) {
    const item = document.createElement('div');
    item.className = 'wa-template-item';
    if (isSuggested) item.classList.add('suggested');

    const title = document.createElement('div');
    title.className = 'wa-template-title';
    title.textContent = template.title;

    const starBtn = document.createElement('button');
    starBtn.className = 'wa-star-btn';
    const isActuallyFav = favoriteIds.includes(template.id);
    starBtn.textContent = isActuallyFav ? '★' : '☆';
    if (isActuallyFav) starBtn.classList.add('active');

    starBtn.onclick = (e) => {
        e.stopPropagation();
        toggleFavorite(template.id);
    };

    item.appendChild(title);
    item.appendChild(starBtn);

    item.addEventListener('click', () => {
        openTemplateEditor(template.id);
    });

    container.appendChild(item);
}

async function toggleFavorite(id) {
    if (favoriteIds.includes(id)) {
        favoriteIds = favoriteIds.filter(f => f !== id);
    } else {
        favoriteIds.push(id);
    }
    await chrome.storage.sync.set({ favorite_templates: favoriteIds });
    renderTemplates(document.getElementById('wa-template-search')?.value || '');
}

function getSuggestedCategory() {
    if (!currentChatContext) return null;
    const text = currentChatContext.toLowerCase();
    for (const rule of rules) {
        if (text.includes(rule.keyword.toLowerCase())) {
            console.log('Suggestion Triggered:', rule.suggestedCategory);
            return rule.suggestedCategory;
        }
    }
    return null;
}

function setupMutationObserver() {
    const observer = new MutationObserver(() => {
        detectChatContext();
    });
    const appRoot = document.getElementById('app') || document.body;
    observer.observe(appRoot, { childList: true, subtree: true });
}

let lastCheck = 0;
function detectChatContext() {
    const now = Date.now();
    if (now - lastCheck < 2000) return;
    lastCheck = now;

    const messages = Array.from(document.querySelectorAll('.message-in .copyable-text'));
    if (messages.length === 0) return;

    const recentText = messages.slice(-5).map(m => m.innerText).join(' ');

    if (recentText !== currentChatContext) {
        currentChatContext = recentText;
        renderTemplates();
    }
}

/**
 * 5. INSERTION - STRICTLY NO AUTO-SEND
 */
function insertTemplate(text) {
    if (!text) return;
    const input = document.querySelector('footer div[contenteditable="true"]') ||
        document.querySelector('div[contenteditable="true"][data-tab="10"]');

    if (!input) {
        console.warn('WA Extension: Could not find input box');
        alert('Could not find WhatsApp input box. Please click into the chat box first.');
        return;
    }

    input.focus();

    // Method 1: Clipboard Event (Paste Simulation) - Most Robust
    // This is most reliable for WhatsApp Web to handle formatting and newlines correctly.
    let success = false;
    try {
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', text);

        const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dataTransfer
        });

        input.dispatchEvent(pasteEvent);
        success = true;
        console.log('WA Extension: Inserted via Paste event');
    } catch (err) {
        console.error('WA Extension: Paste event failed', err);
    }

    // Method 2: execCommand 'insertHTML' with <br> (Fallback)
    if (!success) {
        console.log('WA Extension: Paste failed, trying insertHTML...');
        try {
            const htmlContent = text.replace(/\n/g, '<br>');
            success = document.execCommand('insertHTML', false, htmlContent);
        } catch (e) {
            console.warn('WA Extension: insertHTML failed', e);
        }
    }

    // Method 3: execCommand 'insertText' (Standard Fallback)
    if (!success) {
        console.log('WA Extension: insertHTML failed, trying insertText...');
        try {
            success = document.execCommand('insertText', false, text);
        } catch (e) {
            console.warn('WA Extension: insertText failed', e);
        }
    }

    // Method 4: Direct DOM manipulation (Last Resort)
    if (!success) {
        console.log('WA Extension: All execCommands failed, fallback to direct DOM manipulation');
        const htmlContent = text.replace(/\n/g, '<br>');
        input.innerHTML = htmlContent;

        const inputEvent = new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: text
        });
        input.dispatchEvent(inputEvent);
    }

    // Visual Feedback for Assist Mode
    if (isAssistMode) {
        input.style.border = "2px solid #00a884";
        setTimeout(() => input.style.border = "none", 1000);
        console.log('ASSIST: Draft inserted, waiting for human send.');
    }
}

/**
 * Clear the WhatsApp chat input field
 */
function clearInput() {
    const input = document.querySelector('div[contenteditable="true"][data-tab="10"]');
    if (!input) return;

    input.focus();
    try {
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        console.log('WA Extension: Chat input cleared');
    } catch (e) {
        console.warn('WA Extension: Failed to clear input', e);
        input.innerHTML = ''; // Fallback
    }
}

/**
 * Open the Template Editor Modal
 * @param {String} input - Template ID or Formatted Text
 * @param {Boolean} isDraft - If true, treats input as formatted text (Draft Mode)
 */
function openTemplateEditor(input = null, isDraft = false) {
    const overlay = document.getElementById('wa-edit-overlay');
    const textarea = document.getElementById('wa-edit-textarea');
    const titleInput = document.getElementById('wa-edit-title');
    const categoryInput = document.getElementById('wa-edit-category');
    const idInput = document.getElementById('wa-edit-id');
    const header = document.getElementById('wa-edit-header');
    const saveBtn = document.getElementById('wa-edit-save');
    const metaContainer = overlay.querySelector('.wa-edit-meta');
    const commonWordsContainer = document.getElementById('wa-common-words');
    const otherTemplatesContainer = document.getElementById('wa-other-templates');

    if (!overlay || !textarea) return;

    // Reset UI visibility
    if (metaContainer) metaContainer.style.display = 'flex';
    if (saveBtn) saveBtn.style.display = 'inline-block';

    if (isDraft) {
        // Mode 3: Drafting (Reviewing formatted text)
        idInput.value = '';
        titleInput.value = '';
        categoryInput.value = '';
        textarea.value = input || '';
        header.textContent = 'Review Message';
        if (metaContainer) metaContainer.style.display = 'none';
        if (saveBtn) saveBtn.style.display = 'none';
    } else if (input) {
        // Mode 2: Editing Existing Template (by ID)
        const t = templates.find(item => item.id === input);
        if (t) {
            idInput.value = t.id;
            titleInput.value = t.title;
            categoryInput.value = t.category;
            textarea.value = t.content;
            header.textContent = 'Edit Template';
        }
    } else {
        // Mode 1: Creating New Template
        idInput.value = '';
        titleInput.value = '';
        categoryInput.value = '';
        textarea.value = '';
        header.textContent = 'Create New Template';
    }

    overlay.classList.add('active');

    // Reset to default language (EN)
    const enBtn = overlay.querySelector('.wa-lang-btn[data-lang="en"]');
    if (enBtn) {
        overlay.querySelectorAll('.wa-lang-btn').forEach(x => x.classList.remove('active'));
        enBtn.classList.add('active');
    }

    if (commonWordsContainer) {
        renderCommonWords(commonWordsContainer, textarea, 'en');
    }

    if (otherTemplatesContainer) {
        renderOtherTemplates(otherTemplatesContainer, textarea, isDraft ? null : input);
    }

    // Check if API key is configured and show/hide refine button
    checkAndShowRefineButton();

    // Auto-focus textarea for immediate editing
    setTimeout(() => {
        if (isDraft) textarea.focus();
        else if (!input) titleInput.focus();
        else textarea.focus();
    }, 50);
}

/**
 * Common Words for CS - Multi-Language
 */
const COMMON_WORDS_TRANSLATIONS = {
    en: {
        shortcuts: ["Hi", "Thank you", "Have a nice day", "You're welcome", "Please wait a moment", "How can I help you?", "Sorry for the delay"]
    },
    ms: {
        shortcuts: ["Hai", "Terima kasih", "Semoga hari anda baik", "Sama-sama", "Sila tunggu sebentar", "Apa yang boleh saya bantu?", "Maaf atas kelewatan"]
    },
    zh: {
        shortcuts: ["嗨", "谢谢", "祝你有美好的一天", "不客气", "请稍等片刻", "有什么我可以帮您的吗？", "抱歉耽搁了"]
    }
};

const EMOJI_SHORTCUTS = ["😊", "🙏", "👍", "👋", "👌", "🤝", "ℹ️", "❤️"];

function renderCommonWords(container, textarea, lang = 'en') {
    const langData = COMMON_WORDS_TRANSLATIONS[lang] || COMMON_WORDS_TRANSLATIONS.en;
    const words = langData.shortcuts;

    container.innerHTML = '';

    // Render Words
    words.forEach(word => {
        createShortcutBtn(container, textarea, word);
    });

    // Divider
    if (words.length > 0) {
        const divider = document.createElement('div');
        divider.className = 'wa-shortcut-divider';
        container.appendChild(divider);
    }

    // Render Emojis
    EMOJI_SHORTCUTS.forEach(emoji => {
        createShortcutBtn(container, textarea, emoji, true);
    });
}

function renderOtherTemplates(container, textarea, currentId = null) {
    container.innerHTML = '';

    // Header for section
    const label = document.createElement('div');
    label.className = 'wa-shortcut-label';
    label.textContent = 'Insert Other Template:';
    container.appendChild(label);

    const scrollContainer = document.createElement('div');
    scrollContainer.className = 'wa-shortcut-scroll';

    // Filter out the current template if editing
    const otherTpls = templates.filter(t => t.id !== currentId);

    if (otherTpls.length === 0) {
        const empty = document.createElement('span');
        empty.style.fontSize = '12px';
        empty.style.color = '#999';
        empty.textContent = ' No other templates available';
        scrollContainer.appendChild(empty);
    } else {
        otherTpls.forEach(t => {
            const btn = document.createElement('button');
            btn.className = 'wa-common-word-btn template-shortcut';
            btn.textContent = t.title;
            btn.title = t.content.substring(0, 50) + (t.content.length > 50 ? '...' : '');
            btn.onclick = () => {
                const formatted = WATemplates.formatText(t.content, { customer_name: currentChatTitle });
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const currentText = textarea.value;

                // Add a newline if there's already text and we're at the end
                const prefix = (currentText.length > 0 && start === currentText.length) ? '\n' : '';
                const textToInsert = prefix + formatted;

                textarea.value = currentText.substring(0, start) + textToInsert + currentText.substring(end);

                const newPos = start + textToInsert.length;
                textarea.setSelectionRange(newPos, newPos);
                textarea.focus();
                showToast(`Inserted: ${t.title}`);
            };
            scrollContainer.appendChild(btn);
        });
    }

    container.appendChild(scrollContainer);
}

function createShortcutBtn(container, textarea, text, isEmoji = false) {
    const btn = document.createElement('button');
    btn.className = isEmoji ? 'wa-common-word-btn emoji' : 'wa-common-word-btn';
    btn.textContent = text;
    btn.onclick = () => {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentText = textarea.value;

        textarea.value = currentText.substring(0, start) + text + currentText.substring(end);

        // Set cursor position after the inserted text
        const newPos = start + text.length;
        textarea.setSelectionRange(newPos, newPos);
        textarea.focus();
    };
    container.appendChild(btn);
}

/**
 * Smart Translate Draft Message
 * Now uses a dynamic translation bridge via the background script.
 */
async function smartTranslateDraft(textarea, targetLang) {
    const text = textarea.value.trim();
    if (!text) return;

    // Mapping for background script
    const langMap = {
        'en': 'en',
        'ms': 'ms',
        'zh': 'zh-CN'
    };

    const loading = document.getElementById('wa-edit-loading');

    return new Promise((resolve) => {
        if (loading) loading.classList.add('active');

        chrome.runtime.sendMessage({
            action: 'translate',
            text: text,
            sl: 'auto', // Auto-detect source language
            tl: langMap[targetLang] || 'en'
        }, (response) => {
            if (loading) loading.classList.remove('active');

            if (response && response.success) {
                textarea.value = response.text;
                showToast(`Translated to ${targetLang.toUpperCase()}`);
            } else {
                console.error('Translation error:', response?.error);
                showToast("Translation error. Please try again.");
            }
            resolve();
        });
    });
}


function showToast(message) {
    let toast = document.getElementById('wa-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'wa-toast';
        toast.style.position = 'fixed';
        toast.style.top = '20px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.backgroundColor = '#333';
        toast.style.color = '#fff';
        toast.style.padding = '10px 20px';
        toast.style.borderRadius = '20px';
        toast.style.zIndex = '10000';
        toast.style.fontSize = '14px';
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = '1';

    setTimeout(() => {
        toast.style.opacity = '0';
    }, 3000);
}

function setupMoveAndResize(panel, header, handles) {
    let isDragging = false;
    let currentHandle = null;
    let startX, startY, startWidth, startHeight, startTop, startLeft;

    // --- Dragging Logic ---
    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.wa-icon-btn')) return;
        if (panel.classList.contains('collapsed')) return;

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = panel.getBoundingClientRect();
        startTop = rect.top;
        startLeft = rect.left;

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault();
    });

    // --- Resizing Logic ---
    Object.keys(handles).forEach(key => {
        handles[key].addEventListener('mousedown', (e) => {
            currentHandle = key;
            startX = e.clientX;
            startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;
            startLeft = rect.left;
            startTop = rect.top;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });
    });

    function onMouseMove(e) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (isDragging) {
            panel.style.top = `${startTop + dy}px`;
            panel.style.left = `${startLeft + dx}px`;
            panel.style.right = 'auto'; // Switch to left/top during interaction
            panel.style.bottom = 'auto';
        }

        if (currentHandle) {
            let newWidth = startWidth;
            let newHeight = startHeight;
            let newLeft = startLeft;
            let newTop = startTop;

            if (currentHandle.includes('r')) {
                newWidth = startWidth + dx;
            }
            if (currentHandle.includes('l')) {
                newWidth = startWidth - dx;
                newLeft = startLeft + dx;
            }
            if (currentHandle.includes('b')) {
                newHeight = startHeight + dy;
            }

            if (newWidth > 200) {
                panel.style.width = `${newWidth}px`;
                panel.style.left = `${newLeft}px`;
                panel.style.right = 'auto';
            }
            if (newHeight > 100) {
                panel.style.height = `${newHeight}px`;
                panel.style.top = `${newTop}px`;
                panel.style.bottom = 'auto';
            }
        }
    }

    function onMouseUp() {
        if (isDragging || currentHandle) {
            isDragging = false;
            currentHandle = null;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            // Save to storage (convert back to right-based if desired, or just stay left-based)
            const rect = panel.getBoundingClientRect();
            chrome.storage.sync.set({
                panelState: {
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height
                }
            });
        }
    }

    // Restore state
    chrome.storage.sync.get('panelState', (data) => {
        if (data.panelState) {
            const s = data.panelState;
            const isCollapsed = panel.classList.contains('collapsed');

            if (isCollapsed) {
                // Currently hidden? Update the "pre-expand" backups instead of live styles
                panel.dataset.preTop = `${s.top}px`;
                panel.dataset.preWidth = `${s.width}px`;
                panel.dataset.preHeight = `${s.height}px`;
                if (s.left !== undefined) {
                    panel.dataset.preLeft = `${s.left}px`;
                    panel.dataset.preRight = 'auto';
                } else if (s.right !== undefined) {
                    panel.dataset.preRight = `${s.right}px`;
                    panel.dataset.preLeft = 'auto';
                }
                console.log('WA Extension: Saved position stored in backup (collapsed mode)');
            } else {
                // Currently visible? Apply directly
                panel.style.top = `${s.top}px`;
                if (s.left !== undefined) {
                    panel.style.left = `${s.left}px`;
                    panel.style.right = 'auto';
                } else if (s.right !== undefined) {
                    panel.style.right = `${s.right}px`;
                    panel.style.left = 'auto';
                }
                panel.style.width = `${s.width}px`;
                panel.style.height = `${s.height}px`;
                console.log('WA Extension: Saved position applied directly');
            }
        }
    });
}

/**
 * AI REFINE FUNCTIONALITY
 */
async function checkAndShowRefineButton() {
    const refineContainer = document.getElementById('wa-refine-container');
    if (!refineContainer) return;

    try {
        const data = await chrome.storage.sync.get('gemini_api_key');
        const hasKey = !!data.gemini_api_key;
        refineContainer.style.display = hasKey ? 'block' : 'none';
    } catch (error) {
        console.error('Error checking API key:', error);
        refineContainer.style.display = 'none';
    }
}

async function refineMessage() {
    const textarea = document.getElementById('wa-edit-textarea');
    const refineBtn = document.getElementById('wa-refine-btn');
    const loadingDiv = document.getElementById('wa-edit-loading');

    if (!textarea || !refineBtn) return;

    const originalText = textarea.value.trim();

    if (!originalText) {
        showToast('Please enter a message to refine');
        return;
    }

    // Get API key
    const data = await chrome.storage.sync.get('gemini_api_key');
    const apiKey = data.gemini_api_key;

    if (!apiKey) {
        showToast('API key not configured. Please add it in settings.');
        return;
    }

    // Show loading state
    refineBtn.disabled = true;
    refineBtn.innerHTML = '<span class="refine-icon">⏳</span><span>Refining...</span>';
    if (loadingDiv) {
        loadingDiv.classList.add('active');
        loadingDiv.querySelector('span').textContent = 'Refining with AI...';
    }

    try {
        const prompt = `You are a professional customer service message editor. Refine the following message to make it more professional, clear, and polite while keeping the same meaning. Keep it concise and natural. Only return the refined message without any explanations or quotes.

Original message: ${originalText}

Refined message:`;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 4000
                    }
                })
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'API request failed');
        }

        const result = await response.json();
        const refinedText = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (refinedText) {
            textarea.value = refinedText;
            showToast('Message refined successfully! ✨');
        } else {
            throw new Error('No response from API');
        }

    } catch (error) {
        console.error('Refine error:', error);
        showToast('Failed to refine message: ' + error.message);
    } finally {
        // Reset button state
        refineBtn.disabled = false;
        refineBtn.innerHTML = '✨ Refine with AI';
        if (loadingDiv) {
            loadingDiv.classList.remove('active');
            loadingDiv.querySelector('span').textContent = 'Translating...';
        }
    }
}
