import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const relative = process.platform === 'win32'
  ? '../../backend/.venv/Scripts/python.exe'
  : '../../backend/.venv/bin/python';
const localPython = fileURLToPath(new URL(relative, import.meta.url));
export const pythonExecutable = process.env.NPCS_TEST_PYTHON
  || (existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3');
