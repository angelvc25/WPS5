'use strict';

/**
 * Centraliza el ciclo de vida de una sesión de juego en WPS5.
 * No lanza ni termina procesos: Electron main sigue siendo responsable de
 * los launchers, watchers y procesos nativos. Este servicio mantiene un
 * único estado coherente y evita finalizar dos veces la misma sesión.
 */
class GameSessionManager {
  constructor() {
    this.activeSession = null;
    this.lastSession = null;
    this.sequence = 0;
  }

  hasActiveSession() {
    return Boolean(this.activeSession && !['finished', 'error'].includes(this.activeSession.status));
  }

  getActiveSession() {
    return this.activeSession ? { ...this.activeSession } : null;
  }

  getLastSession() {
    return this.lastSession ? { ...this.lastSession } : null;
  }

  startSession(metadata = {}) {
    if (this.hasActiveSession()) {
      return {
        success: false,
        error: 'game-already-running',
        session: this.getActiveSession(),
      };
    }

    const now = Date.now();
    const session = {
      sessionId: ++this.sequence,
      id: metadata.id ?? null,
      title: metadata.title || 'Juego',
      image: metadata.image || null,
      source: String(metadata.source || 'unknown').toLowerCase(),
      appId: metadata.appId ?? null,
      installDir: metadata.installDir || null,
      packageFamilyName: metadata.packageFamilyName || null,
      nativePid: metadata.nativePid ?? null,
      status: 'starting',
      createdAt: now,
      startedAt: null,
      endedAt: null,
      endReason: null,
    };

    this.activeSession = session;
    return { success: true, session: this.getActiveSession() };
  }

  updateSession(patch = {}) {
    if (!this.activeSession) return null;
    // Los campos de ciclo de vida no se pueden sobrescribir accidentalmente.
    const safePatch = { ...patch };
    delete safePatch.sessionId;
    delete safePatch.createdAt;
    delete safePatch.endedAt;
    this.activeSession = { ...this.activeSession, ...safePatch };
    return this.getActiveSession();
  }

  markRunning(patch = {}) {
    if (!this.activeSession || ['finished', 'error'].includes(this.activeSession.status)) return null;
    this.activeSession = {
      ...this.activeSession,
      ...patch,
      status: 'running',
      startedAt: this.activeSession.startedAt || Date.now(),
    };
    return this.getActiveSession();
  }

  markClosing() {
    if (!this.activeSession || ['finished', 'error'].includes(this.activeSession.status)) return null;
    this.activeSession.status = 'closing';
    return this.getActiveSession();
  }

  finish(reason = 'process-exited', details = {}) {
    if (!this.activeSession || ['finished', 'error'].includes(this.activeSession.status)) {
      return { success: false, session: this.getActiveSession() };
    }

    const completed = {
      ...this.activeSession,
      ...details,
      status: 'finished',
      endedAt: Date.now(),
      endReason: reason,
    };
    this.lastSession = completed;
    this.activeSession = null;
    return { success: true, session: { ...completed } };
  }

  fail(reason = 'launch-failed', details = {}) {
    if (!this.activeSession || ['finished', 'error'].includes(this.activeSession.status)) {
      return { success: false, session: this.getActiveSession() };
    }

    const failed = {
      ...this.activeSession,
      ...details,
      status: 'error',
      endedAt: Date.now(),
      endReason: reason,
    };
    this.lastSession = failed;
    this.activeSession = null;
    return { success: true, session: { ...failed } };
  }
}

module.exports = GameSessionManager;
