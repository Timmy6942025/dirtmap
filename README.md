# Dirtmap

A React + TypeScript network visualization tool with an AI-powered chat assistant. Explore leverage relationships between people through an interactive Cytoscape graph, and use AI to analyze connections and suggest new ones.

## Features

- **Interactive Network Graph** — Visualize people and their leverage relationships using Cytoscape with force-directed layout
- **AI Chat Assistant** — Powered by OpenRouter (via the official `@openrouter/sdk`), with streaming responses and reasoning token display
- **Smart Connection Analysis** — AI can analyze the graph and suggest new connections based on existing relationships
- **Detailed Person Profiles** — Click any node to see full leverage entries (outgoing and incoming) in the right panel
- **Edge Inspector** — Click any connector to highlight the source person and their relevant leverage entry
- **Zoom & Pan Controls** — Navigate large graphs with dedicated zoom buttons and mousewheel support

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Cytoscape
- **Backend:** Express, TypeScript, `@openrouter/sdk`
- **AI:** OpenRouter API (model: `openrouter/owl-alpha`)

## Development

```bash
# Install dependencies
npm install

# Start both frontend and backend dev servers
npm run dev

# Or start them separately
npm run dev:frontend   # Vite on :5173
npm run dev:server     # Express on :3001
```

## Configuration

Create a `.env` file in the project root:

```
OPENROUTER_API_KEY=your_key_here
VITE_SITE_URL=http://localhost:5173
```

Get an API key at [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys).

## Project Structure

```
server/
  index.ts              # Express backend — OpenRouter SDK proxy
src/
  components/
    AIChat.tsx          # AI chat panel with reasoning display
    LeftSidebar.tsx     # Person list and graph controls
    NetworkGraph.tsx    # Cytoscape graph visualization
    RightPanel.tsx      # Person detail / leverage inspector
    TopNavBar.tsx       # Header with title and depth controls
    ZoomControls.tsx    # Zoom in/out/reset buttons
  data/
    mockData.ts         # Sample people and leverage data
  hooks/
    useAIChat.ts        # Chat state management + streaming
  services/
    ai.ts               # SSE stream parser for OpenRouter
  store/
    NetworkContext.tsx  # Graph state and CRUD operations
    ZoomContext.tsx     # Zoom/pan state
  types/
    index.ts            # Shared TypeScript interfaces
  utils/
    parseCategories.ts  # Category string parsing utilities
```
