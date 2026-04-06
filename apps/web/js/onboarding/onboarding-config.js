/**
 * PE OS — Onboarding Configuration
 *
 * ALL onboarding text, steps, and settings live here.
 * Edit this file to change onboarding content without touching component logic.
 */

window.ONBOARDING_CONFIG = {
    // ==========================================
    // Welcome Modal (shown on first login)
    // ==========================================
    welcome: {
        title: 'Welcome to PE OS',
        subtitle: 'Your AI-powered private equity operating system',
        steps: [
            {
                icon: 'upload_file',
                title: 'Upload a CIM',
                description: 'Drop a Confidential Information Memorandum and watch AI extract financials in seconds.'
            },
            {
                icon: 'smart_toy',
                title: 'Chat with Your Deals',
                description: 'Ask questions about any deal — financials, risks, comparisons — all in natural language.'
            },
            {
                icon: 'group_add',
                title: 'Collaborate with Your Team',
                description: 'Invite analysts and partners to shared deal rooms with full data isolation.'
            }
        ],
        ctaText: 'Get Started',
        ctaHref: '/crm.html',
        videoDemoUrl: null, // Set to Loom URL when ready, e.g. 'https://www.loom.com/embed/...'
    },

    // ==========================================
    // Onboarding Checklist (persistent on dashboard)
    // ==========================================
    checklist: {
        title: 'Getting Started',
        subtitle: 'Complete these steps to get the most out of PE OS',
        steps: [
            {
                id: 'createDeal',
                label: 'Create your first deal',
                href: '/crm.html',
                icon: 'add_circle',
                description: 'Set up a deal to start tracking it through your pipeline'
            },
            {
                id: 'uploadDocument',
                label: 'Upload a CIM or financial document',
                href: null, // navigates to deal page
                icon: 'upload_file',
                description: 'Upload a PDF or Excel file to the Data Room'
            },
            {
                id: 'reviewExtraction',
                label: 'Review AI-extracted financials',
                href: null,
                icon: 'fact_check',
                description: 'See how AI reads your documents and builds financial tables'
            },
            {
                id: 'tryDealChat',
                label: 'Try Deal Chat',
                href: null,
                icon: 'smart_toy',
                description: 'Ask a question about your deal in natural language'
            },
            {
                id: 'inviteTeamMember',
                label: 'Invite a team member',
                href: '/settings.html#invite',
                icon: 'person_add',
                description: 'Add an analyst or partner to your organization'
            }
        ]
    },

    // ==========================================
    // Empty States (shown when no data exists)
    // ==========================================
    emptyStates: {
        dashboard: {
            icon: 'dashboard',
            title: 'Your Dashboard',
            message: 'Create your first deal to see pipeline metrics, AI insights, and team activity here.',
            ctaText: 'Create a Deal',
            ctaHref: '/crm.html'
        },
        deals: {
            icon: 'work',
            title: 'No Deals Yet',
            message: 'Start building your pipeline. Upload a CIM or create a deal manually.',
            ctaText: 'Create First Deal',
            ctaAction: 'openDealIntake'
        },
        contacts: {
            icon: 'groups',
            title: 'No Contacts Yet',
            message: 'Add contacts to track relationships, interaction history, and deal involvement.',
            ctaText: 'Add Contact',
            ctaAction: 'openAddContact'
        },
        templates: {
            icon: 'description',
            title: 'No Templates Yet',
            message: 'Create a reusable memo template to speed up your investment committee process.',
            ctaText: 'Create Template',
            ctaAction: 'createFirstTemplate'
        }
    },

    // ==========================================
    // Feedback Button (fixed bottom-right)
    // ==========================================
    feedback: {
        buttonText: 'Feedback',
        buttonIcon: 'rate_review',
        formUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSet_GfebuKpdspK7aQ8yAFUF_l5yXeFczBRoKauGEg2GlpS5g/viewform',
        show: true,
    },

    // ==========================================
    // Beta Badge (in sidebar)
    // ==========================================
    betaBadge: {
        text: 'BETA',
        show: true,
    },
};
