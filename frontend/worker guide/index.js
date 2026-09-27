export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ============================================
    // CORS PREFLIGHT
    // ============================================
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // ============================================
    // RATE LIMITING
    // ============================================
    const clientIP =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For") ||
      "unknown";

    const rateLimitResult = checkRateLimit(clientIP);

    if (!rateLimitResult.allowed) {
      return jsonResponse(
        {
          success: false,
          error: "Too many requests",
          message: "Please try again later.",
        },
        429,
        {
          "Retry-After": String(rateLimitResult.retryAfter),
        }
      );
    }

    // ============================================
    // HEALTH CHECK
    // ============================================
    if (url.pathname === "/" || url.pathname === "/api") {
      const kv = env.CACHE || globalThis.CACHE;
      return jsonResponse({
        success: true,
        message: "WConsole API is running with L1 (Memory) + L2 (KV) Cache",
        kvConnected: Boolean(kv),
        databaseConnected: Boolean(env.DB),
        envKeys: Object.keys(env || {}),
        cachedItemsInMemory: memoryCache.size,
        endpoints: [
          "/api/game?title=...",
          "/api/steamgrid?title=...",
          "/api/rawg?title=...",
          "/api/news",
          "/auth/register",
          "/auth/login",
          "/auth/logout",
          "/auth/me",
          "/auth/recover",
          "/auth/recovery-code",
          "/users/search?q=...",
          "/users/discover?limit=10",
          "/users/:username",
          "PATCH /users/me",
          "/friends",
          "/friends/request",
          "/friends/accept",
          "/friends/reject",
          "/library",
          "/library/:userId",
        ],
      });
    }

    // ============================================
    // PUBLIC GAME / NEWS API
    // ============================================
    if (url.pathname === "/api/game") {
      if (request.method !== "GET") return methodNotAllowed(["GET", "OPTIONS"]);
      return handleGameRequest(url, env);
    }

    if (url.pathname === "/api/steamgrid") {
      if (request.method !== "GET") return methodNotAllowed(["GET", "OPTIONS"]);
      return handleSteamGridRequest(url, env);
    }

    if (url.pathname === "/api/rawg") {
      if (request.method !== "GET") return methodNotAllowed(["GET", "OPTIONS"]);
      return handleRawgRequest(url, env);
    }

    if (url.pathname === "/api/news") {
      if (request.method !== "GET") return methodNotAllowed(["GET", "OPTIONS"]);
      return handleNewsRequest(url, env);
    }

    // ============================================
    // AUTH
    // ============================================
    if (url.pathname === "/auth/register") {
      return handleRegister(request, env);
    }

    if (url.pathname === "/auth/login") {
      return handleLogin(request, env);
    }

    if (url.pathname === "/auth/logout") {
      return handleLogout(request, env);
    }

    if (url.pathname === "/auth/me") {
      return handleMe(request, env);
    }

    if (url.pathname === "/auth/recover") {
      return handleRecover(request, env);
    }

    if (url.pathname === "/auth/recovery-code") {
      return handleRegenerateRecoveryCode(request, env);
    }

    // ============================================
    // USERS
    // ============================================
    if (url.pathname === "/users/search") {
      return handleUserSearch(request, url, env);
    }

    if (url.pathname === "/users/discover") {
      return handleUserDiscover(request, url, env);
    }

    if (url.pathname === "/users/me") {
      return handleUserUpdate(request, env);
    }

    if (url.pathname.startsWith("/users/")) {
      const username = decodeURIComponent(url.pathname.slice("/users/".length)).trim();
      if (username) {
        return handleUserProfile(request, username, env);
      }
    }

    // ============================================
    // FRIENDS
    // ============================================
    if (url.pathname === "/friends" && request.method === "GET") {
      return handleFriendsList(request, env);
    }

    if (url.pathname === "/friends/requests" && request.method === "GET") {
      return handleFriendRequests(request, env);
    }

    if (url.pathname === "/friends/request") {
      return handleFriendRequest(request, env);
    }

    if (url.pathname === "/friends/accept") {
      return handleFriendAccept(request, env);
    }

    if (url.pathname === "/friends/reject") {
      return handleFriendReject(request, env);
    }

    if (url.pathname.startsWith("/friends/") && request.method === "DELETE") {
      const friendId = decodeURIComponent(url.pathname.slice("/friends/".length)).trim();
      if (friendId) return handleFriendDelete(request, friendId, env);
    }

    // ============================================
    // LIBRARY
    // ============================================
    if (url.pathname === "/library") {
      return handleOwnLibrary(request, env);
    }

    if (url.pathname.startsWith("/library/")) {
      const userId = decodeURIComponent(url.pathname.slice("/library/".length)).trim();
      if (userId) return handleUserLibrary(request, userId, env);
    }

    // ============================================
    // 404
    // ============================================
    return jsonResponse(
      {
        success: false,
        error: "Endpoint not found",
      },
      404
    );
  },
};

// ======================================================
// AUTH / USERS / FRIENDS / LIBRARY
// ======================================================

const AUTH = {
  sessionDays: 30,
  passwordIterations: 100000,
  maxBodyBytes: 16 * 1024,
};

async function handleRegister(request, env) {
  if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"]);
  if (!env.DB) return databaseNotConfigured();

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const username = normalizeUsername(body.data.username);
  const password = typeof body.data.password === "string" ? body.data.password : "";
  const displayName =
    typeof body.data.displayName === "string" && body.data.displayName.trim()
      ? body.data.displayName.trim().slice(0, 50)
      : username;

  if (!username.valid) {
    return jsonResponse({ success: false, error: username.error }, 400);
  }

  if (password.length < 8 || password.length > 128) {
    return jsonResponse(
      { success: false, error: "Password must contain between 8 and 128 characters" },
      400
    );
  }

  try {
    const existing = await env.DB.prepare(
      "SELECT id FROM users WHERE username = ? LIMIT 1"
    ).bind(username.value).first();

    if (existing) {
      return jsonResponse({ success: false, error: "Username already exists" }, 409);
    }

    const id = crypto.randomUUID();
    const passwordSalt = randomBytes(16);
    const passwordHash = await hashPassword(password, passwordSalt);
    const now = new Date().toISOString();

    await env.DB.prepare(`
      INSERT INTO users
      (id, username, display_name, password_hash, password_salt, library_visibility, created_at, updated_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, 'friends', ?, ?, ?)
    `).bind(
      id,
      username.value,
      displayName,
      passwordHash,
      bytesToBase64(passwordSalt),
      now,
      now,
      now
    ).run();

    const token = await createSession(env.DB, id);

    // Código de respaldo: se muestra UNA sola vez al registrarse.
    let recoveryCode = null;
    try {
      recoveryCode = await storeRecoveryCode(env.DB, id);
    } catch (error) {
      console.error("Recovery code error:", error);
    }

    return jsonResponse({
      success: true,
      user: publicUser({
        id,
        username: username.value,
        display_name: displayName,
        library_visibility: "friends",
        created_at: now,
        last_seen_at: now,
      }),
      token,
      expiresIn: AUTH.sessionDays * 24 * 60 * 60,
      ...(recoveryCode ? { recoveryCode } : {}),
    }, 201);
  } catch (error) {
    console.error("Register error:", error);
    return jsonResponse({ success: false, error: "Failed to create account" }, 500);
  }
}

