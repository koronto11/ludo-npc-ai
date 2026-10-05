export async function api(path, options = {}) {
  let response;
  try { response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}) }); }
  catch (reason) { if(reason.name === 'AbortError') throw reason; throw new Error('本地 Python 服务未连接，当前修改尚未保存到文件'); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || body.details?.[0]?.msg || (response.status === 409 ? '项目版本冲突，请重新打开或另存副本' : response.status === 401 ? '本机会话已失效，请重新连接服务' : '本地服务请求失败'));
    error.code = body.error; error.status = response.status; throw error;
  }
  return body;
}
