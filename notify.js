#!/usr/bin/env node
/**
 * notify.js — GitHub Actions cron script
 * Reserva Arena — Colégio Arena
 *
 * Roda a cada hora. Verifica agendamentos e envia push via FCM HTTP v1.
 *
 * Env vars necessárias (GitHub Secrets):
 *   FIREBASE_SERVICE_ACCOUNT  — JSON da service account (string)
 *   FCM_PROJECT_ID            — reserva-escolar-pcald5
 */

const https = require('https');

// ── Helpers ──────────────────────────────────────────────────────────────────

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Google OAuth2 token via service account ──────────────────────────────────

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function getAccessToken(sa) {
  const crypto = require('crypto');
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim  = base64url(Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  })));
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${claim}`);
  const sig = base64url(sign.sign(sa.private_key));
  const jwt = `${header}.${claim}.${sig}`;

  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
  const res = await httpsRequest({
    hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }, body);
  return JSON.parse(res.body).access_token;
}

// ── Firestore REST ────────────────────────────────────────────────────────────

async function firestoreGet(token, projectId, path) {
  const res = await httpsRequest({
    hostname: 'firestore.googleapis.com',
    path: `/v1/projects/${projectId}/databases/(default)/documents/${path}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
  return JSON.parse(res.body);
}

async function firestoreList(token, projectId, collection) {
  const res = await httpsRequest({
    hostname: 'firestore.googleapis.com',
    path: `/v1/projects/${projectId}/databases/(default)/documents/${collection}?pageSize=500`,
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
  return JSON.parse(res.body).documents || [];
}

// Lê campo string de doc Firestore
function str(doc, field) { return doc?.fields?.[field]?.stringValue || ''; }
function bool(doc, field) { return doc?.fields?.[field]?.booleanValue ?? true; }

// ── FCM Send ──────────────────────────────────────────────────────────────────

async function sendPush(token, projectId, fcmToken, title, body) {
  const msg = JSON.stringify({
    message: {
      token: fcmToken,
      notification: { title, body },
      webpush: {
        notification: { icon: 'https://reserva-arena.github.io/icon-192.png', badge: 'https://reserva-arena.github.io/icon-192.png', vibrate: [200,100,200] },
        fcm_options: { link: 'https://reserva-arena.github.io/' }
      }
    }
  });
  const res = await httpsRequest({
    hostname: 'fcm.googleapis.com',
    path: `/v1/projects/${projectId}/messages:send`,
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }, msg);
  return res;
}

// ── Firestore patch — salva registro de notificação enviada ──────────────────

async function salvarEnviado(token, projectId, chave) {
  const body = JSON.stringify({
    fields: {
      chave: { stringValue: chave },
      enviadoEm: { timestampValue: new Date().toISOString() }
    }
  });
  await httpsRequest({
    hostname: 'firestore.googleapis.com',
    path: `/v1/projects/${projectId}/databases/(default)/documents/notificacoes_enviadas?documentId=${encodeURIComponent(chave)}`,
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }, body);
}

async function jaEnviado(token, projectId, chave) {
  const res = await httpsRequest({
    hostname: 'firestore.googleapis.com',
    path: `/v1/projects/${projectId}/databases/(default)/documents/notificacoes_enviadas/${encodeURIComponent(chave)}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.status === 200;
}

// ── Data helpers ──────────────────────────────────────────────────────────────

// "2025-06-20" + "08:00" → Date UTC
function toDate(dataStr, horaStr) {
  const [h, m] = (horaStr || '00:00').split(':').map(Number);
  const [y, mo, d] = dataStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + 3, m)); // BRT = UTC-3
}

function diffHoras(target) {
  return (target - Date.now()) / 3600000;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const projectId = process.env.FCM_PROJECT_ID || 'reserva-escolar-pcald5';
  if (!saJson) { console.error('FIREBASE_SERVICE_ACCOUNT não definida'); process.exit(1); }

  const sa = JSON.parse(saJson);
  const token = await getAccessToken(sa);
  console.log('✅ Token OAuth2 obtido');

  // Carregar usuários e seus fcmTokens
  const usuarioDocs = await firestoreList(token, projectId, 'usuarios');
  const usuarios = {};
  for (const doc of usuarioDocs) {
    const id = doc.name.split('/').pop();
    usuarios[id] = {
      nome:     str(doc, 'nome'),
      email:    str(doc, 'email'),
      perfil:   str(doc, 'perfil'),
      fcmToken: str(doc, 'fcmToken'),
      ativo:    bool(doc, 'ativo')
    };
  }
  console.log(`👥 ${Object.keys(usuarios).length} usuários carregados`);

  // Admin tokens
  const adminTokens = Object.values(usuarios)
    .filter(u => u.perfil === 'admin' && u.fcmToken)
    .map(u => u.fcmToken);

  // Carregar reservas
  const reservaDocs = await firestoreList(token, projectId, 'reservas');
  const agora = Date.now();
  let enviados = 0;

  for (const doc of reservaDocs) {
    const id = doc.name.split('/').pop();
    const data      = str(doc, 'data');       // "2025-06-20"
    const horario   = str(doc, 'horario');    // "08:00"
    const espaco    = str(doc, 'espaco');
    const profId    = str(doc, 'professorId');
    const profNome  = str(doc, 'professor');
    const status    = str(doc, 'status') || 'aprovado';
    const reservaAuto = doc?.fields?.reservaAutomatica?.booleanValue;

    if (!data || !horario || reservaAuto) continue;

    const inicio = toDate(data, horario);
    const diff   = diffHoras(inicio);

    // Ignorar passados e muito futuros (> 8 dias)
    if (diff < 0 || diff > 8 * 24) continue;

    const prof = usuarios[profId];
    const profToken = prof?.fcmToken;

    // ── Lembretes para o PROFESSOR ──────────────────────────────────────────

    const lembretes = [
      { janela: [167, 169], label: '1sem', texto: '📅 Lembrete: você tem um agendamento em 1 semana' },
      { janela: [23, 25],   label: '1dia', texto: '⏰ Lembrete: você tem um agendamento amanhã' },
      { janela: [0.9, 1.1], label: '1h',   texto: '🔔 Lembrete: seu agendamento começa em 1 hora' },
    ];

    for (const lem of lembretes) {
      if (diff >= lem.janela[0] && diff <= lem.janela[1]) {
        const chave = `lembrete_${id}_${lem.label}`;
        if (profToken && !(await jaEnviado(token, projectId, chave))) {
          const res = await sendPush(token, projectId, profToken,
            '📚 Reserva Arena',
            `${lem.texto}\n${espaco} — ${data.split('-').reverse().join('/')} às ${horario}`
          );
          console.log(`📤 Lembrete ${lem.label} → ${profNome}: ${res.status}`);
          await salvarEnviado(token, projectId, chave);
          enviados++;
        }
      }
    }

    // ── Alerta para ADMIN: agendamento pendente < 24h ────────────────────────

    if (status === 'pendente' && diff <= 24 && diff > 0) {
      const chave = `admin_pendente_${id}`;
      if (adminTokens.length && !(await jaEnviado(token, projectId, chave))) {
        for (const adminTk of adminTokens) {
          const res = await sendPush(token, projectId, adminTk,
            '⚠️ Aprovação urgente — Reserva Arena',
            `${profNome} tem reserva em menos de 24h\n${espaco} — ${data.split('-').reverse().join('/')} às ${horario}`
          );
          console.log(`📤 Alerta admin pendente → ${res.status}`);
        }
        await salvarEnviado(token, projectId, chave);
        enviados++;
      }
    }
  }

  console.log(`✅ Concluído. ${enviados} notificações enviadas.`);
}

main().catch(err => { console.error('Erro fatal:', err); process.exit(1); });
