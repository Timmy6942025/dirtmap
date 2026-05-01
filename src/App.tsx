import { NetworkProvider } from './store/NetworkContext';
import ZoomProvider from './store/ZoomContext';
import TopNavBar from './components/TopNavBar';
import LeftSidebar from './components/LeftSidebar';
import NetworkGraph from './components/NetworkGraph';
import RightPanel from './components/RightPanel';
import AIChat from './components/AIChat';
import Legend from './components/Legend';
import ZoomControls from './components/ZoomControls';
import './App.css';

export default function App() {
  return (
    <NetworkProvider>
      <ZoomProvider>
        <div className="app">
          <TopNavBar />
          <div className="app-body">
            <LeftSidebar />
            <main className="main-content">
              <NetworkGraph />
              <Legend />
              <ZoomControls />
            </main>
            <RightPanel />
          </div>
          <AIChat />
        </div>
      </ZoomProvider>
    </NetworkProvider>
  );
}
