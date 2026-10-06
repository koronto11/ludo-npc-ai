import {t,tm} from './i18n.js';
import {getLanguage} from './i18n.js';
import {translateError} from './i18nCore.js';
let sessionRecovery;

async function send(path, options) {
  let response;
  try { response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', 'Accept-Language':getLanguage(), ...options.headers }, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}) }); }
  catch (reason) { if(reason.name === 'AbortError') throw reason; throw new Error(t("本地 Python 服务未连接，当前修改尚未保存到文件")); }
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function recoverSession() {
  if (!sessionRecovery) {
    sessionRecovery = send('/api/session', { credentials: 'same-origin' }).then(({response,body}) => {
      if (!response.ok || body.ready !== true) throw new Error(t("本地连接未恢复，请确认服务正在运行；当前页面的编辑仍保留"));
    }).finally(() => { sessionRecovery = null; });
  }
  return sessionRecovery;
}

export async function api(path, options = {}) {
  let { response, body } = await send(path, options);
  // Only the local guard's rejection is safe to retry: it runs before handlers.
  // Provider authentication errors, network failures and completed jobs never enter this path.
  if (response.status === 401 && body.error === 'session_required' && path !== '/api/session' && path.startsWith('/api/')) {
    await recoverSession();
    options.signal?.throwIfAborted();
    ({ response, body } = await send(path, options));
  }
  if (!response.ok) {
    const error = new Error(translateError(body,response.status,getLanguage()));
    error.code = body.error; error.status = response.status; throw error;
  }
  return body;
}
