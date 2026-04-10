import { useState } from 'react'
import { AgentSelector } from './components/AgentSelector'
import { ChatLayout } from './components/ChatLayout'
import type { Agent } from './types/agent'
import './App.css'

const STORAGE_KEY = 'baf_agents'
const STORAGE_KEY_USERNAME = 'baf_username'

function loadAgents(): Agent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Agent[]) : []
  } catch {
    return []
  }
}

function saveAgents(agents: Agent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(agents))
}

function loadUsername(): string {
  return localStorage.getItem(STORAGE_KEY_USERNAME) ?? ''
}

function saveUsername(username: string) {
  localStorage.setItem(STORAGE_KEY_USERNAME, username)
}

function App() {
  const [agents, setAgents] = useState<Agent[]>(loadAgents)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [username, setUsername] = useState<string>(loadUsername)

  function handleAddAgent(agent: Agent) {
    setAgents((prev) => {
      const next = [...prev, agent]
      saveAgents(next)
      return next
    })
  }

  function handleRemoveAgent(id: string) {
    setAgents((prev) => {
      const next = prev.filter((a) => a.id !== id)
      saveAgents(next)
      return next
    })
  }

  function handleUsernameChange(value: string) {
    setUsername(value)
    saveUsername(value)
  }

  if (selectedAgent) {
    return <ChatLayout agent={selectedAgent} username={username} onBack={() => setSelectedAgent(null)} />
  }

  return (
    <AgentSelector
      agents={agents}
      username={username}
      onUsernameChange={handleUsernameChange}
      onSelectAgent={setSelectedAgent}
      onAddAgent={handleAddAgent}
      onRemoveAgent={handleRemoveAgent}
    />
  )
}

export default App
