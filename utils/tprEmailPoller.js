const ThirdPartyFormSubmission = require("../models/thirdPartyFormSubmission");

let isPolling = false;

function computeAggregateStatus(doc) {
  const statuses = [
    doc.verification?.employer?.status,
    doc.verification?.reference?.status,
    doc.isSameEmail ? doc.verification?.combined?.status : undefined,
  ].filter(Boolean);
  if (statuses.some(s => s === 'verified')) return 'verified';
  if (statuses.some(s => s === 'rejected')) return 'rejected';
  if (statuses.length && statuses.every(s => s === 'not_sent')) return 'none';
  return 'pending';
}

async function markVerifiedByToken(token, responseContent) {
  const tpr = await ThirdPartyFormSubmission.findOne({
    $or: [
      { 'verification.employer.token': token },
      { 'verification.reference.token': token },
      { 'verification.combined.token': token },
    ],
  });
  if (!tpr) return { ok: false };
  const target = tpr.verification?.employer?.token === token ? 'employer' :
                 tpr.verification?.reference?.token === token ? 'reference' : 'combined';
  const setObj = {};
  setObj[`verification.${target}.responseContent`] = responseContent || '';
  setObj[`verification.${target}.status`] = 'verified';
  setObj[`verification.${target}.verifiedAt`] = new Date();
  await ThirdPartyFormSubmission.findByIdAndUpdate(tpr._id, { $set: setObj });

  const updated = await ThirdPartyFormSubmission.findById(tpr._id);
  const aggregate = computeAggregateStatus(updated);
  await ThirdPartyFormSubmission.findByIdAndUpdate(tpr._id, { $set: { verificationStatus: aggregate } });
  return { ok: true, target, tprId: tpr._id };
}

async function markVerifiedByMessageId(replyMessageId, responseContent) {
  if (!replyMessageId) return { ok: false };
  const tpr = await ThirdPartyFormSubmission.findOne({
    $or: [
      { 'verification.employer.lastSentMessageId': replyMessageId },
      { 'verification.reference.lastSentMessageId': replyMessageId },
      { 'verification.combined.lastSentMessageId': replyMessageId },
    ],
  });
  if (!tpr) return { ok: false };
  let target = 'combined';
  if (tpr.verification?.employer?.lastSentMessageId === replyMessageId) target = 'employer';
  else if (tpr.verification?.reference?.lastSentMessageId === replyMessageId) target = 'reference';
  const setObj = {};
  setObj[`verification.${target}.responseContent`] = responseContent || '';
  setObj[`verification.${target}.status`] = 'verified';
  setObj[`verification.${target}.verifiedAt`] = new Date();
  await ThirdPartyFormSubmission.findByIdAndUpdate(tpr._id, { $set: setObj });

  const updated = await ThirdPartyFormSubmission.findById(tpr._id);
  const aggregate = computeAggregateStatus(updated);
  await ThirdPartyFormSubmission.findByIdAndUpdate(tpr._id, { $set: { verificationStatus: aggregate } });
  return { ok: true, target, tprId: tpr._id };
}

function resolveImapConfigFromEnv() {
  const provider = (process.env.EMAIL_PROVIDER || '').toLowerCase();
  if (provider === 'gmail') {
    return {
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
      label: process.env.GMAIL_LABEL || 'INBOX',
    };
  }
  return {
    host: process.env.IMAP_HOST,
    port: Number(process.env.IMAP_PORT),
    secure: process.env.IMAP_TLS !== 'false',
    user: process.env.IMAP_USER,
    pass: process.env.IMAP_PASS,
    label: process.env.IMAP_LABEL || 'INBOX',
  };
}

function parseHeaders(raw) {
  const headers = {};
  const lines = raw.split(/\r?\n/);
  let lastKey = null;
  for (const line of lines) {
    if (/^\s/.test(line) && lastKey) {
      headers[lastKey] += ' ' + line.trim();
      continue;
    };
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (m) {
      lastKey = m[1].toLowerCase();
      headers[lastKey] = m[2].trim();
    }
  }
  return headers;
}

function headerFromAny(headers, name) {
  if (!headers) return '';
  const want = name.toLowerCase();
  if (typeof headers.get === 'function') {
    const v = headers.get(name) || headers.get(want) || headers.get(name.toUpperCase());
    if (v == null) return '';
    return Array.isArray(v) ? v.join(', ') : String(v);
  }
  if (typeof headers === 'object') {
    let v = headers[name] || headers[want] || headers[name.toUpperCase()];
    if (v == null) {
      const foundKey = Object.keys(headers).find(k => k.toLowerCase() === want);
      if (foundKey) v = headers[foundKey];
    }
    if (v == null) return '';
    return Array.isArray(v) ? v.join(', ') : String(v);
  }
  return '';
}

async function streamToString(stream) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

