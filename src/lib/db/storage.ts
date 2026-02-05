import type { Conversation, Message, Settings, ActivityItem } from '@/types';

// Conversation metadata without messages (for list view)
export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  activities?: ActivityItem[];
  tokenUsage?: { input: number; output: number };
  messageCount: number;
}

// Paginated messages response
export interface PaginatedMessages {
  messages: Message[];
  total: number;
  hasMore: boolean;
}

export interface StorageProvider {
  // Conversations
  listConversations(): Promise<Conversation[]>;
  listConversationsMeta(): Promise<ConversationMeta[]>;
  getConversation(id: string): Promise<Conversation | null>;
  createConversation(conv: Conversation): Promise<Conversation>;
  updateConversation(conv: Conversation): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;

  // Messages
  addMessage(conversationId: string, message: Message): Promise<void>;
  updateMessage(conversationId: string, message: Message): Promise<void>;
  getMessages(conversationId: string, page: number, limit: number): Promise<PaginatedMessages>;

  // Activities
  addActivity(conversationId: string, activity: ActivityItem): Promise<void>;
  clearActivities(conversationId: string): Promise<void>;

  // Settings
  getSettings(): Promise<Settings | null>;
  saveSettings(settings: Settings): Promise<Settings>;
}
