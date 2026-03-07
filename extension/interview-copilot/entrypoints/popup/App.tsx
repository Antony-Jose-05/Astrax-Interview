import "../../assets/tailwind.css";
import React from "react";
import ReactDOM from "react-dom/client";

import { ResumePanel } from "../../components/ResumePanel";
import TranscriptPanel from "../../components/TranscriptPanel";
import { QuestionsPanel } from "../../components/QuestionsPanel";
import { AlertPanel } from "../../components/AlertPanel";
import { ScorePanel } from "../../components/ScorePanel";

function App() {
  return (
    <div
      style={{ width: "420px", height: "600px" }}
      className="bg-slate-900 text-white p-3 space-y-3 overflow-y-auto"
    >
      <ResumePanel />
      <TranscriptPanel />
      <QuestionsPanel />
      <AlertPanel />
      <ScorePanel />
    </div>
  );
}

export default App;

/* Mount React to popup */
const rootElement = document.getElementById("root");

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}