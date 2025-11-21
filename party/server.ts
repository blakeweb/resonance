import type * as Party from "partykit/server";
import { initializeSession, sessionReducer, getUnresolvedStatements, type Session } from "../lib/session";

export default class Server implements Party.Server {
  private pendingRemovals: Map<string, NodeJS.Timeout> = new Map();

  constructor(readonly room: Party.Room) {}

  async onConnect(conn: Party.Connection, _ctx: Party.ConnectionContext) {
    console.log(`User ${conn.id} connected to room ${this.room.id}`);

    // Cancel any pending removal for this user (they're reconnecting)
    if (conn.id && this.pendingRemovals.has(conn.id)) {
      const timeout = this.pendingRemovals.get(conn.id)!;
      clearTimeout(timeout);
      this.pendingRemovals.delete(conn.id);
      console.log(`🔄 Cancelled pending removal for user ${conn.id} (quick reconnect)`);
    }

    // Initialize session if it doesn't exist
    let session = await this.room.storage.get<Session>("session");
    if (!session) {
      session = initializeSession();
      await this.room.storage.put("session", session);
      console.log(`Initialized new session for room ${this.room.id}:`, session);
    }

    // If user has an ID and there are statements, add them to all unresolved statements
    if (conn.id && session && session.statements.length > 0) {
      // Get unresolved statements before adding the user
      const unresolvedStatements = getUnresolvedStatements(session);
      const unresolvedStatementTexts = unresolvedStatements.map((stmt) => ({
        index: session!.statements.indexOf(stmt),
        text: stmt.text.substring(0, 50) + (stmt.text.length > 50 ? '...' : ''),
        createdBy: stmt.createdBy,
        presentUsers: stmt.present
      }));

      console.log(`🔗 User ${conn.id} joining room ${this.room.id}`);
      console.log(`📝 Found ${unresolvedStatements.length} unresolved statements:`);
      unresolvedStatementTexts.forEach(stmt => {
        console.log(`   Statement ${stmt.index}: "${stmt.text}" by ${stmt.createdBy}, present: [${stmt.presentUsers.join(', ')}]`);
      });

      const updatedSession = sessionReducer(session, {
        type: "UPDATE_UNRESOLVED_STATEMENTS",
        payload: {
          userId: conn.id,
          action: "add"
        }
      });

      if (JSON.stringify(updatedSession) !== JSON.stringify(session)) {
        session = updatedSession;
        await this.room.storage.put("session", session);

        // Log what changed
        const updatedUnresolvedStatements = getUnresolvedStatements(session);
        const updatedStatementTexts = updatedUnresolvedStatements.map((stmt) => ({
          index: session!.statements.indexOf(stmt),
          text: stmt.text.substring(0, 50) + (stmt.text.length > 50 ? '...' : ''),
          createdBy: stmt.createdBy,
          presentUsers: stmt.present
        }));

        console.log(`✅ Added user ${conn.id} to unresolved statements. Updated statements:`);
        updatedStatementTexts.forEach(stmt => {
          console.log(`   Statement ${stmt.index}: "${stmt.text}" by ${stmt.createdBy}, present: [${stmt.presentUsers.join(', ')}]`);
        });

        // Broadcast updated session to all connections
        this.room.broadcast(JSON.stringify({
          type: "session_state",
          session: session
        }));
      } else {
        console.log(`⚠️  No changes needed - user ${conn.id} already in all unresolved statements or no unresolved statements`);
      }
    } else {
      console.log(`ℹ️  User ${conn.id} joining - no statements exist yet or no user ID`);
    }

    // Send current session state to new connection
    conn.send(JSON.stringify({
      type: "session_state",
      session: session
    }));
  }

