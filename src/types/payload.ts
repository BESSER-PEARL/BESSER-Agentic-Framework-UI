export const PayloadAction = {
  USER_MESSAGE: 'user_message',
  USER_VOICE: 'user_voice',
  USER_FILE: 'user_file',
  USER_SET_VARIABLE: 'user_set_variable',
  RESET: 'reset',
  AGENT_REPLY_STR: 'agent_reply_str',
  AGENT_REPLY_MARKDOWN: 'agent_reply_markdown',
  AGENT_REPLY_HTML: 'agent_reply_html',
  AGENT_REPLY_FILE: 'agent_reply_file',
  AGENT_REPLY_IMAGE: 'agent_reply_image',
  AGENT_REPLY_DF: 'agent_reply_dataframe',
  AGENT_REPLY_PLOTLY: 'agent_reply_plotly',
  AGENT_REPLY_OPTIONS: 'agent_reply_options',
  AGENT_REPLY_LOCATION: 'agent_reply_location',
  AGENT_REPLY_RAG: 'agent_reply_rag',
  AGENT_REPLY_AUDIO: 'agent_reply_audio',
  FETCH_USER_MESSAGES: 'fetch_user_messages',
} as const

export type PayloadAction = (typeof PayloadAction)[keyof typeof PayloadAction]

export interface Payload {
  action: string
  message: unknown
  history?: boolean
  timestamp?: string
}
