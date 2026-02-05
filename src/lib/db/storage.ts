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
  // Conversations (legacy - without user filtering)
  listConversations(): Promise<Conversation[]>;
  listConversationsMeta(): Promise<ConversationMeta[]>;
  getConversation(id: string): Promise<Conversation | null>;
  createConversation(conv: Conversation): Promise<Conversation>;
  updateConversation(conv: Conversation): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;

  // Conversations (user-aware)
  listConversationsByUser(userId: string): Promise<Conversation[]>;
  listConversationsMetaByUser(userId: string): Promise<ConversationMeta[]>;
  getConversationByUser(id: string, userId: string): Promise<Conversation | null>;
  createConversationForUser(conv: Conversation, userId: string): Promise<Conversation>;
  updateConversationForUser(conv: Conversation, userId: string): Promise<Conversation>;
  deleteConversationForUser(id: string, userId: string): Promise<void>;

  // Messages
  addMessage(conversationId: string, message: Message): Promise<void>;
  updateMessage(conversationId: string, message: Message): Promise<void>;
  getMessages(conversationId: string, page: number, limit: number): Promise<PaginatedMessages>;

  // Activities
  addActivity(conversationId: string, activity: ActivityItem): Promise<void>;
  clearActivities(conversationId: string): Promise<void>;

  // Settings (legacy - without user filtering)
  getSettings(): Promise<Settings | null>;
  saveSettings(settings: Settings): Promise<Settings>;

  // Settings (user-aware)
  getSettingsByUser(userId: string): Promise<Settings | null>;
  saveSettingsByUser(userId: string, settings: Settings): Promise<Settings>;
}
