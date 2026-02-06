import { NextResponse } from 'next/server';
import { getStorage } from '@/lib/db';
import { getUserId } from '@/lib/auth-helper';

// GET /api/db/conversations — list all conversations (metadata only, no messages)
export async function GET(request: Request) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const storage = await getStorage();
    const conversations = await storage.listConversationsMetaByUser(userId);
    return NextResponse.json(conversations);
  } catch (error) {
    console.error('Failed to list conversations:', error);
    return NextResponse.json({ error: 'Failed to list conversations' }, { status: 500 });
  }
}

// POST /api/db/conversations — create a new conversation
export async function POST(request: Request) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const storage = await getStorage();
    const body = await request.json();
    const created = await storage.createConversationForUser(body, userId);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Failed to create conversation:', error);
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
  }
}
