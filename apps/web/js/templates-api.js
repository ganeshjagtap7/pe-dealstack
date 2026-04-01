/**
 * PE OS - Template Manager: API Layer & Sample Data
 * Handles all template/section API calls and provides fallback sample templates.
 * Globals: SAMPLE_TEMPLATES, fetchTemplates, createTemplateAPI, updateTemplateAPI,
 *          deleteTemplateAPI, addSectionAPI, updateSectionAPI, deleteSectionAPI,
 *          reorderSectionsAPI
 */

// Sample templates for fallback when API is not available
const SAMPLE_TEMPLATES = [
    {
        id: 'sample-1',
        name: 'SaaS LBO Standard Memo',
        description: 'Standardized investment committee memorandum for Series B+ SaaS companies.',
        category: 'INVESTMENT_MEMO',
        isGoldStandard: true,
        isLegacy: false,
        isActive: true,
        usageCount: 142,
        createdAt: '2023-10-24',
        sections: [
            { id: 's1', title: 'Executive Summary', description: 'High-level overview of the investment opportunity.', aiEnabled: true, mandatory: true, aiPrompt: '', sortOrder: 0 },
            { id: 's2', title: 'Business Overview', description: 'Company background, products, and market position.', aiEnabled: true, mandatory: true, aiPrompt: 'Summarize the CIM provided by the target, focusing on ARR growth, net retention, and customer churn analysis.', sortOrder: 1 },
            { id: 's3', title: 'Market Analysis', description: 'TAM/SAM/SOM breakdown and competitive landscape.', aiEnabled: true, mandatory: false, aiPrompt: '', sortOrder: 2 },
            { id: 's4', title: 'Financial Performance', description: 'Historical financials and key metrics.', aiEnabled: true, mandatory: true, aiPrompt: '', sortOrder: 3 },
            { id: 's5', title: 'Risk Assessment', description: 'Key risks and mitigating factors.', aiEnabled: false, mandatory: true, aiPrompt: '', sortOrder: 4 },
        ],
        permissions: 'FIRM_WIDE'
    },
    {
        id: 'sample-2',
        name: 'Healthcare Services Bolt-on',
        description: 'Short-form memo template for add-on acquisitions under $50M EV.',
        category: 'INVESTMENT_MEMO',
        isGoldStandard: false,
        isLegacy: false,
        isActive: true,
        usageCount: 89,
        createdAt: '2023-09-12',
        sections: [
            { id: 's6', title: 'Executive Summary', description: 'Overview of the add-on opportunity.', aiEnabled: true, mandatory: true, aiPrompt: '', sortOrder: 0 },
            { id: 's7', title: 'Strategic Rationale', description: 'Synergies and integration plan.', aiEnabled: true, mandatory: true, aiPrompt: '', sortOrder: 1 },
            { id: 's8', title: 'Valuation', description: 'Purchase price and deal terms.', aiEnabled: false, mandatory: true, aiPrompt: '', sortOrder: 2 },
        ],
        permissions: 'FIRM_WIDE'
    },
    {
        id: 'sample-3',
        name: 'Consumer Growth Equity',
        description: 'Focus on D2C metrics, CAC/LTV analysis, and brand sentiment.',
        category: 'INVESTMENT_MEMO',
        isGoldStandard: false,
        isLegacy: false,
        isActive: true,
        usageCount: 56,
        createdAt: '2023-11-02',
        sections: [
            { id: 's9', title: 'Executive Summary', description: 'Investment thesis summary.', aiEnabled: true, mandatory: true, aiPrompt: '', sortOrder: 0 },
            { id: 's10', title: 'Brand Analysis', description: 'Brand positioning and customer sentiment.', aiEnabled: true, mandatory: true, aiPrompt: '', sortOrder: 1 },
            { id: 's11', title: 'Unit Economics', description: 'CAC, LTV, and cohort analysis.', aiEnabled: true, mandatory: true, aiPrompt: '', sortOrder: 2 },
        ],
        permissions: 'FIRM_WIDE'
    },
    {
        id: 'sample-4',
        name: 'Distressed Asset IC',
        description: 'Turnaround strategy outline including debt restructuring proposals.',
        category: 'INVESTMENT_MEMO',
        isGoldStandard: false,
        isLegacy: true,
        isActive: true,
        usageCount: 23,
        createdAt: '2023-06-15',
        sections: [
            { id: 's12', title: 'Situation Overview', description: 'Current state of the asset.', aiEnabled: false, mandatory: true, aiPrompt: '', sortOrder: 0 },
            { id: 's13', title: 'Turnaround Plan', description: 'Operational and financial restructuring.', aiEnabled: false, mandatory: true, aiPrompt: '', sortOrder: 1 },
        ],
        permissions: 'PARTNERS_ONLY'
    },
    {
        id: 'sample-5',
        name: 'Infra / Energy Transition',
        description: 'Focus on CAPEX requirements, regulatory approvals, and long-term yield.',
        category: 'INVESTMENT_MEMO',
        isGoldStandard: false,
        isLegacy: false,
        isActive: true,
        usageCount: 41,
        createdAt: '2023-08-30',
        sections: [
            { id: 's14', title: 'Project Overview', description: 'Infrastructure asset summary.', aiEnabled: true, mandatory: true, aiPrompt: '', sortOrder: 0 },
            { id: 's15', title: 'Regulatory Analysis', description: 'Permits, approvals, and compliance.', aiEnabled: false, mandatory: true, aiPrompt: '', sortOrder: 1 },
            { id: 's16', title: 'Financial Model', description: 'Cash flow projections and returns.', aiEnabled: true, mandatory: true, aiPrompt: '', sortOrder: 2 },
        ],
        permissions: 'FIRM_WIDE'
    }
];

