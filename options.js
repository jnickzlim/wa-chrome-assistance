/**
 * Options Page Logic
 */

let templates = [];
let rules = [];
let flows = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadAll();
    setupTabs();
    setupForms();
    setupBackupRestore();
    setupSorting();
    setupFlowVisualEditor();
    setupAISettings();
});

function setupBackupRestore() {
    const exportBtn = document.getElementById('export-btn');
    const importBtn = document.getElementById('import-btn');
    const importFile = document.getElementById('import-file');
    const resetBtn = document.getElementById('reset-btn');

    resetBtn.addEventListener('click', async () => {
        if (confirm('This will delete all current templates and reset them to the General defaults. Are you sure?')) {
            await WATemplates.resetToDefaults();
            await loadAll();
            alert('Settings reset to General defaults.');
        }
    });

    exportBtn.addEventListener('click', async () => {
        const data = await WATemplates.exportData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wa-templates-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    importBtn.addEventListener('click', () => {
        importFile.click();
    });

    importFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (confirm('Importing will overwrite your existing templates, rules, and flows. Continue?')) {
                    await WATemplates.importData(data);
                    await loadAll();
                    alert('Data imported successfully!');
                }
            } catch (err) {
                alert('Error importing data: ' + err.message);
            }
            importFile.value = ''; // Reset
        };
        reader.readAsText(file);
    });
}

async function loadAll() {
    templates = await WATemplates.getTemplates();
    rules = await WATemplates.getRules();
    flows = await WATemplates.getFlows();
    populateTemplateDropdowns();
    renderTemplates();
    renderRules();
    renderFlows();
}

function populateTemplateDropdowns() {
    const select = document.getElementById('f-template-id');
    if (!select) return;

    // Save current selection
    const currentVal = select.value;

    select.innerHTML = '<option value="">None</option>';
    templates.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.title;
        select.appendChild(opt);
    });

    // Restore selection if it still exists
    if (currentVal) select.value = currentVal;
}

/**
 * TABS
 */
function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Deactivate all
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            // Activate clicked
            tab.classList.add('active');
            const target = tab.dataset.target;
            document.getElementById(target).classList.add('active');
        });
    });
}

/**
 * TEMPLATES CRUD
 */
function renderTemplates() {
    const tbody = document.querySelector('#template-table tbody');
    tbody.innerHTML = '';

    templates.forEach(t => {
        const tr = document.createElement('tr');
        tr.draggable = true;
        tr.dataset.id = t.id;
        tr.innerHTML = `
      <td class="drag-handle">☰</td>
      <td>${t.title}</td>
      <td>${t.category}</td>
      <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.content}</td>
      <td>
        <button class="btn-secondary btn-sm edit-btn" data-id="${t.id}">Edit</button>
        <button class="btn-danger btn-sm delete-btn" data-id="${t.id}">Delete</button>
      </td>
    `;
        tbody.appendChild(tr);
    });

    // Listeners
    tbody.querySelectorAll('.delete-btn').forEach(btn =>
        btn.addEventListener('click', () => deleteTemplate(btn.dataset.id))
    );
    tbody.querySelectorAll('.edit-btn').forEach(btn =>
        btn.addEventListener('click', () => editTemplate(btn.dataset.id))
    );
}

async function deleteTemplate(id) {
    if (!confirm('Are you sure?')) return;

    // Optimistic UI Update
    templates = templates.filter(t => t.id !== id);
    renderTemplates();

    // New Split Storage
    await WATemplates.deleteTemplate(id);
}

function editTemplate(id) {
    const t = templates.find(item => item.id === id);
    if (!t) return;

    document.getElementById('t-id').value = t.id;
    document.getElementById('t-title').value = t.title;
    document.getElementById('t-category').value = t.category;
    document.getElementById('t-content').value = t.content;

    document.querySelector('#template-form button[type="submit"]').textContent = 'Update Template';
    document.getElementById('t-cancel').style.display = 'inline-block';
}

function resetTemplateForm() {
    document.getElementById('template-form').reset();
    document.getElementById('t-id').value = '';
    document.querySelector('#template-form button[type="submit"]').textContent = 'Save Template';
    document.getElementById('t-cancel').style.display = 'none';
}

/**
 * SORTING
 */
