const ThirdPartyFormSubmission = require("../models/thirdPartyFormSubmission");
const ImapFlow = (() => { try { return require('imapflow'); } catch (_) { return null; } })();
const { logMe } = require('./logger');

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
  // Some providers include <> around Message-ID. Match both normalized and bracketed forms.
  const rid = String(replyMessageId);
  const ridBracketed = rid.startsWith('<') && rid.endsWith('>') ? rid : `<${rid}>`;
  const ridPlain = rid.replace(/[<>]/g, '');
  const candidates = [rid, ridBracketed, ridPlain];
  const tpr = await ThirdPartyFormSubmission.findOne({
    $or: [
      { 'verification.employer.lastSentMessageId': { $in: candidates } },
      { 'verification.reference.lastSentMessageId': { $in: candidates } },
      { 'verification.combined.lastSentMessageId': { $in: candidates } },
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
    pass: process.env.IMAP_PASS || process.env.IMAP_PASSWORD || process.env.ZOHO_APP_PASSWORD,
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
    logMe('tpr_imap.poll_skipped_running', {}, 'debug');
    return { processed: 0, scanned: 0, matched: 0 };
  }
  const cfg = resolveImapConfigFromEnv();
  if (!cfg.host || !cfg.port || !cfg.user || !cfg.pass) {
    logMe('tpr_imap.disabled_missing_config', {}, 'warn');
    return { processed: 0, scanned: 0, matched: 0 };
  }
  let client = null;
  
  try {
    // Create client with timeout settings
    client = new ImapFlow({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      logger: false,
      // Add timeout settings to prevent hanging
      socketTimeout: 30000, // 30 seconds
      greetingTimeout: 10000, // 10 seconds
      connectionTimeout: 10000, // 10 seconds
    });

    // Add error handlers to prevent crashes
    client.on('error', (err) => {
      logMe('tpr_imap.client_error', { message: err.message }, 'error');
      // Don't throw, just log and continue
    });

    // Connect with timeout
    await Promise.race([
      client.connect(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 15000)
      )
    ]);
    
    logMe('tpr_imap.connected', {}, 'debug');
    const mailbox = cfg.label || 'INBOX';
    await client.mailboxOpen(mailbox);
    logMe('tpr_imap.mailbox_opened', { mailbox }, 'debug');

    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const onlyUnseen = (process.env.IMAP_ONLY_UNSEEN || 'false').toLowerCase() === 'true';
    const criteria = onlyUnseen ? { seen: false, since } : { since };
    const allUids = await client.search(criteria);
    const uids = allUids.slice(-300);
    logMe('tpr_imap.search_result', { count: uids.length, onlyUnseen, since: since.toISOString() }, 'debug');

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
        logMe('tpr_imap.uid_subject', { uid, subject }, 'debug');
        logMe('tpr_imap.uid_to', { uid, to: toHdr }, 'debug');
        logMe('tpr_imap.uid_delivered_to', { uid, deliveredTo: deliveredHdr }, 'debug');
        logMe('tpr_imap.uid_cc', { uid, cc: ccHdr }, 'debug');
        logMe('tpr_imap.uid_in_reply_to', { uid, inReplyTo: inReplyToHdr }, 'debug');
        logMe('tpr_imap.uid_references', { uid, references: referencesHdr }, 'debug');
      }

      // 1) Plus-address
      const addrFields = [toHdr, deliveredHdr, ccHdr].filter(Boolean).join(',');
      const plusMatch = addrFields.match(/\+tpr-([A-Za-z0-9]+)/i);
      if (plusMatch) {
        const token = plusMatch[1];
        const r = await markVerifiedByToken(token, raw.substring(0, 10000));
        if (r.ok) {
          logMe('tpr_imap.plus_address_match', { token, uid, target: r.target }, 'debug');
          try { await client.messageFlagsAdd(uid, ['\\Seen']); } catch (e) { logMe('tpr_imap.flag_add_failed', { uid, message: e.message }, 'warn'); }
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
          try { await client.messageFlagsAdd(uid, ['\\Seen']); } catch (e) { logMe('tpr_imap.flag_add_failed', { uid, message: e.message }, 'warn'); }
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
         // console.log(`[TPR-IMAP] Found Ref Code token=${token} in uid=${uid} → ${r.target} verified`);
          try { await client.messageFlagsAdd(uid, ['\\Seen']); } catch (e) { logMe('tpr_imap.flag_add_failed', { uid, message: e.message }, 'warn'); }
          summary.matched++; summary.matchBreakdown.token++; summary.processed++;
          continue;
        }
      }

      if (DEBUG) logMe('tpr_imap.no_match', { uid }, 'debug');
    }

    logMe('tpr_imap.poll_complete', summary, 'debug');
    return summary;
  } catch (err) {
    logMe('tpr_imap.error', { message: err.message }, 'error');
    // Don't crash the server - just return empty summary
    return { processed: 0, errors: 0, details: [] };
  } finally {
    if (client) {
      try { 
        await Promise.race([
          client.logout(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Logout timeout')), 5000))
        ]);
        logMe('tpr_imap.logged_out', {}, 'debug'); 
      } catch (e) { 
        logMe('tpr_imap.logout_failed', { message: e.message }, 'warn');
        // Force close if logout fails
        try { client.close(); } catch (_) {}
      }
    }
    isPolling = false;
  }
}

