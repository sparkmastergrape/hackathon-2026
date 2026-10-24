// Shared request plumbing for the Mastercard service clients.
//
// Wraps the OAuth 1.0a signed fetch with three things the demo needs:
//   - per-service base URLs (each service family has its own host)
//   - JWE encryption on the endpoints that require it
//   - a dry-run mode that returns the request it *would* send
//
// Dry run is what makes the demo runnable without sandbox credentials: every
// client method returns a plan object of the same shape, so the demo script
// prints exactly the HTTP calls a credentialed run would make.

import { randomUUID } from 'node:crypto';
import { mastercardFetch } from './sign.mjs';
import { maybeEncrypt } from './jwe.mjs';

export class MastercardApiError extends Error {
  constructor(status, body, request) {
    const errors = body?.Errors?.Error ?? [];
    const detail = errors.length
      ? errors.map((e) => `${e.ReasonCode}: ${e.Description}`).join('; ')
      : typeof body === 'string'
        ? body.slice(0, 400)
        : JSON.stringify(body)?.slice(0, 400);
    super(`${request.method} ${request.path} -> ${status}${detail ? ` (${detail})` : ''}`);
    this.name = 'MastercardApiError';
    this.status = status;
    this.body = body;
    this.request = request;
  }
}

/** Substitutes `{name}` path params and URL-encodes the values. */
export function expandPath(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Missing path parameter "${name}" for ${template}`);
    return encodeURIComponent(value);
  });
}

/**
 * Builds a request function bound to one service.
 *
 * @param {object} opts
 * @param {string} opts.baseUrl        service base URL (sandbox or production)
 * @param {boolean} opts.dryRun        return the plan instead of calling
 * @param {string[]} opts.encryptPaths templated paths whose body needs JWE
 * @param {boolean} opts.idempotent    send an Idempotency-Key on writes
 */
export function createRequester({ baseUrl, dryRun = false, encryptPaths = [], idempotent = false }) {
  return async function request(method, pathTemplate, { body, pathParams, headers = {} } = {}) {
    const path = expandPath(pathTemplate, pathParams);
    const needsEncryption = encryptPaths.includes(pathTemplate);
    const { body: wireBody, encrypted } = needsEncryption
      ? maybeEncrypt(path, body)
      : { body, encrypted: false };

    const allHeaders = { ...headers };
    if (idempotent && method !== 'GET' && !allHeaders['Idempotency-Key']) {
      allHeaders['Idempotency-Key'] = randomUUID();
    }

    const plan = {
      method,
      path,
      url: new URL(path.replace(/^\//, ''), `${baseUrl.replace(/\/$/, '')}/`).toString(),
      headers: allHeaders,
      body: wireBody,
      encryptionRequired: needsEncryption,
      encrypted,
    };

    if (dryRun) return { dryRun: true, plan };

    const res = await mastercardFetch(plan.url, {
      method,
      body: wireBody,
      headers: allHeaders,
      baseUrl,
    });

    const text = await res.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    if (!res.ok) throw new MastercardApiError(res.status, parsed, plan);
    return { dryRun: false, plan, status: res.status, data: parsed };
  };
}

/** ISO-8601 with an explicit offset, which the BPC control schemas require. */
export function isoWithOffset(date = new Date()) {
  return `${date.toISOString().replace(/\.\d{3}Z$/, '')}+00:00`;
}
