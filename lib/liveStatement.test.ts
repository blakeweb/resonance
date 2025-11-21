import { test, expect } from 'bun:test';
import { getLiveStatement, initializeSession, sessionReducer, getUnresolvedStatements, type Session } from './session';

// Helper function to create a test session with statements
function createTestSession(): Session {
  let session = initializeSession();

  // Add statement by user_1
  session = sessionReducer(session, {
    type: 'ADD_STATEMENT',
    payload: {
      text: 'Statement by user_1',
      createdBy: 'user_1',
      presentUsers: ['user_1', 'user_2', 'user_3']
    }
  });

  // Add statement by user_2
  session = sessionReducer(session, {
    type: 'ADD_STATEMENT',
    payload: {
      text: 'Statement by user_2',
      createdBy: 'user_2',
      presentUsers: ['user_1', 'user_2', 'user_3']
    }
  });

  // Add another statement by user_1
  session = sessionReducer(session, {
    type: 'ADD_STATEMENT',
    payload: {
      text: 'Second statement by user_1',
      createdBy: 'user_1',
      presentUsers: ['user_1', 'user_2', 'user_3']
    }
  });

  return session;
}

test('getLiveStatement returns null when no statements exist', () => {
  const session = initializeSession();
  const liveStatement = getLiveStatement(session);
  expect(liveStatement).toBe(null);
});

test('getLiveStatement returns first statement when all are unresolved and no one has resolved statements', () => {
  const session = createTestSession();
  const liveStatement = getLiveStatement(session);

  expect(liveStatement).not.toBe(null);
  expect(liveStatement?.text).toBe('Statement by user_1');
  expect(liveStatement?.createdBy).toBe('user_1');
});

test('getLiveStatement prioritizes creators with fewer resolved statements', () => {
  let session = createTestSession();

  // Resolve the first statement (by user_1) completely
  session = sessionReducer(session, {
    type: 'RESPOND_TO_STATEMENT',
    payload: { statementIndex: 0, userId: 'user_1', response: true }
  });
  session = sessionReducer(session, {
    type: 'RESPOND_TO_STATEMENT',
    payload: { statementIndex: 0, userId: 'user_2', response: true }
  });
  session = sessionReducer(session, {
    type: 'RESPOND_TO_STATEMENT',
    payload: { statementIndex: 0, userId: 'user_3', response: false }
  });

  // Now user_1 has 1 resolved statement, user_2 has 0 resolved statements
  // So user_2's statement should be prioritized even though it comes after user_1's second statement
  const liveStatement = getLiveStatement(session);

  expect(liveStatement).not.toBe(null);
  expect(liveStatement?.text).toBe('Statement by user_2');
  expect(liveStatement?.createdBy).toBe('user_2');
});

test('getLiveStatement handles equal resolved counts by maintaining original order', () => {
  let session = initializeSession();

  // Add statements by different users
  session = sessionReducer(session, {
    type: 'ADD_STATEMENT',
    payload: {
      text: 'First statement by user_1',
      createdBy: 'user_1',
      presentUsers: ['user_1', 'user_2']
    }
  });

  session = sessionReducer(session, {
    type: 'ADD_STATEMENT',
    payload: {
      text: 'Statement by user_2',
      createdBy: 'user_2',
      presentUsers: ['user_1', 'user_2']
    }
  });

  // When both creators have 0 resolved statements, should return first statement
  const liveStatement = getLiveStatement(session);
  expect(liveStatement?.text).toBe('First statement by user_1');
});

test('getLiveStatement returns null when all statements are resolved', () => {
  let session = initializeSession();

  // Add a statement
  session = sessionReducer(session, {
    type: 'ADD_STATEMENT',
    payload: {
      text: 'Test statement',
      createdBy: 'user_1',
      presentUsers: ['user_1', 'user_2']
    }
  });

  // Resolve it completely
  session = sessionReducer(session, {
    type: 'RESPOND_TO_STATEMENT',
    payload: { statementIndex: 0, userId: 'user_1', response: true }
  });
  session = sessionReducer(session, {
    type: 'RESPOND_TO_STATEMENT',
    payload: { statementIndex: 0, userId: 'user_2', response: false }
  });

  const liveStatement = getLiveStatement(session);
  expect(liveStatement).toBe(null);
});