async function pollTPRForApplication(applicationId) {
  // Short-circuit if already verified or no ref code
  const tpr = await ThirdPartyFormSubmission.findOne({ applicationId }).sort({ createdAt: -1 });
  if (!tpr) return { verified: false, found: false, reason: 'no_tpr' };
  if (tpr.verificationStatus === 'verified') return { verified: true, found: true, shortCode: tpr.verification?.shortCode, reason: 'db_verified' };
  const sharedShort = tpr.verification?.shortCode || '';

  if (!sharedShort) return { verified: false, found: false, reason: 'no_ref_code' };

  const cfg = resolveImapConfigFromEnv();
  if (!cfg.host || !cfg.port || !cfg.user || !cfg.pass) return { verified: false, found: false, reason: 'imap_not_configured' };
  let ImapFlow; try { ImapFlow = require('imapflow').ImapFlow; } catch { return { verified: false, found: false, reason: 'imapflow_missing' }; }

  let client = null;
  try {
    client = new ImapFlow({ 
      host: cfg.host, 
      port: cfg.port, 
      secure: cfg.secure, 
      auth: { user: cfg.user, pass: cfg.pass }, 
      logger: false,
      // Add timeout settings
      socketTimeout: 30000,
      greetingTimeout: 10000,
      connectionTimeout: 10000,
    });

    // Add error handler
    client.on('error', (err) => {
      logMe('tpr_imap.app_client_error', { message: err.message }, 'error');
    });

    // Connect with timeout
    await Promise.race([
      client.connect(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 15000)
      )
    ]);

    await client.mailboxOpen(cfg.label || 'INBOX');
    const allUids = await client.search({});
    if (!allUids || allUids.length === 0) return { verified: false, found: false, shortCode: sharedShort, reason: 'no_mail' };
    const newestFirst = allUids.slice(-10).sort((a,b) => b - a); // last 10, newest first by UID

   for await (const msg of client.fetch(newestFirst, { uid: true, envelope: true, headers: true })) {
      const uid = msg.uid;
      const subject = (msg.envelope && msg.envelope.subject) || headerFromAny(msg.headers, 'subject') || '';
      const inReplyToHdr = headerFromAny(msg.headers, 'in-reply-to') || '';
      const referencesHdr = headerFromAny(msg.headers, 'references') || '';
      const isReply = /^\s*re\s*:/i.test(subject) || Boolean(inReplyToHdr || referencesHdr);
      const subjShort = (subject.match(/\b(\d{6})\b/) || [])[1];
 
     if (subjShort === sharedShort && isReply) {
        await ThirdPartyFormSubmission.findByIdAndUpdate(tpr._id, { $set: { verificationStatus: 'verified', 'verification.employer.status': 'verified', 'verification.employer.verifiedAt': new Date() } });

       return { verified: true, found: true, shortCode: sharedShort, reason: 'matched_recent' };
      }
    }
   
    return { verified: false, found: false, shortCode: sharedShort, reason: 'no_recent_match' };
  } catch (e) {
    logMe('tpr_imap.app_poll_error', { message: e.message }, 'warn');
    return { verified: false, found: false, shortCode: sharedShort, reason: 'imap_error', error: e.message };
  } finally {
    if (client) {
      try { 
        await Promise.race([
          client.logout(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Logout timeout')), 5000))
        ]);
      } catch (e) { 
        logMe('tpr_imap.app_logout_failed', { message: e.message }, 'warn');
        try { client.close(); } catch (_) {}
      }
    }
  }
}

module.exports = { pollTPRInbox, pollTPRForApplication };