  async onMessage(message: string, sender: Party.Connection) {
    console.log(`Received message from ${sender.id}:`, message);

    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case "get_session":
          const session = await this.room.storage.get<Session>("session");
          if (session) {
            sender.send(JSON.stringify({
              type: "session_state",
              session: session
            }));
            console.log(`Sent session state to ${sender.id}:`, session);
          }
          break;

        case "add_statement":
          await this.handleAddStatement(data.payload, sender);
          break;

        case "vote_response":
          await this.handleVoteResponse(data.payload, sender);
          break;

        default:
          console.log("Unknown message type:", data.type);
      }
    } catch (error) {
      console.error("Error parsing message:", error);
    }
  }

  async handleAddStatement(payload: { text: string; userId: string }, _sender: Party.Connection) {
    // Get current session
    let session = await this.room.storage.get<Session>("session");
    if (!session) {
      session = initializeSession();
    }

    // Get list of currently connected users
    const connections = [...this.room.getConnections()];
    const presentUsers = connections.map(conn => conn.id).filter(Boolean);

    console.log(`Adding statement "${payload.text}" by ${payload.userId}, present users:`, presentUsers);

    // Add statement with present users
    const updatedSession = sessionReducer(session, {
      type: "ADD_STATEMENT",
      payload: {
        text: payload.text,
        createdBy: payload.userId,
        presentUsers: presentUsers
      }
    });

    // Auto-approve the creator
    const statementIndex = updatedSession.statements.length - 1;
    const finalSession = sessionReducer(updatedSession, {
      type: "RESPOND_TO_STATEMENT",
      payload: {
        statementIndex: statementIndex,
        userId: payload.userId,
        response: true
      }
    });

    // Save updated session
    await this.room.storage.put("session", finalSession);
    console.log(`Session updated:`, finalSession);

    // Broadcast to all connections
    this.room.broadcast(JSON.stringify({
      type: "session_state",
      session: finalSession
    }));
  }

  async handleVoteResponse(payload: { statementIndex: number; userId: string; response: boolean }, _sender: Party.Connection) {
    // Get current session
    const session = await this.room.storage.get<Session>("session");
    if (!session) return;

    console.log(`Vote from ${payload.userId} on statement ${payload.statementIndex}: ${payload.response}`);

    // Apply the vote using our session reducer
    const updatedSession = sessionReducer(session, {
      type: "RESPOND_TO_STATEMENT",
      payload: {
        statementIndex: payload.statementIndex,
        userId: payload.userId,
        response: payload.response
      }
    });

    // Save updated session
    await this.room.storage.put("session", updatedSession);
    console.log(`Session updated after vote:`, updatedSession);

    // Broadcast to all connections
    this.room.broadcast(JSON.stringify({
      type: "session_state",
      session: updatedSession
    }));
  }

  async onClose(connection: Party.Connection) {
    console.log(`User ${connection.id} disconnected from room ${this.room.id}`);

    if (!connection.id) return;

    // Set a 5-second timeout before removing the user
    // This allows for quick reconnects (like page refreshes) without disrupting statements
    console.log(`⏰ Setting 5-second timeout before removing user ${connection.id}`);

    const timeout = setTimeout(async () => {
      await this.removeUserFromStatements(connection.id!);
      this.pendingRemovals.delete(connection.id!);
    }, 5000);

    this.pendingRemovals.set(connection.id, timeout);
  }

  private async removeUserFromStatements(userId: string) {
    console.log(`🗑️ Timeout expired - removing user ${userId} from unresolved statements`);

    const session = await this.room.storage.get<Session>("session");
    if (!session) return;

    const updatedSession = sessionReducer(session, {
      type: "UPDATE_UNRESOLVED_STATEMENTS",
      payload: {
        userId: userId,
        action: "remove"
      }
    });

    if (JSON.stringify(updatedSession) !== JSON.stringify(session)) {
      await this.room.storage.put("session", updatedSession);
      console.log(`Removed user ${userId} from unresolved statements:`, updatedSession);

      // Broadcast updated session to remaining connections
      this.room.broadcast(JSON.stringify({
        type: "session_state",
        session: updatedSession
      }));
    } else {
      console.log(`No changes needed when removing user ${userId}`);
    }
  }

  onError(connection: Party.Connection, error: Error) {
    console.error(`Error for connection ${connection.id}:`, error);
  }
}

Server satisfies Party.Worker;