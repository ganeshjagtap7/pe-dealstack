/**
 * deal-chat-responses.js — Mock/fallback AI response generator for Deal Chat
 * Extracted from deal-chat.js. Must be loaded BEFORE deal-chat.js.
 * Depends on: state (global from deal.js), formatCurrency, escapeHtml, getStageLabel
 */

function generateAIResponse(userMessage) {
    const lowerMessage = userMessage.toLowerCase();
    const deal = state.dealData;
    const dealName = deal?.name || 'this deal';
    const revenue = deal?.revenue ? formatCurrency(deal.revenue) : '$120M';
    const ebitda = deal?.ebitda ? formatCurrency(deal.ebitda) : '$26M';
    const dealSize = deal?.dealSize ? formatCurrency(deal.dealSize) : '$450M';
    const irr = deal?.irrProjected ? deal.irrProjected.toFixed(1) + '%' : '24%';
    const mom = deal?.mom ? deal.mom.toFixed(1) + 'x' : '3.5x';
    const stage = deal?.stage ? getStageLabel(deal.stage) : 'Due Diligence';
    const industry = deal?.industry || 'Technology';
    const thesis = deal?.aiThesis || 'Strong fundamentals with growth potential.';

    // Keyword-based responses with real data
    if (lowerMessage.includes('risk') || lowerMessage.includes('concern')) {
        return `
            <p class="leading-relaxed">Based on the analysis of <strong>${dealName}</strong>, here are the key risk factors:</p>
            <div class="my-3 bg-white rounded-lg p-3 border border-slate-200 border-l-4 border-l-amber-500 shadow-sm">
                <p class="font-bold text-slate-900 mb-1">Key Risk Factors:</p>
                <ul class="space-y-2 text-slate-600">
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0"></span>
                        <span><strong>Market Position:</strong> Competitive pressure in ${industry} sector</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0"></span>
                        <span><strong>Valuation:</strong> ${dealSize} ask price requires validation</span>
                    </li>
                </ul>
            </div>
            <p>The projected IRR of <strong>${irr}</strong> and MoM of <strong>${mom}</strong> suggest ${deal?.irrProjected > 20 ? 'attractive returns if risks are mitigated' : 'moderate return potential'}.</p>
        `;
    } else if (lowerMessage.includes('valuation') || lowerMessage.includes('price') || lowerMessage.includes('multiple')) {
        const evEbitda = deal?.dealSize && deal?.ebitda ? (deal.dealSize / deal.ebitda).toFixed(1) : '17';
        const revMultiple = deal?.dealSize && deal?.revenue ? (deal.dealSize / deal.revenue).toFixed(2) : '3.75';
        return `
            <p class="leading-relaxed">Valuation analysis for <strong>${dealName}</strong>:</p>
            <div class="my-3 bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                <p class="font-bold text-slate-900 mb-2">Valuation Metrics:</p>
                <div class="grid grid-cols-2 gap-3 text-sm">
                    <div class="bg-slate-50 p-2 rounded">
                        <div class="text-xs text-slate-500">Deal Size</div>
                        <div class="font-bold text-primary">${dealSize}</div>
                    </div>
                    <div class="bg-slate-50 p-2 rounded">
                        <div class="text-xs text-slate-500">EV/EBITDA</div>
                        <div class="font-bold text-slate-900">~${evEbitda}x</div>
                    </div>
                    <div class="bg-slate-50 p-2 rounded">
                        <div class="text-xs text-slate-500">Revenue Multiple</div>
                        <div class="font-bold text-slate-900">${revMultiple}x</div>
                    </div>
                    <div class="bg-slate-50 p-2 rounded">
                        <div class="text-xs text-slate-500">Projected IRR</div>
                        <div class="font-bold text-slate-900">${irr}</div>
                    </div>
                </div>
            </div>
            <p>Based on the ${industry} sector, this valuation ${parseFloat(evEbitda) > 15 ? 'represents a premium' : 'appears reasonable'}.</p>
        `;
    } else if (lowerMessage.includes('revenue') || lowerMessage.includes('growth') || lowerMessage.includes('financial')) {
        const ebitdaMargin = deal?.revenue && deal?.ebitda ? ((deal.ebitda / deal.revenue) * 100).toFixed(0) : '22';
        return `
            <p class="leading-relaxed">Financial overview for <strong>${dealName}</strong>:</p>
            <div class="my-3 bg-white rounded-lg p-3 border border-slate-200 border-l-4 border-l-emerald-500 shadow-sm">
                <p class="font-bold text-slate-900 mb-1">Financial Metrics:</p>
                <ul class="space-y-2 text-slate-600">
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"></span>
                        <span>Revenue: <strong>${revenue}</strong></span>
                    </li>
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"></span>
                        <span>EBITDA: <strong>${ebitda}</strong> (${ebitdaMargin}% margin)</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0"></span>
                        <span>MoM Multiple: <strong>${mom}</strong></span>
                    </li>
                </ul>
            </div>
            <p>The company operates in the <strong>${industry}</strong> sector with ${deal?.ebitda > 0 ? 'positive profitability' : 'growth-stage economics'}.</p>
        `;
    } else if (lowerMessage.includes('thesis') || lowerMessage.includes('summary') || lowerMessage.includes('overview')) {
        return `
            <p class="leading-relaxed">Investment thesis for <strong>${dealName}</strong>:</p>
            <div class="my-3 bg-white rounded-lg p-3 border border-slate-200 border-l-4 border-l-purple-500 shadow-sm">
                <p class="font-bold text-slate-900 mb-1">AI-Generated Thesis:</p>
                <p class="text-slate-600">${thesis}</p>
            </div>
            <div class="my-3 bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                <p class="font-bold text-slate-900 mb-2">Quick Facts:</p>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div><span class="text-slate-500">Stage:</span> <strong>${stage}</strong></div>
                    <div><span class="text-slate-500">Industry:</span> <strong>${industry}</strong></div>
                    <div><span class="text-slate-500">Deal Size:</span> <strong>${dealSize}</strong></div>
                    <div><span class="text-slate-500">IRR:</span> <strong>${irr}</strong></div>
                </div>
            </div>
        `;
    } else {
        // Generic helpful response with real data
        return `
            <p class="leading-relaxed">Here's what I know about <strong>${dealName}</strong>:</p>
            <div class="my-3 bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                <p class="font-bold text-slate-900 mb-2">Deal Overview:</p>
                <ul class="space-y-2 text-slate-600 text-sm">
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></span>
                        <span><strong>Stage:</strong> ${stage} | <strong>Industry:</strong> ${industry}</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></span>
                        <span><strong>Financials:</strong> ${revenue} revenue, ${ebitda} EBITDA</span>
                    </li>
                    <li class="flex items-start gap-2">
                        <span class="size-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></span>
                        <span><strong>Returns:</strong> ${irr} projected IRR, ${mom} MoM</span>
                    </li>
                </ul>
            </div>
            <p>Try asking about <em>risks, valuation, financials, or thesis</em> for more details.</p>
        `;
    }
}
