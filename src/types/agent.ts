export interface Agent {
  id: string
  name: string
  url: string
}

export interface ChatMessage {
  id: string
  action: string
  message: unknown
  isUser: boolean
  timestamp?: string
}