function setupSorting() {
    const tbody = document.querySelector('#template-table tbody');

    tbody.addEventListener('dragstart', (e) => {
        const tr = e.target.closest('tr');
        if (!tr) return;
        tr.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    tbody.addEventListener('dragend', (e) => {
        const tr = e.target.closest('tr');
        if (tr) tr.classList.remove('dragging');

        // Remove all drag-over classes
        tbody.querySelectorAll('tr').forEach(row => row.classList.remove('drag-over'));

        saveNewOrder();
    });

    tbody.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const draggingRow = tbody.querySelector('.dragging');
        const targetRow = e.target.closest('tr');

        if (targetRow && targetRow !== draggingRow) {
            const rect = targetRow.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;

            if (e.clientY < midpoint) {
                tbody.insertBefore(draggingRow, targetRow);
            } else {
                tbody.insertBefore(draggingRow, targetRow.nextSibling);
            }
        }
    });

    tbody.addEventListener('dragenter', (e) => {
        const targetRow = e.target.closest('tr');
        if (targetRow && !targetRow.classList.contains('dragging')) {
            targetRow.classList.add('drag-over');
        }
    });

    tbody.addEventListener('dragleave', (e) => {
        const targetRow = e.target.closest('tr');
        if (targetRow) {
            targetRow.classList.remove('drag-over');
        }
    });
}

async function saveNewOrder() {
    const rows = Array.from(document.querySelectorAll('#template-table tbody tr'));
    const newOrderIds = rows.map(row => row.dataset.id);

    // Reorder templates array
    const reordered = newOrderIds.map(id => templates.find(t => t.id === id)).filter(Boolean);
    templates = reordered;

    // Save to storage
    await WATemplates.saveTemplates(templates);
}

/**
 * RULES CRUD
 */
