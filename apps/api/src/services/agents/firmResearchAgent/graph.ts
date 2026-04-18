// apps/api/src/services/agents/firmResearchAgent/graph.ts
import { StateGraph, START, END } from '@langchain/langgraph';
import { FirmResearchState } from './state.js';
import { scrapeNode } from './nodes/scrape.js';
import { searchFirmNode } from './nodes/searchFirm.js';
import { searchPersonNode } from './nodes/searchPerson.js';
import { synthesizeNode } from './nodes/synthesize.js';
import { verifyNode } from './nodes/verify.js';
import { saveNode } from './nodes/save.js';

function buildFirmResearchGraph() {
  const graph = new StateGraph(FirmResearchState)
    .addNode('scrape', scrapeNode)
    .addNode('searchFirm', searchFirmNode)
    .addNode('searchPerson', searchPersonNode)
    .addNode('synthesize', synthesizeNode)
    .addNode('verify', verifyNode)
    .addNode('save', saveNode)
    .addEdge(START, 'scrape')
    .addEdge('scrape', 'searchFirm')
    .addEdge('searchFirm', 'searchPerson')
    .addEdge('searchPerson', 'synthesize')
    .addEdge('synthesize', 'verify')
    .addEdge('verify', 'save')
    .addEdge('save', END);

  return graph.compile();
}

let _compiledGraph: ReturnType<typeof buildFirmResearchGraph> | null = null;

export function getFirmResearchGraph() {
  if (!_compiledGraph) {
    _compiledGraph = buildFirmResearchGraph();
  }
  return _compiledGraph;
}