test('getLiveStatement complex scenario with multiple users and resolved statements', () => {
  let session = initializeSession();

  // Add statements by user_1 (will resolve 2)
  session = sessionReducer(session, {
    type: 'ADD_STATEMENT',
    payload: {
      text: 'User_1 statement 1',
      createdBy: 'user_1',
      presentUsers: ['user_1', 'user_2', 'user_3']
    }
  });

  session = sessionReducer(session, {
    type: 'ADD_STATEMENT',
    payload: {
      text: 'User_1 statement 2',
      createdBy: 'user_1',
      presentUsers: ['user_1', 'user_2', 'user_3']
    }
  });

  // Add statements by user_2 (will resolve 1)
  session = sessionReducer(session, {
    type: 'ADD_STATEMENT',
    payload: {
      text: 'User_2 statement 1',
      createdBy: 'user_2',
      presentUsers: ['user_1', 'user_2', 'user_3']
    }
  });

  // Add statements by user_3 (will resolve 0)
  session = sessionReducer(session, {
    type: 'ADD_STATEMENT',
    payload: {
      text: 'User_3 statement 1',
      createdBy: 'user_3',
      presentUsers: ['user_1', 'user_2', 'user_3']
    }
  });

  session = sessionReducer(session, {
    type: 'ADD_STATEMENT',
    payload: {
      text: 'User_3 statement 2',
      createdBy: 'user_3',
      presentUsers: ['user_1', 'user_2', 'user_3']
    }
  });

  // Resolve user_1's first statement
  session = sessionReducer(session, {
    type: 'RESPOND_TO_STATEMENT',
    payload: { statementIndex: 0, userId: 'user_1', response: true }
  });
  session = sessionReducer(session, {
    type: 'RESPOND_TO_STATEMENT',
    payload: { statementIndex: 0, userId: 'user_2', response: true }
  });
  session = sessionReducer(session, {
    type: 'RESPOND_TO_STATEMENT',
    payload: { statementIndex: 0, userId: 'user_3', response: true }
  });

  // Resolve user_1's second statement
  session = sessionReducer(session, {
    type: 'RESPOND_TO_STATEMENT',
    payload: { statementIndex: 1, userId: 'user_1', response: true }
  });
  session = sessionReducer(session, {
    type: 'RESPOND_TO_STATEMENT',
    payload: { statementIndex: 1, userId: 'user_2', response: false }
  });
  session = sessionReducer(session, {
    type: 'RESPOND_TO_STATEMENT',
    payload: { statementIndex: 1, userId: 'user_3', response: true }
  });

  // Resolve user_2's statement
  session = sessionReducer(session, {
    type: 'RESPOND_TO_STATEMENT',
    payload: { statementIndex: 2, userId: 'user_1', response: true }
  });
  session = sessionReducer(session, {
    type: 'RESPOND_TO_STATEMENT',
    payload: { statementIndex: 2, userId: 'user_2', response: true }
  });
  session = sessionReducer(session, {
    type: 'RESPOND_TO_STATEMENT',
    payload: { statementIndex: 2, userId: 'user_3', response: false }
  });

  // Now: user_1 has 2 resolved, user_2 has 1 resolved, user_3 has 0 resolved
  // Should prioritize user_3's statements (first one)
  const liveStatement = getLiveStatement(session);
  expect(liveStatement?.text).toBe('User_3 statement 1');
  expect(liveStatement?.createdBy).toBe('user_3');
});

test('live statement index updates correctly when statements resolve', () => {
  let session = createTestSession();

  // Initially, the live statement should be the first one (user_1's statement)
  expect(session.liveStatementIndex).toBe(0);
  expect(getLiveStatement(session)?.createdBy).toBe('user_1');

  // Resolve first statement
  session = sessionReducer(session, {
    type: 'RESPOND_TO_STATEMENT',
    payload: { statementIndex: 0, userId: 'user_1', response: true }
  });
  session = sessionReducer(session, {
    type: 'RESPOND_TO_STATEMENT',
    payload: { statementIndex: 0, userId: 'user_2', response: true }
  });
  session = sessionReducer(session, {
    type: 'RESPOND_TO_STATEMENT',
    payload: { statementIndex: 0, userId: 'user_3', response: false }
  });

  // Now the live statement should switch to user_2's statement (index 1)
  // because user_1 now has 1 resolved statement while user_2 has 0
  expect(session.liveStatementIndex).toBe(1);
  expect(getLiveStatement(session)?.createdBy).toBe('user_2');

  const unresolvedStatements = getUnresolvedStatements(session);
  expect(unresolvedStatements.length).toBe(2); // user_2's and user_1's second statement
});