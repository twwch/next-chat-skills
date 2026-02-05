import { NextResponse } from 'next/server';
import { getStorage } from '@/lib/db';
import { auth } from '@/lib/auth';

// GET /api/db/conversations/[id]/messages — get paginated messages
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const storage = await getStorage();
    // Verify conversation belongs to user
    const conv = await storage.getConversationByUser(id, session.user.id);
    if (!conv) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const result = await storage.getMessages(id, page, limit);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to get messages:', error);
    return NextResponse.json({ error: 'Failed to get messages' }, { status: 500 });
  }
}

// POST /api/db/conversations/[id]/messages — add a message
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const storage = await getStorage();
    // Verify conversation belongs to user
    const conv = await storage.getConversationByUser(id, session.user.id);
    if (!conv) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const message = await request.json();
    await storage.addMessage(id, message);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error('Failed to add message:', error);
    return NextResponse.json({ error: 'Failed to add message' }, { status: 500 });
  }
}

// PUT /api/db/conversations/[id]/messages — update a message
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const storage = await getStorage();
    // Verify conversation belongs to user
    const conv = await storage.getConversationByUser(id, session.user.id);
    if (!conv) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const message = await request.json();
    await storage.updateMessage(id, message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to update message:', error);
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 });
  }
}