// ============================================================
// API Functions
// ============================================================

async function fetchTemplates() {
    try {
        const response = await PEAuth.authFetch(`${API_BASE}/templates`);
        if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                return data;
            }
            console.info('Templates API returned empty list');
            return [];
        }
        throw new Error('Failed to fetch templates');
    } catch (error) {
        console.warn('Could not fetch templates from API:', error);
        return [];
    }
}

async function createTemplateAPI(templateData) {
    try {
        const response = await PEAuth.authFetch(`${API_BASE}/templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(templateData)
        });
        if (response.ok) {
            return await response.json();
        }
        throw new Error('Failed to create template');
    } catch (error) {
        console.error('Error creating template:', error);
        return null;
    }
}

async function updateTemplateAPI(templateId, updateData) {
    try {
        const response = await PEAuth.authFetch(`${API_BASE}/templates/${templateId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        if (response.ok) {
            return await response.json();
        }
        throw new Error('Failed to update template');
    } catch (error) {
        console.error('Error updating template:', error);
        return null;
    }
}

async function deleteTemplateAPI(templateId) {
    try {
        const response = await PEAuth.authFetch(`${API_BASE}/templates/${templateId}`, {
            method: 'DELETE'
        });
        return response.ok;
    } catch (error) {
        console.error('Error deleting template:', error);
        return false;
    }
}

async function addSectionAPI(templateId, sectionData) {
    try {
        const response = await PEAuth.authFetch(`${API_BASE}/templates/${templateId}/sections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sectionData)
        });
        if (response.ok) {
            return await response.json();
        }
        throw new Error('Failed to add section');
    } catch (error) {
        console.error('Error adding section:', error);
        return null;
    }
}

async function updateSectionAPI(templateId, sectionId, updateData) {
    try {
        const response = await PEAuth.authFetch(`${API_BASE}/templates/${templateId}/sections/${sectionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        if (response.ok) {
            return await response.json();
        }
        throw new Error('Failed to update section');
    } catch (error) {
        console.error('Error updating section:', error);
        return null;
    }
}

async function deleteSectionAPI(templateId, sectionId) {
    try {
        const response = await PEAuth.authFetch(`${API_BASE}/templates/${templateId}/sections/${sectionId}`, {
            method: 'DELETE'
        });
        return response.ok;
    } catch (error) {
        console.error('Error deleting section:', error);
        return false;
    }
}

async function reorderSectionsAPI(templateId, sections) {
    try {
        const response = await PEAuth.authFetch(`${API_BASE}/templates/${templateId}/sections/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sections })
        });
        if (response.ok) {
            return await response.json();
        }
        throw new Error('Failed to reorder sections');
    } catch (error) {
        console.error('Error reordering sections:', error);
        return null;
    }
}