function renderRules() {
    const tbody = document.querySelector('#rule-table tbody');
    tbody.innerHTML = '';

    rules.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${r.keyword}</td>
      <td>${r.suggestedCategory}</td>
      <td>
        <button class="btn-secondary btn-sm edit-rule-btn" data-id="${r.id}">Edit</button>
        <button class="btn-danger btn-sm delete-rule-btn" data-id="${r.id}">Delete</button>
      </td>
    `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.delete-rule-btn').forEach(btn =>
        btn.addEventListener('click', () => deleteRule(btn.dataset.id))
    );
    tbody.querySelectorAll('.edit-rule-btn').forEach(btn =>
        btn.addEventListener('click', () => editRule(btn.dataset.id))
    );
}

async function deleteRule(id) {
    if (!confirm('Are you sure?')) return;
    rules = rules.filter(r => r.id !== id);
    await WATemplates.saveRules(rules);
    renderRules();
}

function editRule(id) {
    const r = rules.find(item => item.id === id);
    if (!r) return;

    document.getElementById('r-id').value = r.id;
    document.getElementById('r-keyword').value = r.keyword;
    document.getElementById('r-category').value = r.suggestedCategory;

    document.querySelector('#rule-form button[type="submit"]').textContent = 'Update Rule';
    document.getElementById('r-cancel').style.display = 'inline-block';
}

function resetRuleForm() {
    document.getElementById('rule-form').reset();
    document.getElementById('r-id').value = '';
    document.querySelector('#rule-form button[type="submit"]').textContent = 'Save Rule';
    document.getElementById('r-cancel').style.display = 'none';
}

/**
 * FORM HANDLING
 */
function setupForms() {
    // Template Form
    document.getElementById('template-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('t-id').value;
        const title = document.getElementById('t-title').value;
        const category = document.getElementById('t-category').value;
        const content = document.getElementById('t-content').value;

        let newItem = {
            id: id || WATemplates.generateId(),
            title,
            category,
            content
        };

        // Optimistic UI Update
        if (id) {
            const index = templates.findIndex(t => t.id === id);
            if (index !== -1) {
                templates[index] = newItem;
            }
        } else {
            templates.push(newItem);
        }

        renderTemplates();
        resetTemplateForm();

        // New Split Storage Save
        await WATemplates.saveTemplate(newItem);
    });

    document.getElementById('t-cancel').addEventListener('click', resetTemplateForm);

    // Rule Form
    document.getElementById('rule-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('r-id').value;
        const keyword = document.getElementById('r-keyword').value;
        const suggestedCategory = document.getElementById('r-category').value;

        if (id) {
            const index = rules.findIndex(r => r.id === id);
            if (index !== -1) {
                rules[index] = { id, keyword, suggestedCategory };
            }
        } else {
            rules.push({
                id: WATemplates.generateId(),
                keyword,
                suggestedCategory
            });
        }

        await WATemplates.saveRules(rules);
        resetRuleForm();
        renderRules();
    });

    document.getElementById('r-cancel').addEventListener('click', resetRuleForm);

    // Flow Form
    document.getElementById('flow-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('f-id').value;
        const name = document.getElementById('f-name').value;
        const templateId = document.getElementById('f-template-id').value;
        const jsonStr = document.getElementById('f-json').value;

        let flowData;
        try {
            flowData = JSON.parse(jsonStr);
        } catch (err) {
            alert("Invalid JSON: " + err.message);
            return;
        }

        // Validation
        const check = WATemplates.validateFlow(flowData);
        if (!check.valid) {
            alert("Flow validation failed: " + check.error);
            return;
        }

        if (id) {
            const index = flows.findIndex(f => f.id === id);
            if (index !== -1) {
                flows[index] = { ...flowData, id, name, templateId };
            }
        } else {
            flows.push({
                ...flowData,
                id: WATemplates.generateId(),
                name,
                templateId
            });
        }

        await WATemplates.saveFlows(flows);
        resetFlowForm();
        renderFlows();
    });

    document.getElementById('f-cancel').addEventListener('click', () => {
        resetFlowForm();
        renderFlowVisualEditor({});
    });
}

/**
 * FLOW VISUAL EDITOR
 */
let currentFlowData = { nodes: {}, startNode: '' };

function setupFlowVisualEditor() {
    const toggleLink = document.getElementById('toggle-json-link');
    const jsonContainer = document.getElementById('f-json-container');
    const addNodeBtn = document.getElementById('add-node-btn');
    const jsonTextarea = document.getElementById('f-json');

    toggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        const isHidden = jsonContainer.style.display === 'none' || jsonContainer.style.display === '';
        jsonContainer.style.display = isHidden ? 'block' : 'none';
        toggleLink.textContent = isHidden ? 'Hide Raw JSON' : 'Show Raw JSON (Advanced)';
    });

    addNodeBtn.addEventListener('click', () => {
        const nodeId = 'n_' + Date.now();
        currentFlowData.nodes[nodeId] = {
            type: 'draft',
            text: 'New Question',
            message: 'Hello, how can I help?',
            options: []
        };
        if (!currentFlowData.startNode) currentFlowData.startNode = nodeId;
        renderFlowVisualEditor(currentFlowData);
        syncToJSON();
    });

    jsonTextarea.addEventListener('input', () => {
        try {
            const data = JSON.parse(jsonTextarea.value);
            currentFlowData = data;
            renderFlowVisualEditor(currentFlowData, false);
        } catch (e) {
            // Ignore invalid JSON while typing
        }
    });
}

function renderFlowVisualEditor(flowData, updateJSON = true) {
    const container = document.getElementById('flow-visual-builder');
    container.innerHTML = '';
    currentFlowData = flowData || { nodes: {}, startNode: '' };

    if (updateJSON) syncToJSON();

    const nodeIds = Object.keys(currentFlowData.nodes || {});
    if (nodeIds.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:var(--secondary-text); padding:20px;">No nodes yet. Click "+ Add New Node" to start.</div>';
        return;
    }

    nodeIds.forEach(nodeId => {
        const node = currentFlowData.nodes[nodeId];
        const nodeCard = document.createElement('div');
        nodeCard.className = 'node-card';
        nodeCard.innerHTML = `
            <div class="node-header">
                <span class="node-id">${nodeId} ${currentFlowData.startNode === nodeId ? '(START)' : ''}</span>
                <div class="actions">
                    <button type="button" class="btn-secondary btn-sm set-start-btn" data-id="${nodeId}">Set as Start</button>
                    <button type="button" class="btn-danger btn-sm delete-node-btn" data-id="${nodeId}">Delete</button>
                </div>
            </div>
            <div class="form-group">
                <label>Admin Label / Question Name</label>
                <input type="text" class="node-text" value="${node.text || ''}" data-id="${nodeId}" placeholder="e.g. Greeting">
            </div>
            <div class="form-group">
                <label>Message to Draft (into WhatsApp UI)</label>
                <textarea class="node-message" data-id="${nodeId}" placeholder="The actual message user will see...">${node.message || ''}</textarea>
            </div>
            <div class="node-options-list" id="options-${nodeId}">
                <!-- Options will be rendered here -->
            </div>
            <button type="button" class="btn-secondary btn-sm add-option-btn" style="margin-top:10px;" data-id="${nodeId}">+ Add Option</button>
        `;

        container.appendChild(nodeCard);

        // Render Options
        const optionsList = nodeCard.querySelector(`#options-${nodeId}`);
        (node.options || []).forEach((opt, idx) => {
            const optItem = document.createElement('div');
            optItem.className = 'node-option-item';
            optItem.innerHTML = `
                <input type="text" class="opt-label" value="${opt.label || ''}" placeholder="Button Label" data-node="${nodeId}" data-idx="${idx}">
                <select class="opt-next" data-node="${nodeId}" data-idx="${idx}">
                    <option value="">End Flow</option>
                    ${nodeIds.map(id => `<option value="${id}" ${opt.next === id ? 'selected' : ''}>Go to ${id}</option>`).join('')}
                </select>
                <select class="opt-template" data-node="${nodeId}" data-idx="${idx}">
                    <option value="">No Template</option>
                    ${templates.map(t => `<option value="${t.id}" ${opt.templateId === t.id ? 'selected' : ''}>Tpl: ${t.title}</option>`).join('')}
                </select>
                <button type="button" class="btn-danger btn-sm delete-opt-btn" data-node="${nodeId}" data-idx="${idx}">×</button>
            `;
            optionsList.appendChild(optItem);
        });

        // Add Listeners for this node
        nodeCard.querySelector('.node-text').addEventListener('input', (e) => {
            currentFlowData.nodes[nodeId].text = e.target.value;
            syncToJSON();
        });
        nodeCard.querySelector('.node-message').addEventListener('input', (e) => {
            currentFlowData.nodes[nodeId].message = e.target.value;
            syncToJSON();
        });
        nodeCard.querySelector('.set-start-btn').addEventListener('click', () => {
            currentFlowData.startNode = nodeId;
            renderFlowVisualEditor(currentFlowData);
        });
        nodeCard.querySelector('.delete-node-btn').addEventListener('click', () => {
            if (confirm('Delete this node?')) {
                delete currentFlowData.nodes[nodeId];
                if (currentFlowData.startNode === nodeId) currentFlowData.startNode = Object.keys(currentFlowData.nodes)[0] || '';
                renderFlowVisualEditor(currentFlowData);
            }
        });
        nodeCard.querySelector('.add-option-btn').addEventListener('click', () => {
            if (!currentFlowData.nodes[nodeId].options) currentFlowData.nodes[nodeId].options = [];
            currentFlowData.nodes[nodeId].options.push({ label: 'Next Step', next: '' });
            renderFlowVisualEditor(currentFlowData);
        });

        // Option listeners
        nodeCard.querySelectorAll('.opt-label').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = e.target.dataset.idx;
                currentFlowData.nodes[nodeId].options[idx].label = e.target.value;
                syncToJSON();
            });
        });
        nodeCard.querySelectorAll('.opt-next').forEach(select => {
            select.addEventListener('change', (e) => {
                const idx = e.target.dataset.idx;
                currentFlowData.nodes[nodeId].options[idx].next = e.target.value;
                syncToJSON();
            });
        });
        nodeCard.querySelectorAll('.opt-template').forEach(select => {
            select.addEventListener('change', (e) => {
                const idx = e.target.dataset.idx;
                currentFlowData.nodes[nodeId].options[idx].templateId = e.target.value;
                syncToJSON();
            });
        });
        nodeCard.querySelectorAll('.delete-opt-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = btn.dataset.idx;
                currentFlowData.nodes[nodeId].options.splice(idx, 1);
                renderFlowVisualEditor(currentFlowData);
            });
        });
    });
}