async function pollTPRInbox() {
  if (isPolling) {
    console.log('[TPR-IMAP] Poll skipped: already running');
    return { processed: 0, scanned: 0, matched: 0 };
  }
  const cfg = resolveImapConfigFromEnv();
  if (!cfg.host || !cfg.port || !cfg.user || !cfg.pass) {
    console.log('[TPR-IMAP] Disabled: missing IMAP configuration');
    return { processed: 0, scanned: 0, matched: 0 };
  }
  let ImapFlow;
  try {
    ImapFlow = require('imapflow').ImapFlow;
  } catch (e) {
    console.warn('[TPR-IMAP] Disabled: imapflow not installed');
    return { processed: 0, scanned: 0, matched: 0 };
  }
  const DEBUG = (process.env.TPR_IMAP_DEBUG || 'false').toLowerCase() === 'true';
  isPolling = true;
  console.log(`[TPR-IMAP] Connecting to ${cfg.host} as ${cfg.user}`);
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });
  const summary = { processed: 0, scanned: 0, matched: 0, matchBreakdown: { plus: 0, thread: 0, token: 0 } };
  try {
    await client.connect();
    console.log('[TPR-IMAP] Connected');
    const mailbox = cfg.label || 'INBOX';
    await client.mailboxOpen(mailbox);
    console.log(`[TPR-IMAP] Opened mailbox: ${mailbox}`);

    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const onlyUnseen = (process.env.IMAP_ONLY_UNSEEN || 'false').toLowerCase() === 'true';
    const criteria = onlyUnseen ? { seen: false, since } : { since };
    const allUids = await client.search(criteria);
    const uids = allUids.slice(-300);
    console.log(`[TPR-IMAP] Found ${uids.length} messages (criteria: ${onlyUnseen ? 'unseen,' : ''} since ${since.toISOString()})`);

    for await (const msg of client.fetch(uids, { uid: true, envelope: true, flags: true, source: true, headers: true })) {
      const uid = msg.uid;
      summary.scanned++;
      let raw = '';
      if (Buffer.isBuffer(msg.source)) raw = msg.source.toString('utf8');
      else if (msg.source && typeof msg.source.on === 'function') raw = await streamToString(msg.source);

      const subject = (msg.envelope && msg.envelope.subject) || headerFromAny(msg.headers, 'subject') || '';
      const toHdr = headerFromAny(msg.headers, 'to') || '';
      const deliveredHdr = headerFromAny(msg.headers, 'delivered-to') || '';
      const ccHdr = headerFromAny(msg.headers, 'cc') || '';
      const inReplyToHdr = headerFromAny(msg.headers, 'in-reply-to') || '';
      const referencesHdr = headerFromAny(msg.headers, 'references') || '';

      if (DEBUG) {
        console.log(`[TPR-IMAP][UID ${uid}] Subject: ${subject}`);
        console.log(`[TPR-IMAP][UID ${uid}] To: ${toHdr}`);
        console.log(`[TPR-IMAP][UID ${uid}] Delivered-To: ${deliveredHdr}`);
        console.log(`[TPR-IMAP][UID ${uid}] Cc: ${ccHdr}`);
        console.log(`[TPR-IMAP][UID ${uid}] In-Reply-To: ${inReplyToHdr}`);
        console.log(`[TPR-IMAP][UID ${uid}] References: ${referencesHdr}`);
      }

      // 1) Plus-address
      const addrFields = [toHdr, deliveredHdr, ccHdr].filter(Boolean).join(',');
      const plusMatch = addrFields.match(/\+tpr-([A-Za-z0-9]+)/i);
      if (plusMatch) {
        const token = plusMatch[1];
        const r = await markVerifiedByToken(token, raw.substring(0, 10000));
        if (r.ok) {
          console.log(`[TPR-IMAP] Matched plus-address token=${token} in uid=${uid} → ${r.target} verified`);
          await client.messageFlagsAdd(uid, ['\\Seen']);
          summary.matched++; summary.matchBreakdown.plus++; summary.processed++;
          continue;
        }
      }

      // 2) Thread headers
      const refIds = (inReplyToHdr + ' ' + referencesHdr).match(/<[^>]+>/g) || [];
      let matchedByRef = false;
      for (const rid of refIds.map(s => s.replace(/[<>]/g, ''))) {
        const r = await markVerifiedByMessageId(rid, raw.substring(0, 10000));
        if (r.ok) {
          console.log(`[TPR-IMAP] Matched by References/In-Reply-To ${rid} in uid=${uid} → ${r.target} verified`);
          await client.messageFlagsAdd(uid, ['\\Seen']);
          summary.matched++; summary.matchBreakdown.thread++; summary.processed++; matchedByRef = true; break;
        }
      }
      if (matchedByRef) continue;

      // 3) Fallback token in subject/body
      const tokenMatch = (subject + '\n' + raw).match(/TPR-([A-Za-z0-9]+)/);
      if (tokenMatch) {
        const token = tokenMatch[1];
        const r = await markVerifiedByToken(token, raw.substring(0, 10000));
        if (r.ok) {
          console.log(`[TPR-IMAP] Found Ref Code token=${token} in uid=${uid} → ${r.target} verified`);
          await client.messageFlagsAdd(uid, ['\\Seen']);
          summary.matched++; summary.matchBreakdown.token++; summary.processed++;
          continue;
        }
      }

      if (DEBUG) console.log(`[TPR-IMAP][UID ${uid}] No TPR match`);
    }

    console.log(`[TPR-IMAP] Poll complete. Processed ${summary.processed}/${summary.scanned}. Matches: ${summary.matched} (plus=${summary.matchBreakdown.plus}, thread=${summary.matchBreakdown.thread}, token=${summary.matchBreakdown.token})`);
    return summary;
  } catch (err) {
    console.error('[TPR-IMAP] Error:', err.message);
    return summary;
  } finally {
    try { await client.logout(); console.log('[TPR-IMAP] Logged out'); } catch (_) {}
    isPolling = false;
  }
}

module.exports = { pollTPRInbox };
