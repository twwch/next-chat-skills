import type { Conversation, Message, Settings, ActivityItem } from '@/types';

export interface StorageProvider {
  // Conversations
  listConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | null>;
  createConversation(conv: Conversation): Promise<Conversation>;
  updateConversation(conv: Conversation): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;

  // Messages
  addMessage(conversationId: string, message: Message): Promise<void>;
  updateMessage(conversationId: string, message: Message): Promise<void>;

  // Activities
  addActivity(conversationId: string, activity: ActivityItem): Promise<void>;
  clearActivities(conversationId: string): Promise<void>;

  // Settings
  getSettings(): Promise<Settings | null>;
  saveSettings(settings: Settings): Promise<Settings>;
}