function syncToJSON() {
    const jsonTextarea = document.getElementById('f-json');
    jsonTextarea.value = JSON.stringify(currentFlowData, null, 2);
}

/**
 * FLOWS CRUD
 */
function renderFlows() {
    const tbody = document.querySelector('#flow-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    flows.forEach(f => {
        const linkedTemplate = templates.find(t => t.id === f.templateId);
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td>${f.name}</td>
      <td>${linkedTemplate ? linkedTemplate.title : '<span style="color:#999;font-size:12px;">No Template</span>'}</td>
      <td>${f.startNode}</td>
      <td>${Object.keys(f.nodes || {}).length} nodes</td>
      <td>
        <button class="btn-secondary btn-sm edit-flow-btn" data-id="${f.id}">Edit</button>
        <button class="btn-danger btn-sm delete-flow-btn" data-id="${f.id}">Delete</button>
      </td>
    `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.delete-flow-btn').forEach(btn =>
        btn.addEventListener('click', () => deleteFlow(btn.dataset.id))
    );
    tbody.querySelectorAll('.edit-flow-btn').forEach(btn =>
        btn.addEventListener('click', () => editFlow(btn.dataset.id))
    );
}

async function deleteFlow(id) {
    if (!confirm('Are you sure?')) return;
    flows = flows.filter(f => f.id !== id);
    await WATemplates.saveFlows(flows);
    renderFlows();
}

function editFlow(id) {
    const f = flows.find(item => item.id === id);
    if (!f) return;

    document.getElementById('f-id').value = f.id;
    document.getElementById('f-name').value = f.name;
    document.getElementById('f-template-id').value = f.templateId || '';

    const displayObj = { ...f };
    delete displayObj.id;
    delete displayObj.name;

    document.getElementById('f-json').value = JSON.stringify(displayObj, null, 2);

    // Render Visual Editor
    renderFlowVisualEditor(displayObj);

    document.querySelector('#flow-form button[type="submit"]').textContent = 'Update Flow';
    document.getElementById('f-cancel').style.display = 'inline-block';
}

function resetFlowForm() {
    document.getElementById('flow-form').reset();
    document.getElementById('f-id').value = '';
    document.querySelector('#flow-form button[type="submit"]').textContent = 'Save Flow';
    document.getElementById('f-cancel').style.display = 'none';
}

/**
 * AI SETTINGS
 */
async function setupAISettings() {
    const apiKeyInput = document.getElementById('gemini-api-key');
    const saveBtn = document.getElementById('save-api-key-btn');
    const clearBtn = document.getElementById('clear-api-key-btn');
    const testBtn = document.getElementById('test-api-key-btn');

    // Load existing API key status
    await updateAPIKeyStatus();

    // Save API Key
    saveBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            alert('Please enter an API key');
            return;
        }

        // Basic validation - Gemini API keys start with "AIza"
        if (!apiKey.startsWith('AIza')) {
            const proceed = confirm('This doesn\'t look like a valid Google API key (should start with "AIza"). Save anyway?');
            if (!proceed) return;
        }

        try {
            await chrome.storage.sync.set({ gemini_api_key: apiKey });
            await updateAPIKeyStatus();
            apiKeyInput.value = ''; // Clear input for security
            alert('API key saved successfully!');
        } catch (error) {
            alert('Error saving API key: ' + error.message);
        }
    });

    // Clear API Key
    clearBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to remove the API key?')) return;

        try {
            await chrome.storage.sync.remove('gemini_api_key');
            await updateAPIKeyStatus();
            apiKeyInput.value = '';
            alert('API key removed successfully!');
        } catch (error) {
            alert('Error removing API key: ' + error.message);
        }
    });

    // Test API Key
    testBtn.addEventListener('click', async () => {
        const data = await chrome.storage.sync.get('gemini_api_key');
        const apiKey = data.gemini_api_key;

        if (!apiKey) {
            alert('No API key configured. Please save an API key first.');
            return;
        }

        testBtn.textContent = 'Testing...';
        testBtn.disabled = true;

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: 'Hello' }]
                        }]
                    })
                }
            );

            if (response.ok) {
                alert('✅ API key is valid and working!');
            } else {
                const error = await response.json();
                alert('❌ API key test failed: ' + (error.error?.message || 'Invalid API key'));
            }
        } catch (error) {
            alert('❌ Connection error: ' + error.message);
        } finally {
            testBtn.textContent = 'Test Connection';
            testBtn.disabled = false;
        }
    });
}

async function updateAPIKeyStatus() {
    const statusDiv = document.getElementById('api-key-status');
    const statusText = document.getElementById('status-text');

    const data = await chrome.storage.sync.get('gemini_api_key');
    const hasKey = !!data.gemini_api_key;

    if (hasKey) {
        statusDiv.style.backgroundColor = '#d4edda';
        statusDiv.style.color = '#155724';
        statusDiv.style.border = '1px solid #c3e6cb';
        statusText.textContent = '✅ API key configured';
    } else {
        statusDiv.style.backgroundColor = '#fff3cd';
        statusDiv.style.color = '#856404';
        statusDiv.style.border = '1px solid #ffeaa7';
        statusText.textContent = '⚠️ No API key configured';
    }
}