async function handleLogin(request, env) {
  if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"]);
  if (!env.DB) return databaseNotConfigured();

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const username = normalizeUsername(body.data.username);
  const password = typeof body.data.password === "string" ? body.data.password : "";

  if (!username.valid || !password) {
    return jsonResponse({ success: false, error: "Invalid username or password" }, 401);
  }

  try {
    const user = await env.DB.prepare(`
      SELECT id, username, display_name, avatar_url, cover_url, bio, password_hash, password_salt,
             library_visibility, created_at, last_seen_at
      FROM users
      WHERE username = ?
      LIMIT 1
    `).bind(username.value).first();

    if (!user) {
      return jsonResponse({ success: false, error: "Invalid username or password" }, 401);
    }

    const salt = base64ToBytes(user.password_salt);
    const candidateHash = await hashPassword(password, salt);

    if (!timingSafeEqualString(candidateHash, user.password_hash)) {
      return jsonResponse({ success: false, error: "Invalid username or password" }, 401);
    }

    const now = new Date().toISOString();

    await env.DB.prepare(
      "UPDATE users SET last_seen_at = ?, updated_at = ? WHERE id = ?"
    ).bind(now, now, user.id).run();

    const token = await createSession(env.DB, user.id);

    return jsonResponse({
      success: true,
      user: publicUser({ ...user, last_seen_at: now }),
      token,
      expiresIn: AUTH.sessionDays * 24 * 60 * 60,
    });
  } catch (error) {
    console.error("Login error:", error);
    return jsonResponse({ success: false, error: "Failed to login" }, 500);
  }
}

async function handleLogout(request, env) {
  if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"]);
  if (!env.DB) return databaseNotConfigured();

  const token = getBearerToken(request);
  if (!token) {
    return jsonResponse({ success: true });
  }

  try {
    const tokenHash = await sha256(token);
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return jsonResponse({ success: true });
  } catch (error) {
    console.error("Logout error:", error);
    return jsonResponse({ success: false, error: "Failed to logout" }, 500);
  }
}

async function handleMe(request, env) {
  if (request.method !== "GET") return methodNotAllowed(["GET", "OPTIONS"]);
  if (!env.DB) return databaseNotConfigured();

  const auth = await requireAuth(request, env.DB);
  if (!auth.ok) return auth.response;

  await touchLastSeen(env.DB, auth.user.id);

  return jsonResponse({
    success: true,
    user: publicUser(auth.user),
  });
}

// ── Códigos de respaldo (recuperar contraseña sin email) ───────────────────
// Solo se muestra el código UNA vez (al crear/regenerar); en D1 vive el hash.

const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateRecoveryCode() {
  const rand = crypto.getRandomValues(new Uint8Array(8));
  let part = "";
  for (let i = 0; i < 8; i++) {
    part += RECOVERY_CODE_ALPHABET[rand[i] % RECOVERY_CODE_ALPHABET.length];
  }
  return `WPS5-${part.slice(0, 4)}-${part.slice(4)}`;
}

function normalizeRecoveryCode(value) {
  return String(value || "").toUpperCase().replace(/[\s-]/g, "");
}

