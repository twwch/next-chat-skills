import { NextResponse } from 'next/server';
import { getStorage } from '@/lib/db';

// GET /api/db/conversations — list all conversations (metadata only, no messages)
export async function GET() {
  try {
    const storage = await getStorage();
    const conversations = await storage.listConversationsMeta();
    return NextResponse.json(conversations);
  } catch (error) {
    console.error('Failed to list conversations:', error);
    return NextResponse.json({ error: 'Failed to list conversations' }, { status: 500 });
  }
}

// POST /api/db/conversations — create a new conversation
export async function POST(request: Request) {
  try {
    const storage = await getStorage();
    const body = await request.json();
    const created = await storage.createConversation(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Failed to create conversation:', error);
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
  }
}
