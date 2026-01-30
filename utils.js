/**
 * WhatsApp Template Extension - Utils
 * Shared helper functions for storage and data management.
 */

const WATemplates = {
  // Default Data for Initialization (General Preset)
  DEFAULTS: {
    templates: [
      {
        id: "t1",
        title: "Greeting",
        category: "General",
        content: `Hello! Thank you for reaching out. How can I help you today? 😊`
      },
      {
        id: "t2",
        title: "Quick Response",
        category: "General",
        content: `I've received your message and will get back to you as soon as possible. Thank you for your patience! 🙏`
      },
      {
        id: "t3",
        title: "Closing",
        category: "General",
        content: `I hope that helps! If you have any other questions, feel free to ask. Have a great day! 😊`
      },
      {
        id: "t4",
        title: "Away Message",
        category: "General",
        content: `Hello! I'm currently away from my desk, but I'll reply to your message as soon as I'm back. Thank you! 🕒`
      }
    ],
    rules: [
      {
        id: "r1",
        keyword: "hello",
        suggestedCategory: "General"
      },
      {
        id: "r2",
        keyword: "help",
        suggestedCategory: "General"
      }
    ],
    settings: {
      autoSuggest: true
    },
    flows: [
      {
        id: "f_general",
        name: "General Inquiry",
        startNode: "welcome",
        nodes: {
          "welcome": {
            type: "draft",
            message: "Hello! Thank you for contacting us. How can we assist you today?\n\n1. Pricing\n2. Support\n3. Other",
            expectReply: true,
            nextMap: {
              "1": "pricing",
              "2": "support",
              "3": "other"
            }
          },
          "pricing": {
            type: "draft",
            message: "You can find our current pricing on our website or I can send you a quote. Which would you prefer?",
            expectReply: true
          },
          "support": {
            type: "draft",
            message: "Please describe the issue you're facing so our technical team can assist you.",
            expectReply: true
          },
          "other": {
            type: "draft",
            message: "Please let us know how we can help and we'll get back to you shortly.",
            expectReply: true
          }
        }
      }
    ]
  },

  /**
   * Initialize storage with defaults if empty, or merge missing defaults
   * Includes migration from sync -> local
   * AND migration from Monolithic Templates -> Split Keys
   */
  initStorage: async () => {
    // 1. Check local storage
    const localData = await chrome.storage.local.get(null); // Get all to check for keys

    // A. Migration: Sync -> Local (Legacy) - Skipped for simplicity in this repair

    // B. Migration: Monolithic -> Split Keys
    if (localData.templates && Array.isArray(localData.templates)) {
      console.log('WA Extension: Migrating monolithic templates to split keys...');
      const updates = {};
      localData.templates.forEach(t => {
        if (t.id) updates[`tpl_${t.id}`] = t;
      });

      await chrome.storage.local.set(updates);
      await chrome.storage.local.remove('templates');
      console.log('WA Extension: Migration to split keys complete.');
    }

    // C. Defaults
    const allKeys = await chrome.storage.local.get(null);
    const templateKeys = Object.keys(allKeys).filter(k => k.startsWith('tpl_'));

    if (templateKeys.length === 0 && !allKeys.templates) {
      const defaultUpdates = {};
      WATemplates.DEFAULTS.templates.forEach(t => {
        defaultUpdates[`tpl_${t.id}`] = t;
      });
      await chrome.storage.local.set(defaultUpdates);
    }

    // Rules / Flows Defaults
    const existingRules = await chrome.storage.local.get('rules');
    if (!existingRules.rules) {
      await chrome.storage.local.set({ rules: WATemplates.DEFAULTS.rules });
    }

    const existingFlows = await chrome.storage.local.get('flows');
    if (!existingFlows.flows) {
      await chrome.storage.local.set({ flows: WATemplates.DEFAULTS.flows });
    } else {
      const currentFlows = existingFlows.flows;
      const existingIds = new Set(currentFlows.map(f => f.id));
      const newDefaults = WATemplates.DEFAULTS.flows.filter(f => !existingIds.has(f.id));
      if (newDefaults.length > 0) {
        await chrome.storage.local.set({ flows: [...currentFlows, ...newDefaults] });
      }
    }
  },

  /**
   * Get all templates (Split Key)
   * @returns {Promise<Array>}
   */
  getTemplates: async () => {
    const allData = await chrome.storage.local.get(null);
    const orderData = await chrome.storage.local.get('template_order');
    const order = orderData.template_order || [];

    // Get all split templates
    const templatesMap = {};
    Object.keys(allData)
      .filter(key => key.startsWith('tpl_'))
      .forEach(key => {
        templatesMap[allData[key].id] = allData[key];
      });

    // Sort according to order, Append any missing ones at the end
    const orderedTemplates = [];
    order.forEach(id => {
      if (templatesMap[id]) {
        orderedTemplates.push(templatesMap[id]);
        delete templatesMap[id];
      }
    });

    // Add remaining templates (e.g. if order was lost or new templates added)
    Object.values(templatesMap).forEach(t => orderedTemplates.push(t));

    return orderedTemplates;
  },

  /**
   * Save a single template (New)
   * @param {Object} template 
   */
  saveTemplate: async (template) => {
    if (!template.id) template.id = WATemplates.generateId();
    await chrome.storage.local.set({ [`tpl_${template.id}`]: template });
  },

  /**
   * Delete a single template (New)
   * @param {String} id
   */
  deleteTemplate: async (id) => {
    await chrome.storage.local.remove(`tpl_${id}`);
  },

  /**
   * Save all templates (Deprecated/Legacy Support)
   * @param {Array} templates 
   */
  saveTemplates: async (templates) => {
    const updates = {};
    const order = [];

    templates.forEach(t => {
      updates[`tpl_${t.id}`] = t;
      order.push(t.id);
    });

    await chrome.storage.local.set(updates);
    await chrome.storage.local.set({ 'template_order': order });
  },

  /**
   * Get all rules
   * @returns {Promise<Array>}
   */
  getRules: async () => {
    const result = await chrome.storage.local.get('rules');
    return result.rules || [];
  },

  /**
   * Save rules
   * @param {Array} rules 
   */
  saveRules: async (rules) => {
    await chrome.storage.local.set({ rules });
  },

  /**
   * Get all flows
   * @returns {Promise<Array>}
   */
  getFlows: async () => {
    const result = await chrome.storage.local.get('flows');
    return result.flows || [];
  },

  /**
   * Save flows
   * @param {Array} flows 
   */
  saveFlows: async (flows) => {
    await chrome.storage.local.set({ flows });
  },

  /**
   * Validate a flow definition structure
   * @param {Object} flow 
   * @returns {Object} { valid: boolean, error: string }
   */
  validateFlow: (flow) => {
    if (!flow.startNode) return { valid: false, error: "Missing startNode" };
    if (!flow.nodes || Object.keys(flow.nodes).length === 0) return { valid: false, error: "No nodes defined" };

    // Basic connectivity check (DFS)
    const visited = new Set();
    const stack = [flow.startNode];

    while (stack.length > 0) {
      const nodeId = stack.pop();
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = flow.nodes[nodeId];
      if (!node) return { valid: false, error: `Node '${nodeId}' not found` };

      if (node.options) {
        for (const opt of node.options) {
          if (opt.next) {
            stack.push(opt.next);
          }
        }
      }
    }

    return { valid: true };
  },

  /**
   * Generate a unique ID
   */
  generateId: () => {
    return 'id_' + Math.random().toString(36).substr(2, 9);
  },

  /**
   * Replace variables in text
   * @param {String} text 
   * @param {Object} contextMap - e.g. { customer_name: "John" }
   */
  formatText: (text, contextMap = {}) => {
    if (!text) return '';
    let formatted = text
      .replace(/\\n/g, '\n')
      .replace(/\/n/g, '\n');

    for (const [key, value] of Object.entries(contextMap)) {
      formatted = formatted.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
    }
    return formatted;
  },

  /**
   * Export all data to a single JSON object
   * @returns {Promise<Object>}
   */
  exportData: async () => {
    const templates = await WATemplates.getTemplates();
    const rules = await WATemplates.getRules();
    const flows = await WATemplates.getFlows();
    return {
      version: 1,
      timestamp: new Date().toISOString(),
      templates,
      rules,
      flows
    };
  },

  /**
   * Import data from a JSON object
   * @param {Object} data 
   */
  importData: async (data) => {
    if (!data) throw new Error("No data provided");

    // 1. Templates
    if (data.templates && Array.isArray(data.templates)) {
      await WATemplates.saveTemplates(data.templates);
    }

    // 2. Rules
    if (data.rules && Array.isArray(data.rules)) {
      await WATemplates.saveRules(data.rules);
    }

    // 3. Flows
    if (data.flows && Array.isArray(data.flows)) {
      await WATemplates.saveFlows(data.flows);
    }
  },

  /**
   * Reset all data to defaults
   */
  resetToDefaults: async () => {
    const allData = await chrome.storage.local.get(null);
    const keysToRemove = Object.keys(allData).filter(k => k.startsWith('tpl_') || k === 'rules' || k === 'flows');
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
    // Re-initialize with defaults
    await WATemplates.initStorage();
  }
};

// Make available in global scope (for content scripts/background without modules)
if (typeof self !== 'undefined') {
  self.WATemplates = WATemplates;
} else if (typeof window !== 'undefined') {
  window.WATemplates = WATemplates;
}