async function storeRecoveryCode(db, userId) {
  const code = generateRecoveryCode();
  const codeHash = await sha256(normalizeRecoveryCode(code));
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO recovery_codes (user_id, code_hash, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      code_hash = excluded.code_hash,
      created_at = excluded.created_at
  `).bind(userId, codeHash, now).run();
  return code;
}

async function handleRecover(request, env) {
  if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"]);
  if (!env.DB) return databaseNotConfigured();

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const username = normalizeUsername(body.data.username);
  const code = normalizeRecoveryCode(body.data.recoveryCode);
  const newPassword = typeof body.data.newPassword === "string" ? body.data.newPassword : "";

  if (!username.valid || !code) {
    return jsonResponse({ success: false, error: "Invalid username or recovery code" }, 401);
  }

  if (newPassword.length < 8 || newPassword.length > 128) {
    return jsonResponse(
      { success: false, error: "Password must contain between 8 and 128 characters" },
      400
    );
  }

  try {
    const user = await env.DB.prepare(
      "SELECT id FROM users WHERE username = ? LIMIT 1"
    ).bind(username.value).first();

    if (!user) {
      return jsonResponse({ success: false, error: "Invalid username or recovery code" }, 401);
    }

    const stored = await env.DB.prepare(
      "SELECT code_hash FROM recovery_codes WHERE user_id = ? LIMIT 1"
    ).bind(user.id).first();

    const candidateHash = await sha256(code);
    if (!stored || !timingSafeEqualString(candidateHash, stored.code_hash)) {
      return jsonResponse({ success: false, error: "Invalid username or recovery code" }, 401);
    }

    const passwordSalt = randomBytes(16);
    const passwordHash = await hashPassword(newPassword, passwordSalt);
    const now = new Date().toISOString();

    await env.DB.prepare(
      "UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?"
    ).bind(passwordHash, bytesToBase64(passwordSalt), now, user.id).run();

    // Cerrar todas las sesiones + rotar el código (un solo uso).
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();
    const nextCode = await storeRecoveryCode(env.DB, user.id);

    return jsonResponse({ success: true, recoveryCode: nextCode });
  } catch (error) {
    console.error("Recover error:", error);
    return jsonResponse({ success: false, error: "Failed to reset password" }, 500);
  }
}

async function handleRegenerateRecoveryCode(request, env) {
  if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"]);
  if (!env.DB) return databaseNotConfigured();

  const auth = await requireAuth(request, env.DB);
  if (!auth.ok) return auth.response;

  try {
    const code = await storeRecoveryCode(env.DB, auth.user.id);
    return jsonResponse({ success: true, recoveryCode: code });
  } catch (error) {
    console.error("Regenerate recovery code error:", error);
    return jsonResponse({ success: false, error: "Failed to generate code" }, 500);
  }
}

async function handleUserSearch(request, url, env) {
  if (request.method !== "GET") return methodNotAllowed(["GET", "OPTIONS"]);
  if (!env.DB) return databaseNotConfigured();

  const auth = await requireAuth(request, env.DB);
  if (!auth.ok) return auth.response;

  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  if (q.length < 2 || q.length > 30) {
    return jsonResponse(
      { success: false, error: "Search query must contain between 2 and 30 characters" },
      400
    );
  }

  try {
    const result = await env.DB.prepare(`
      SELECT id, username, display_name, avatar_url, cover_url, bio, library_visibility, created_at, last_seen_at
      FROM users
      WHERE username LIKE ? OR display_name LIKE ?
      ORDER BY username ASC
      LIMIT 20
    `).bind(`%${q}%`, `%${q}%`).all();

    return jsonResponse({
      success: true,
      users: (result.results || [])
        .filter((user) => user.id !== auth.user.id)
        .map(publicUser),
    });
  } catch (error) {
    console.error("User search error:", error);
    return jsonResponse({ success: false, error: "Failed to search users" }, 500);
  }
}

async function handleUserProfile(request, username, env) {
  if (request.method !== "GET") return methodNotAllowed(["GET", "OPTIONS"]);
  if (!env.DB) return databaseNotConfigured();

  const auth = await requireAuth(request, env.DB);
  if (!auth.ok) return auth.response;

  const normalized = normalizeUsername(username);
  if (!normalized.valid) {
    return jsonResponse({ success: false, error: "Invalid username" }, 400);
  }

  try {
    const user = await env.DB.prepare(`
      SELECT id, username, display_name, avatar_url, cover_url, bio, library_visibility, created_at, last_seen_at
      FROM users
      WHERE username = ?
      LIMIT 1
    `).bind(normalized.value).first();

    if (!user) {
      return jsonResponse({ success: false, error: "User not found" }, 404);
    }

    const friendship = await getFriendship(env.DB, auth.user.id, user.id);

    return jsonResponse({
      success: true,
      user: publicUser(user),
      friendship: friendship ? friendship.status : "none",
      isSelf: auth.user.id === user.id,
    });
  } catch (error) {
    console.error("User profile error:", error);
    return jsonResponse({ success: false, error: "Failed to load profile" }, 500);
  }
}

// Descubrimiento: últimos usuarios activos (para sugerencias antes de buscar).
// Requiere auth, excluye al propio usuario, máximo 20.
async function handleUserDiscover(request, url, env) {
  if (request.method !== "GET") return methodNotAllowed(["GET", "OPTIONS"]);
  if (!env.DB) return databaseNotConfigured();

  const auth = await requireAuth(request, env.DB);
  if (!auth.ok) return auth.response;

  let limit = Number(url.searchParams.get("limit") || 10);
  if (!Number.isFinite(limit)) limit = 10;
  limit = Math.min(Math.max(Math.floor(limit), 1), 20);

  try {
    const result = await env.DB.prepare(`
      SELECT id, username, display_name, avatar_url, cover_url, bio, library_visibility, created_at, last_seen_at
      FROM users
      WHERE id != ?
      ORDER BY last_seen_at DESC
      LIMIT ?
    `).bind(auth.user.id, limit).all();

    return jsonResponse({
      success: true,
      users: (result.results || []).map(publicUser),
    });
  } catch (error) {
    console.error("User discover error:", error);
    return jsonResponse({ success: false, error: "Failed to discover users" }, 500);
  }
}

async function handleUserUpdate(request, env) {
  if (request.method !== "PATCH") return methodNotAllowed(["PATCH", "OPTIONS"]);
  if (!env.DB) return databaseNotConfigured();

  const auth = await requireAuth(request, env.DB);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const data = body.data || {};
  const updates = {};

  if (data.displayName !== undefined) {
    if (typeof data.displayName !== "string" || !data.displayName.trim() || data.displayName.trim().length > 50) {
      return jsonResponse({ success: false, error: "displayName must contain between 1 and 50 characters" }, 400);
    }
    updates.display_name = data.displayName.trim();
  }

  if (data.bio !== undefined) {
    if (typeof data.bio !== "string" || data.bio.length > 500) {
      return jsonResponse({ success: false, error: "bio must contain up to 500 characters" }, 400);
    }
    updates.bio = data.bio.trim();
  }

  if (data.avatarUrl !== undefined) {
    if (typeof data.avatarUrl !== "string" || data.avatarUrl.length > 1000) {
      return jsonResponse({ success: false, error: "avatarUrl is too long" }, 400);
    }
    const v = data.avatarUrl.trim();
    if (v && !/^https?:\/\//i.test(v)) {
      return jsonResponse({ success: false, error: "avatarUrl must be an http(s) URL" }, 400);
    }
    updates.avatar_url = v || null;
  }

  if (data.coverUrl !== undefined) {
    if (typeof data.coverUrl !== "string" || data.coverUrl.length > 1000) {
      return jsonResponse({ success: false, error: "coverUrl is too long" }, 400);
    }
    const v = data.coverUrl.trim();
    if (v && !/^https?:\/\//i.test(v)) {
      return jsonResponse({ success: false, error: "coverUrl must be an http(s) URL" }, 400);
    }
    updates.cover_url = v || null;
  }

  if (data.libraryVisibility !== undefined) {
    if (!["public", "friends", "private"].includes(data.libraryVisibility)) {
      return jsonResponse({ success: false, error: "libraryVisibility must be public, friends or private" }, 400);
    }
    updates.library_visibility = data.libraryVisibility;
  }

  if (Object.keys(updates).length === 0) {
    return jsonResponse({ success: false, error: "Nothing to update" }, 400);
  }

  try {
    const now = new Date().toISOString();
    const sets = Object.keys(updates).map((k) => `${k} = ?`).join(", ");
    await env.DB.prepare(
      `UPDATE users SET ${sets}, updated_at = ? WHERE id = ?`
    ).bind(...Object.values(updates), now, auth.user.id).run();

    const user = await env.DB.prepare(`
      SELECT id, username, display_name, avatar_url, cover_url, bio, library_visibility, created_at, last_seen_at
      FROM users WHERE id = ? LIMIT 1
    `).bind(auth.user.id).first();

    return jsonResponse({ success: true, user: publicUser(user) });
  } catch (error) {
    console.error("User update error:", error);
    return jsonResponse({ success: false, error: "Failed to update profile" }, 500);
  }
}

async function handleFriendRequest(request, env) {
  if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"]);
  if (!env.DB) return databaseNotConfigured();

  const auth = await requireAuth(request, env.DB);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const targetUserId = typeof body.data.userId === "string" ? body.data.userId.trim() : "";
  if (!targetUserId) {
    return jsonResponse({ success: false, error: "userId is required" }, 400);
  }

  if (targetUserId === auth.user.id) {
    return jsonResponse({ success: false, error: "You cannot add yourself" }, 400);
  }

  try {
    const target = await env.DB.prepare(
      "SELECT id, username FROM users WHERE id = ? LIMIT 1"
    ).bind(targetUserId).first();

    if (!target) {
      return jsonResponse({ success: false, error: "User not found" }, 404);
    }

    const blocked = await env.DB.prepare(`
      SELECT id FROM blocks
      WHERE (blocker_id = ? AND blocked_id = ?)
         OR (blocker_id = ? AND blocked_id = ?)
      LIMIT 1
    `).bind(auth.user.id, target.id, target.id, auth.user.id).first();

    if (blocked) {
      return jsonResponse({ success: false, error: "Friend request cannot be sent" }, 403);
    }

    const existing = await getFriendship(env.DB, auth.user.id, target.id);

    if (existing?.status === "accepted") {
      return jsonResponse({ success: false, error: "You are already friends" }, 409);
    }

    if (existing?.status === "pending") {
      return jsonResponse({ success: false, error: "Friend request already exists" }, 409);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await env.DB.prepare(`
      INSERT INTO friendships
      (id, requester_id, addressee_id, status, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `).bind(id, auth.user.id, target.id, now, now).run();

    return jsonResponse({
      success: true,
      request: {
        id,
        userId: target.id,
        username: target.username,
        status: "pending",
        createdAt: now,
      },
    }, 201);
  } catch (error) {
    console.error("Friend request error:", error);
    return jsonResponse({ success: false, error: "Failed to send friend request" }, 500);
  }
}

async function handleFriendAccept(request, env) {
  if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"]);
  if (!env.DB) return databaseNotConfigured();

  const auth = await requireAuth(request, env.DB);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const requestId = typeof body.data.requestId === "string" ? body.data.requestId.trim() : "";
  if (!requestId) {
    return jsonResponse({ success: false, error: "requestId is required" }, 400);
  }

  try {
    const friendship = await env.DB.prepare(`
      SELECT id, requester_id, addressee_id, status
      FROM friendships
      WHERE id = ? AND addressee_id = ? AND status = 'pending'
      LIMIT 1
    `).bind(requestId, auth.user.id).first();

    if (!friendship) {
      return jsonResponse({ success: false, error: "Friend request not found" }, 404);
    }

    const now = new Date().toISOString();

    await env.DB.prepare(`
      UPDATE friendships
      SET status = 'accepted', updated_at = ?
      WHERE id = ?
    `).bind(now, requestId).run();

    return jsonResponse({
      success: true,
      friendship: {
        id: requestId,
        userId: friendship.requester_id,
        status: "accepted",
        updatedAt: now,
      },
    });
  } catch (error) {
    console.error("Friend accept error:", error);
    return jsonResponse({ success: false, error: "Failed to accept friend request" }, 500);
  }
}

async function handleFriendReject(request, env) {
  if (request.method !== "POST") return methodNotAllowed(["POST", "OPTIONS"]);
  if (!env.DB) return databaseNotConfigured();

  const auth = await requireAuth(request, env.DB);
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const requestId = typeof body.data.requestId === "string" ? body.data.requestId.trim() : "";
  if (!requestId) {
    return jsonResponse({ success: false, error: "requestId is required" }, 400);
  }

  try {
    const result = await env.DB.prepare(`
      DELETE FROM friendships
      WHERE id = ? AND addressee_id = ? AND status = 'pending'
    `).bind(requestId, auth.user.id).run();

    if (!result.meta?.changes) {
      return jsonResponse({ success: false, error: "Friend request not found" }, 404);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("Friend reject error:", error);
    return jsonResponse({ success: false, error: "Failed to reject friend request" }, 500);
  }
}

async function handleFriendDelete(request, friendId, env) {
  if (!env.DB) return databaseNotConfigured();

  const auth = await requireAuth(request, env.DB);
  if (!auth.ok) return auth.response;

  try {
    const result = await env.DB.prepare(`
      DELETE FROM friendships
      WHERE id = ?
        AND status = 'accepted'
        AND (requester_id = ? OR addressee_id = ?)
    `).bind(friendId, auth.user.id, auth.user.id).run();

    if (!result.meta?.changes) {
      return jsonResponse({ success: false, error: "Friendship not found" }, 404);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("Friend delete error:", error);
    return jsonResponse({ success: false, error: "Failed to remove friend" }, 500);
  }
}

async function handleFriendsList(request, env) {
  if (!env.DB) return databaseNotConfigured();

  const auth = await requireAuth(request, env.DB);
  if (!auth.ok) return auth.response;

  try {
    const result = await env.DB.prepare(`
      SELECT
        f.id,
        f.created_at,
        u.id AS user_id,
        u.username,
        u.display_name,
        u.avatar_url,
        u.cover_url,
        u.bio,
        u.library_visibility,
        u.created_at AS user_created_at,
        u.last_seen_at
      FROM friendships f
      JOIN users u
        ON u.id = CASE
          WHEN f.requester_id = ? THEN f.addressee_id
          ELSE f.requester_id
        END
      WHERE (f.requester_id = ? OR f.addressee_id = ?)
        AND f.status = 'accepted'
      ORDER BY u.username ASC
    `).bind(auth.user.id, auth.user.id, auth.user.id).all();

    return jsonResponse({
      success: true,
      friends: (result.results || []).map((row) => ({
        friendshipId: row.id,
        user: publicUser({
          id: row.user_id,
          username: row.username,
          display_name: row.display_name,
          avatar_url: row.avatar_url,
          cover_url: row.cover_url,
          bio: row.bio,
          library_visibility: row.library_visibility,
          created_at: row.user_created_at,
          last_seen_at: row.last_seen_at,
        }),
        friendshipCreatedAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error("Friends list error:", error);
    return jsonResponse({ success: false, error: "Failed to load friends" }, 500);
  }
}

async function handleFriendRequests(request, env) {
  if (!env.DB) return databaseNotConfigured();

  const auth = await requireAuth(request, env.DB);
  if (!auth.ok) return auth.response;

  try {
    const result = await env.DB.prepare(`
      SELECT
        f.id,
        f.created_at,
        u.id AS user_id,
        u.username,
        u.display_name,
        u.avatar_url,
        u.cover_url,
        u.bio,
        u.library_visibility,
        u.created_at AS user_created_at,
        u.last_seen_at
      FROM friendships f
      JOIN users u ON u.id = f.requester_id
      WHERE f.addressee_id = ? AND f.status = 'pending'
      ORDER BY f.created_at DESC
      LIMIT 50
    `).bind(auth.user.id).all();

    return jsonResponse({
      success: true,
      requests: (result.results || []).map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        user: publicUser({
          id: row.user_id,
          username: row.username,
          display_name: row.display_name,
          avatar_url: row.avatar_url,
          cover_url: row.cover_url,
          bio: row.bio,
          library_visibility: row.library_visibility,
          created_at: row.user_created_at,
          last_seen_at: row.last_seen_at,
        }),
      })),
    });
  } catch (error) {
    console.error("Friend requests error:", error);
    return jsonResponse({ success: false, error: "Failed to load friend requests" }, 500);
  }
}

async function handleOwnLibrary(request, env) {
  if (!env.DB) return databaseNotConfigured();

  const auth = await requireAuth(request, env.DB);
  if (!auth.ok) return auth.response;

  if (request.method === "GET") {
    return getLibraryForUser(env.DB, auth.user, auth.user.id, true);
  }

  if (request.method === "POST") {
    const body = await readJsonBody(request, { maxBytes: 512 * 1024 });
    if (!body.ok) return body.response;

    // Subida en lote: { games: [{ gameId, gameName, coverUrl?, metadata? }] }
    if (Array.isArray(body.data.games)) {
      return addLibraryGamesBatch(env.DB, auth.user, body.data.games);
    }

    return addLibraryGame(env.DB, auth.user, body.data);
  }

  if (request.method === "DELETE") {
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;

    const gameId = typeof body.data.gameId === "string" ? body.data.gameId.trim() : "";
    if (!gameId || gameId.length > 150) {
      return jsonResponse({ success: false, error: "Valid gameId is required" }, 400);
    }

    try {
      const games = await readUserLibraryDoc(env.DB, auth.user.id);
      const filtered = games.filter((g) => g.game_id !== gameId);
      if (filtered.length !== games.length) {
        await writeUserLibraryDoc(env.DB, auth.user.id, filtered);
      }
      return jsonResponse({ success: true });
    } catch (error) {
      console.error("Library delete error:", error);
      return jsonResponse({ success: false, error: "Failed to remove game" }, 500);
    }
  }

  return methodNotAllowed(["GET", "POST", "DELETE", "OPTIONS"]);
}

async function handleUserLibrary(request, userId, env) {
  if (request.method !== "GET") return methodNotAllowed(["GET", "OPTIONS"]);
  if (!env.DB) return databaseNotConfigured();

  const auth = await requireAuth(request, env.DB);
  if (!auth.ok) return auth.response;

  const target = await env.DB.prepare(
    "SELECT id, username, display_name, avatar_url, library_visibility FROM users WHERE id = ? LIMIT 1"
  ).bind(userId).first();

  if (!target) {
    return jsonResponse({ success: false, error: "User not found" }, 404);
  }

  return getLibraryForUser(env.DB, target, auth.user.id, false);
}

async function getLibraryForUser(db, targetUser, viewerId, isSelf) {
  const visibility = targetUser.library_visibility || "friends";

  if (!isSelf && visibility === "private") {
    return jsonResponse({
      success: true,
      visible: false,
      reason: "private",
      library: [],
    });
  }

  if (!isSelf && visibility === "friends") {
    const friendship = await getFriendship(db, viewerId, targetUser.id);
    if (friendship?.status !== "accepted") {
      return jsonResponse({
        success: true,
        visible: false,
        reason: "friends_only",
        library: [],
      });
    }
  }

  try {
    // Un solo documento JSON por usuario (ver user_libraries).
    const games = await readUserLibraryDoc(db, targetUser.id);
    return jsonResponse({
      success: true,
      visible: true,
      userId: targetUser.id,
      username: targetUser.username,
      library: games.map(toLibraryRow),
    });
  } catch (error) {
    console.error("Library read error:", error);
    return jsonResponse({ success: false, error: "Failed to load library" }, 500);
  }
}

// ── Biblioteca como documento único por usuario ────────────────────────────
// En vez de una fila por juego (80-100 por usuario), cada usuario ocupa UNA
// fila en user_libraries con todo su catálogo en JSON. Todas las lecturas
// son de biblioteca completa, así que el modelo relacional no aportaba nada.
//
// Migración D1 (ejecutar una vez en la consola SQL):
//   CREATE TABLE IF NOT EXISTS user_libraries (
//     user_id TEXT PRIMARY KEY,
//     library_json TEXT NOT NULL DEFAULT '[]',
//     updated_at TEXT NOT NULL
//   );
//
// Entrada del documento: { game_id, game_name, cover_url, metadata, added_at }

async function readUserLibraryDoc(db, userId) {
  try {
    const row = await db.prepare(
      "SELECT library_json FROM user_libraries WHERE user_id = ? LIMIT 1"
    ).bind(userId).first();
    if (!row || !row.library_json) return [];
    const parsed = JSON.parse(row.library_json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeUserLibraryDoc(db, userId, games) {
  const now = new Date().toISOString();
  await db.prepare(`
    INSERT INTO user_libraries (user_id, library_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      library_json = excluded.library_json,
      updated_at = excluded.updated_at
  `).bind(userId, JSON.stringify(games), now).run();
}

function toLibraryRow(game, idx) {
  return {
    id: game.game_id || `g${idx}`,
    game_id: game.game_id,
    game_name: game.game_name,
    cover_url: game.cover_url || null,
    metadata_json: game.metadata !== undefined && game.metadata !== null
      ? JSON.stringify(game.metadata)
      : null,
    added_at: game.added_at || null,
  };
}

function validateLibraryGame(data) {
  const gameId = typeof data?.gameId === "string" ? data.gameId.trim() : "";
  const gameName = typeof data?.gameName === "string" ? data.gameName.trim() : "";
  const coverUrl = typeof data?.coverUrl === "string" ? data.coverUrl.trim() : "";
  const metadata = data?.metadata;

  if (!gameId || !gameName) {
    return { ok: false, error: "gameId and gameName are required" };
  }

  if (gameId.length > 150 || gameName.length > 200 || coverUrl.length > 1000) {
    return { ok: false, error: "Game data is too long" };
  }

  if (metadata !== undefined && metadata !== null) {
    try {
      if (JSON.stringify(metadata).length > 12000) {
        return { ok: false, error: "metadata is too large" };
      }
    } catch {
      return { ok: false, error: "Invalid metadata" };
    }
  }

  return { ok: true, game: { gameId, gameName, coverUrl, metadata: metadata ?? null } };
}

async function addLibraryGamesBatch(db, user, games) {
  if (!Array.isArray(games) || games.length === 0 || games.length > 1000) {
    return jsonResponse({ success: false, error: "games must contain between 1 and 1000 items" }, 400);
  }

  const current = await readUserLibraryDoc(db, user.id);
  const byId = new Map(current.map((g) => [g.game_id, g]));
  const now = new Date().toISOString();
  let upserted = 0;
  const errors = [];

  for (let i = 0; i < games.length; i++) {
    const validated = validateLibraryGame(games[i]);
    if (!validated.ok) {
      if (errors.length < 10) errors.push({ index: i, error: validated.error });
      continue;
    }
    const { gameId, gameName, coverUrl, metadata } = validated.game;
    const existing = byId.get(gameId);
    byId.set(gameId, {
      game_id: gameId,
      game_name: gameName,
      cover_url: coverUrl || null,
      metadata: metadata,
      added_at: existing?.added_at || now,
      updated_at: now,
    });
    upserted += 1;
  }

  try {
    const merged = Array.from(byId.values());
    if (JSON.stringify(merged).length > 1024 * 1024) {
      return jsonResponse({ success: false, error: "Library is too large" }, 413);
    }
    await writeUserLibraryDoc(db, user.id, merged);
  } catch (error) {
    console.error("Library batch write error:", error);
    return jsonResponse({ success: false, error: "Failed to save library" }, 500);
  }

  return jsonResponse({ success: true, upserted, total: games.length, errors });
}

async function addLibraryGame(db, user, data) {
  const validated = validateLibraryGame(data);
  if (!validated.ok) {
    const status = validated.error === "Failed to add game to library" ? 500 : 400;
    return jsonResponse({ success: false, error: validated.error }, status);
  }

  try {
    const current = await readUserLibraryDoc(db, user.id);
    const now = new Date().toISOString();
    const { gameId, gameName, coverUrl, metadata } = validated.game;
    const existing = current.find((g) => g.game_id === gameId);
    const entry = {
      game_id: gameId,
      game_name: gameName,
      cover_url: coverUrl || null,
      metadata: metadata,
      added_at: existing?.added_at || now,
      updated_at: now,
    };
    const merged = existing
      ? current.map((g) => (g.game_id === gameId ? entry : g))
      : [...current, entry];
    await writeUserLibraryDoc(db, user.id, merged);

    return jsonResponse({ success: true, game: toLibraryRow(entry, 0) });
  } catch (error) {
    console.error("Library add error:", error);
    return jsonResponse({ success: false, error: "Failed to add game to library" }, 500);
  }
}

async function requireAuth(request, db) {
  const token = getBearerToken(request);

  if (!token || token.length < 40 || token.length > 512) {
    return {
      ok: false,
      response: jsonResponse({ success: false, error: "Authentication required" }, 401),
    };
  }

  try {
    const tokenHash = await sha256(token);

    const session = await db.prepare(`
      SELECT
        s.id AS session_id,
        s.expires_at,
        u.id,
        u.username,
        u.display_name,
        u.avatar_url,
        u.cover_url,
        u.bio,
        u.library_visibility,
        u.created_at,
        u.last_seen_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
        AND s.expires_at > ?
      LIMIT 1
    `).bind(tokenHash, new Date().toISOString()).first();

    if (!session) {
      return {
        ok: false,
        response: jsonResponse({ success: false, error: "Invalid or expired session" }, 401),
      };
    }

    return {
      ok: true,
      user: session,
      sessionId: session.session_id,
    };
  } catch (error) {
    console.error("Auth lookup error:", error);
    return {
      ok: false,
      response: jsonResponse({ success: false, error: "Authentication service unavailable" }, 500),
    };
  }
}

async function createSession(db, userId) {
  const rawToken = randomToken(32);
  const tokenHash = await sha256(rawToken);
  const id = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = new Date(now + AUTH.sessionDays * 24 * 60 * 60 * 1000).toISOString();

  await db.prepare(`
    INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, userId, tokenHash, expiresAt, new Date(now).toISOString()).run();

  // Mantener como máximo 5 sesiones activas por usuario.
  await db.prepare(`
    DELETE FROM sessions
    WHERE user_id = ?
      AND id NOT IN (
        SELECT id FROM sessions
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT 5
      )
  `).bind(userId, userId).run();

  return rawToken;
}

async function getFriendship(db, userA, userB) {
  return db.prepare(`
    SELECT id, requester_id, addressee_id, status, created_at, updated_at
    FROM friendships
    WHERE (requester_id = ? AND addressee_id = ?)
       OR (requester_id = ? AND addressee_id = ?)
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(userA, userB, userB, userA).first();
}

async function touchLastSeen(db, userId) {
  try {
    await db.prepare(
      "UPDATE users SET last_seen_at = ? WHERE id = ?"
    ).bind(new Date().toISOString(), userId).run();
  } catch (error) {
    console.warn("Could not update last_seen_at:", error);
  }
}

// Migración D1 (ejecutar ANTES de desplegar):
//   ALTER TABLE users ADD COLUMN cover_url TEXT;
//   CREATE TABLE IF NOT EXISTS user_libraries (
//     user_id TEXT PRIMARY KEY,
//     library_json TEXT NOT NULL DEFAULT '[]',
//     updated_at TEXT NOT NULL
//   );
//   CREATE TABLE IF NOT EXISTS recovery_codes (
//     user_id TEXT PRIMARY KEY,
//     code_hash TEXT NOT NULL,
//     created_at TEXT NOT NULL
//   );
function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name ?? user.displayName ?? user.username,
    avatarUrl: user.avatar_url ?? user.avatarUrl ?? null,
    coverUrl: user.cover_url ?? user.coverUrl ?? null,
    bio: user.bio ?? null,
    libraryVisibility: user.library_visibility ?? "friends",
    createdAt: user.created_at ?? user.createdAt ?? null,
    lastSeenAt: user.last_seen_at ?? user.lastSeenAt ?? null,
  };
}

function normalizeUsername(value) {
  if (typeof value !== "string") {
    return { valid: false, error: "Username is required" };
  }

  const username = value.trim().toLowerCase();

  if (username.length < 3 || username.length > 24) {
    return { valid: false, error: "Username must contain between 3 and 24 characters" };
  }

  if (!/^[a-z0-9_]+$/.test(username)) {
    return {
      valid: false,
      error: "Username can contain only letters, numbers and underscores",
    };
  }

  return { valid: true, value: username };
}

async function readJsonBody(request, options = {}) {
  const maxBytes = options.maxBytes || AUTH.maxBodyBytes;
  const allowArray = options.allowArray === true;
  const contentLength = Number(request.headers.get("Content-Length") || 0);

  if (contentLength > maxBytes) {
    return {
      ok: false,
      response: jsonResponse({ success: false, error: "Request body is too large" }, 413),
    };
  }

  let text;

  try {
    text = await request.text();
  } catch {
    return {
      ok: false,
      response: jsonResponse({ success: false, error: "Invalid request body" }, 400),
    };
  }

  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return {
      ok: false,
      response: jsonResponse({ success: false, error: "Request body is too large" }, 413),
    };
  }

  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || (!allowArray && Array.isArray(data))) {
      throw new Error("Invalid object");
    }
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      response: jsonResponse({ success: false, error: "Invalid JSON body" }, 400),
    };
  }
}

async function hashPassword(password, salt) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: AUTH.passwordIterations,
      hash: "SHA-256",
    },
    baseKey,
    256
  );

  return bytesToBase64(new Uint8Array(bits));
}

async function sha256(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return bytesToBase64(new Uint8Array(digest));
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function randomToken(byteLength) {
  return bytesToBase64Url(randomBytes(byteLength));
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function timingSafeEqualString(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;

  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);

  if (aBytes.length !== bBytes.length) return false;

  return crypto.subtle.timingSafeEqual
    ? crypto.subtle.timingSafeEqual(aBytes, bBytes)
    : constantTimeEqual(aBytes, bBytes);
}

function constantTimeEqual(a, b) {
  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }

  return result === 0;
}

function getBearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function methodNotAllowed(methods) {
  return jsonResponse(
    {
      success: false,
      error: "Method not allowed",
    },
    405,
    {
      Allow: methods.join(", "),
    }
  );
}

function databaseNotConfigured() {
  return jsonResponse(
    {
      success: false,
      error: "Database is not configured",
    },
    503
  );
}

// ======================================================
// DUAL CACHE: L1 (MEMORIA) + L2 (KV PERSISTENTE)
// ======================================================

const memoryCache = new Map();

async function withCache(env, cacheKey, ttlSeconds, fetcherFn) {
  const now = Date.now();

  // 1. Memoria rápida del isolate (L1 Cache - ~1ms)
  const mem = memoryCache.get(cacheKey);
  if (mem && (now - mem.timestamp < ttlSeconds * 1000)) {
    return { data: mem.data, hit: true, source: "MEMORY" };
  }

  // 2. KV persistente de Cloudflare (L2 Cache - ~10ms)
  const kv = env.CACHE || globalThis.CACHE;
  if (kv) {
    try {
      const cached = await kv.get(cacheKey, { type: "json" });
      if (cached) {
        memoryCache.set(cacheKey, { data: cached, timestamp: now });
        return { data: cached, hit: true, source: "KV" };
      }
    } catch (err) {
      console.warn("KV read error:", err);
    }
  }

  // 3. Ejecutar llamada externa si no estaba en caché
  const freshData = await fetcherFn();

  if (freshData && freshData.success !== false && freshData.status !== "error") {
    // Guardar en memoria L1
    memoryCache.set(cacheKey, { data: freshData, timestamp: now });

    // Guardar en KV L2
    if (kv) {
      try {
        await kv.put(cacheKey, JSON.stringify(freshData), {
          expirationTtl: ttlSeconds,
        });
      } catch (err) {
        console.warn("KV write error:", err);
      }
    }
  }

  return { data: freshData, hit: false, source: "NETWORK" };
}

// ======================================================
// CONFIGURACIÓN DE RATE LIMIT
// ======================================================

const RATE_LIMIT = {
  maxRequests: 40,
  windowMs: 60 * 1000,
};

const rateLimitStore = new Map();

function checkRateLimit(identifier) {
  const now = Date.now();
  let entry = rateLimitStore.get(identifier);

  if (!entry || now - entry.start > RATE_LIMIT.windowMs) {
    entry = { start: now, count: 0 };
    rateLimitStore.set(identifier, entry);
  }

  entry.count++;

  if (entry.count > RATE_LIMIT.maxRequests) {
    const retryAfter = Math.max(
      1,
      Math.ceil((RATE_LIMIT.windowMs - (now - entry.start)) / 1000)
    );
    return { allowed: false, retryAfter };
  }

  return { allowed: true, retryAfter: 0 };
}

// ======================================================
// VALIDACIÓN DEL TITLE
// ======================================================

function getValidatedTitle(url) {
  const rawTitle = url.searchParams.get("title");
  if (!rawTitle) return { valid: false, error: "Missing title parameter" };
  const title = rawTitle.trim();
  if (!title) return { valid: false, error: "Title cannot be empty" };
  if (title.length > 150) return { valid: false, error: "Title is too long" };
  return { valid: true, title };
}

// ======================================================
// IGDB
// ======================================================

async function handleGameRequest(url, env) {
  const validation = getValidatedTitle(url);
  if (!validation.valid) {
    return jsonResponse({ success: false, error: validation.error }, 400);
  }

  const title = validation.title;
  if (!env.IGDB_CLIENT_ID || !env.IGDB_CLIENT_SECRET) {
    return jsonResponse({ success: false, error: "IGDB credentials are not configured" }, 500);
  }

  const cacheKey = `igdb:v2:${title.toLowerCase()}`;
  // 7 días de caché
  const { data, hit, source } = await withCache(env, cacheKey, 60 * 60 * 24 * 7, async () => {
    try {
      const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.IGDB_CLIENT_ID,
          client_secret: env.IGDB_CLIENT_SECRET,
          grant_type: "client_credentials",
        }),
      });

      if (!tokenResponse.ok) {
        return { success: false, error: "Failed to obtain IGDB access token" };
      }

      const tokenData = await tokenResponse.json();
      if (!tokenData.access_token) {
        return { success: false, error: "IGDB access token was not returned" };
      }

      const igdbQuery = `
        search "${escapeIGDBString(title)}";
        fields
          id,
          name,
          summary,
          storyline,
          first_release_date,
          rating,
          aggregated_rating,
          cover.url,
          genres.name,
          platforms.name,
          involved_companies.company.name,
          involved_companies.publisher,
          involved_companies.developer,
          screenshots.url,
          artworks.url,
          websites.url,
          websites.category,
          videos.video_id,
          videos.name;
        limit 10;
      `;

      const gameResponse = await fetch("https://api.igdb.com/v4/games", {
        method: "POST",
        headers: {
          "Client-ID": env.IGDB_CLIENT_ID,
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "text/plain",
        },
        body: igdbQuery,
      });

      if (!gameResponse.ok) {
        return { success: false, error: "IGDB request failed" };
      }

      const games = await gameResponse.json();
      return {
        success: true,
        query: title,
        count: Array.isArray(games) ? games.length : 0,
        games,
      };
    } catch (error) {
      console.error("IGDB error:", error);
      return { success: false, error: "Failed to communicate with IGDB" };
    }
  });

  return jsonResponse(data, 200, {
    "X-Cache-Status": hit ? `HIT (${source})` : "MISS",
    "Cache-Control": "public, max-age=86400",
  });
}

// ======================================================
// STEAMGRIDDB
// ======================================================

async function handleSteamGridRequest(url, env) {
  const validation = getValidatedTitle(url);
  if (!validation.valid) {
    return jsonResponse({ success: false, error: validation.error }, 400);
  }

  const title = validation.title;
  if (!env.STEAMGRID_API_KEY) {
    return jsonResponse({ success: false, error: "SteamGridDB API key is not configured" }, 500);
  }

  const cacheKey = `steamgrid:v2:${title.toLowerCase()}`;
  // 7 días de caché
  const { data, hit, source } = await withCache(env, cacheKey, 60 * 60 * 24 * 7, async () => {
    try {
      const searchResponse = await fetch(
        `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(title)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${env.STEAMGRID_API_KEY}`,
            Accept: "application/json",
          },
        }
      );

      if (!searchResponse.ok) {
        return { success: false, error: "SteamGridDB search failed" };
      }

      const searchData = await searchResponse.json();
      const games = Array.isArray(searchData.data) ? searchData.data : [];

      if (games.length === 0 || !games[0].id) {
        return {
          success: true,
          query: title,
          game: games[0] || null,
          grids: [],
          heroes: [],
          logos: [],
        };
      }

      const game = games[0];
      const headers = {
        Authorization: `Bearer ${env.STEAMGRID_API_KEY}`,
        Accept: "application/json",
      };

      // Grids en todas las dimensiones que usan los filtros del frontend
      // (cápsula vertical 2:3/22:31, cuadrada 1:1 y ancha 92:43). Pedir solo
      // 600x900 dejaba vacíos los filtros de cuadradas y la pestaña ancha.
      const gridDimensions = "600x900,342x482,660x930,512x512,1024x1024,920x430,460x215";
      const [gridsResponse, heroesResponse, logosResponse] = await Promise.all([
        fetch(`https://www.steamgriddb.com/api/v2/grids/game/${game.id}?dimensions=${gridDimensions}`, { headers }),
        fetch(`https://www.steamgriddb.com/api/v2/heroes/game/${game.id}`, { headers }),
        fetch(`https://www.steamgriddb.com/api/v2/logos/game/${game.id}`, { headers }),
      ]);

      const [gridsData, heroesData, logosData] = await Promise.all([
        safeJson(gridsResponse),
        safeJson(heroesResponse),
        safeJson(logosResponse),
      ]);

      return {
        success: true,
        query: title,
        game,
        grids: Array.isArray(gridsData?.data) ? gridsData.data : [],
        heroes: Array.isArray(heroesData?.data) ? heroesData.data : [],
        logos: Array.isArray(logosData?.data) ? logosData.data : [],
      };
    } catch (error) {
      console.error("SteamGridDB error:", error);
      return { success: false, error: "Failed to communicate with SteamGridDB" };
    }
  });

  return jsonResponse(data, 200, {
    "X-Cache-Status": hit ? `HIT (${source})` : "MISS",
    "Cache-Control": "public, max-age=86400",
  });
}

