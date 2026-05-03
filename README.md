# Dirtmap

## Network Contagion Analysis

Dirtmap maps leverage and influence relationships across networks and tracks their propagation. The platform quantifies exposure, visualizes spreading chains of compromise, and maintains a leaderboard ranking the most connected and most vulnerable nodes.

### Overview

Dirtmap converts relationship data into a directed graph where edges represent leverage and nodes represent individuals. As the network evolves, the system tracks how exposure propagates through chains of influence and ranks nodes by their position in these contagion pathways.

### Capabilities

- **Graph Visualization** — Render directed leverage relationships using force-directed layout. Nodes represent individuals; edges represent asymmetric influence or exposure.

- **Propagation Tracking** — Observe how leverage spreads through multi-hop chains. Identify secondary and tertiary exposure as relationships compound.

- **Leaderboard Metrics** — Rank nodes by:
  - Total leverage held (out-degree in the leverage graph)
  - Total exposure received (in-degree)
  - Centrality and propagation potential
  - Changes in rank as the network evolves

- **Node Inspection** — Select any individual to view incoming and outgoing leverage relationships with full attribution.

- **Edge Tracing** — Select any directed edge to highlight its source node and the specific leverage relationship that defines it.

- **AI Analysis** — Query an LLM assistant trained on the current graph state to identify high-leverage nodes, predict propagation paths, and simulate cascade scenarios.

- **Scenario Forecasting** — Use the AI model to identify which exposed relationships, if triggered, would produce the widest propagation through the network.

- **Navigation** — Zoom and pan controls for exploring dense networks. Depth controls limit display to immediate neighborhoods or expand to full propagation chains.

---

## Quick Start

### Prerequisites

An OpenRouter API key is required for AI analysis features. Register at [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys).

### Installation

```bash
# Install dependencies
npm install

# Configure API key
echo "OPENROUTER_API_KEY=your_key_here" > .env
echo "VITE_SITE_URL=http://localhost:5173" >> .env

# Start the application
npm run dev
```

Application endpoints:
- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:3001

### Alternative Startup

```bash
npm run dev:frontend   # Vite dev server on :5173
npm run dev:server     # Express backend on :3001
```

---

## Technical Details

### Architecture

- **Frontend:** React 19, TypeScript, Vite, Cytoscape.js for graph rendering
- **Backend:** Express, TypeScript, `@openrouter/sdk` for AI integration
- **AI Provider:** OpenRouter API (default model: `openrouter/owl-alpha`)
- **State Management:** React Context for graph state and viewport state

### Project Structure

```
server/
  index.ts              # Express backend — OpenRouter proxy, SSE streaming
src/
  components/
    AIChat.tsx          # LLM chat interface with reasoning tokens
    LeftSidebar.tsx     # Node list, controls, leaderboard
    NetworkGraph.tsx    # Cytoscape.js visualization
    RightPanel.tsx      # Node detail and edge inspector
    TopNavBar.tsx       # Title, depth controls
    ZoomControls.tsx    # Zoom and pan controls
  data/
    mockData.ts         # Sample node and edge data
  hooks/
    useAIChat.ts        # Chat state and streaming handler
  services/
    ai.ts               # OpenRouter SSE parser
  store/
    NetworkContext.tsx  # Graph state, CRUD operations
    ZoomContext.tsx     # Viewport state management
  types/
    index.ts            # Shared TypeScript interfaces
  utils/
    parseCategories.ts  # Category parsing utilities
```

### Configuration

Create `.env` in the project root:

```bash
OPENROUTER_API_KEY=your_key_here
VITE_SITE_URL=http://localhost:5173
```
