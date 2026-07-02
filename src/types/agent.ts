export interface Agent {
  id: string
  name: string
  url: string
  mode: 'chat' | 'gui'
}

export interface ChatMessage {
  id: string
  action: string
  message: unknown
  isUser: boolean
  timestamp?: string
}