// ======================================================
// RAWG
// ======================================================

async function handleRawgRequest(url, env) {
  const validation = getValidatedTitle(url);
  if (!validation.valid) {
    return jsonResponse({ success: false, error: validation.error }, 400);
  }

  const title = validation.title;
  if (!env.RAWG_API_KEY) {
    return jsonResponse({ success: false, error: "RAWG API key is not configured" }, 500);
  }

  const cacheKey = `rawg:${title.toLowerCase()}`;
  // 7 días de caché
  const { data, hit, source } = await withCache(env, cacheKey, 60 * 60 * 24 * 7, async () => {
    try {
      const searchRes = await fetch(
        `https://api.rawg.io/api/games?search=${encodeURIComponent(
          title
        )}&search_precise=true&page_size=1&key=${encodeURIComponent(env.RAWG_API_KEY)}`
      );

      if (!searchRes.ok) {
        return { success: false, error: "RAWG search failed" };
      }

      const searchData = await searchRes.json();
      const game = searchData?.results?.[0];

      if (!game?.id) {
        return {
          success: true,
          query: title,
          game: null,
          screenshots: [],
          movies: [],
        };
      }

      const [detailsRes, screenshotsRes, moviesRes] = await Promise.all([
        fetch(`https://api.rawg.io/api/games/${game.id}?key=${encodeURIComponent(env.RAWG_API_KEY)}`),
        fetch(`https://api.rawg.io/api/games/${game.id}/screenshots?page_size=20&key=${encodeURIComponent(env.RAWG_API_KEY)}`),
        fetch(`https://api.rawg.io/api/games/${game.id}/movies?key=${encodeURIComponent(env.RAWG_API_KEY)}`),
      ]);

      const [details, screenshotsData, moviesData] = await Promise.all([
        safeJson(detailsRes),
        safeJson(screenshotsRes),
        safeJson(moviesRes),
      ]);

      const screenshots = Array.isArray(screenshotsData?.results)
        ? screenshotsData.results
          .filter((s) => s?.image)
          .map((s) => ({
            id: s.id,
            image: s.image,
            width: s.width || 0,
            height: s.height || 0,
            is_deleted: Boolean(s.is_deleted),
          }))
        : [];

      const movies = Array.isArray(moviesData?.results)
        ? moviesData.results
          .filter((m) => m?.data?.max || m?.data?.["480"])
          .map((m) => ({
            id: m.id,
            name: m.name || "",
            preview: m.preview || "",
            mp4_max: m.data?.max || "",
            mp4_480: m.data?.["480"] || "",
          }))
        : [];

      return {
        success: true,
        query: title,
        game: details || null,
        screenshots,
        movies,
      };
    } catch (error) {
      console.error("RAWG error:", error);
      return { success: false, error: "Failed to communicate with RAWG" };
    }
  });

  return jsonResponse(data, 200, {
    "X-Cache-Status": hit ? `HIT (${source})` : "MISS",
    "Cache-Control": "public, max-age=86400",
  });
}

// ======================================================
// NOTICIAS (NEWSAPI)
// ======================================================

async function handleNewsRequest(url, env) {
  if (!env.NEWS_API_KEY) {
    return jsonResponse({ status: "error", message: "News API key is not configured" }, 500);
  }

  const q = url.searchParams.get("q") || "videojuegos gaming";
  const pageSize = url.searchParams.get("pageSize") || "10";
  const cacheKey = `news:${q.toLowerCase()}:${pageSize}`;

  // 1 hora de caché
  const { data, hit, source } = await withCache(env, cacheKey, 3600, async () => {
    try {
      const newsUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(
        q
      )}&sortBy=publishedAt&pageSize=${encodeURIComponent(
        pageSize
      )}&apiKey=${encodeURIComponent(env.NEWS_API_KEY)}`;

      const response = await fetch(newsUrl, {
        headers: { "User-Agent": "WPS5-Console/1.0" },
      });

      if (!response.ok) {
        return { status: "error", message: `NewsAPI request failed: ${response.status}` };
      }

      return await response.json();
    } catch (error) {
      console.error("NewsAPI error:", error);
      return { status: "error", message: "Failed to communicate with NewsAPI" };
    }
  });

  return jsonResponse(data, 200, {
    "X-Cache-Status": hit ? `HIT (${source})` : "MISS",
    "Cache-Control": "public, max-age=3600",
  });
}

// ======================================================
// HELPERS
// ======================================================

async function safeJson(response) {
  try {
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function escapeIGDBString(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}

function jsonResponse(data, status = 200, additionalHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
      ...additionalHeaders,
    },
  });
}
